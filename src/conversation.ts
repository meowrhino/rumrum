import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";

// Un mensaje tal y como viaja al cliente y como se guarda en SQLite.
// `type` (no `interface`) para que tenga índice de string implícito y
// satisfaga el genérico de sql.exec<T> (Record<string, SqlStorageValue>).
// `kind`: 'user' (lo escribe alguien) | 'system' (lo genera la sala: conexiones).
export type ChatMessage = {
  seq: number;
  author: string;
  body: string;
  ts: number;
  kind: string;
};

// Estado que sobrevive a la hibernación, atado a cada conexión (máx 16 KB).
interface Attachment {
  name: string;
  color: string;
  ip: string;
}

// Tope de mensajes por sala (ring buffer): al pasarlo se borran los más viejos.
// Acota el storage del DO (y su coste), defiende del llenado por abuso y hace
// que una sala pública sea "efímera de verdad".
const MAX_MESSAGES = 5000;

// Rate-limit por IP (token bucket): ráfaga de hasta RL_BURST, reponiendo
// RL_REFILL_PER_SEC por segundo.
const RL_BURST = 12;
const RL_REFILL_PER_SEC = 1;

// Color admitido = hex (#rgb / #rrggbb) o hsl(h, s%, l%). Validar en el
// servidor evita difundir algo que el cliente meta luego en un `style` y
// pueda colar CSS arbitrario.
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const HSL = /^hsl\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*\)$/i;
function cleanColor(c: unknown): string | null {
  if (typeof c !== "string") return null;
  const s = c.trim();
  if (s.length > 30) return null;
  return HEX.test(s) || HSL.test(s) ? s : null;
}

// Color por defecto determinista (mismo algoritmo y formato hex que el cliente
// en util.js) para quien aún no ha elegido uno.
function defaultColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return hslToHex(h, 55, 70);
}
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Reanunciamos "se ha conectado" como mucho una vez por persona cada ventana:
// así un refresco / caída de red / segunda pestaña no llena la sala de avisos.
const JOIN_WINDOW_MS = 5 * 60 * 1000;

/**
 * ConversationDO — el MOTOR. Una instancia por conversación (sala en rumrum,
 * 1:1 o grupo en toctoc). Es agnóstico al producto: solo sabe de mensajes,
 * orden, perfiles (color) y fan-out en tiempo real. La identidad/cuentas/
 * membresía viven fuera (en el Worker), no aquí.
 *
 * Realtime vía WebSocket Hibernation API (`acceptWebSocket`, no `ws.accept()`):
 * el DO se desaloja de memoria cuando no hay actividad pero los clientes
 * siguen conectados, así no se acumulan cargos de Duration mientras está idle.
 */
export class ConversationDO extends DurableObject<Env> {
  // Token bucket por IP, en memoria (se reinicia con la hibernación; basta para
  // frenar una ráfaga, que de todos modos mantiene el DO despierto).
  private buckets = new Map<string, { tokens: number; last: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const sql = this.ctx.storage.sql;
      sql.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          seq    INTEGER PRIMARY KEY AUTOINCREMENT,
          author TEXT    NOT NULL,
          body   TEXT    NOT NULL,
          ts     INTEGER NOT NULL,
          kind   TEXT    NOT NULL DEFAULT 'user'
        );
      `);
      // Migración para salas creadas con el esquema v0 (sin columna `kind`).
      try {
        sql.exec("ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'user'");
      } catch {
        // la columna ya existe → nada que hacer
      }
      sql.exec(`
        CREATE TABLE IF NOT EXISTS profiles (
          name       TEXT    PRIMARY KEY,
          color      TEXT    NOT NULL,
          lastJoinTs INTEGER NOT NULL DEFAULT 0
        );
      `);
    });
  }

  // El Worker enruta aquí el upgrade de WebSocket (ver src/index.ts).
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }

    const url = new URL(request.url);
    const name = (url.searchParams.get("name") || "anon").slice(0, 25) || "anon";
    const color = cleanColor(url.searchParams.get("color")) ?? defaultColor(name);
    const ip = request.headers.get("CF-Connecting-IP") || "local";

    // Registra la conexión (fija el color solo la primera vez) y decide si toca
    // anunciarla.
    const announce = this.touchProfile(name, color);

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server); // hibernable
    server.serializeAttachment({ name, color, ip } satisfies Attachment);

    // Historial + colores actuales → el cliente pinta la sala con cada nombre
    // en su color, también los mensajes antiguos.
    server.send(
      JSON.stringify({ type: "history", messages: this.recent(50), profiles: this.profiles() }),
    );

    // El aviso de conexión se persiste como mensaje de sistema: aparece en vivo
    // y queda en el historial para quien entre después.
    if (announce) this.system(name, "se ha conectado");

    return new Response(null, { status: 101, webSocket: client });
  }

  // Llega algo de un cliente: o cambia su color, o es un mensaje normal.
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;
    let data: { type?: string; body?: unknown; color?: unknown };
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    const att = ws.deserializeAttachment() as Attachment | null;
    const name = att?.name ?? "anon";
    const ip = att?.ip ?? "local";

    // Rate-limit por IP: si va por encima del presupuesto, descartamos en
    // silencio (vale tanto para mensajes como para cambios de color).
    if (!this.allow(ip)) return;

    // Cambio de color: persiste el perfil y lo difunde para que TODOS recoloreen
    // los mensajes de esta persona (incluido el historial ya pintado).
    if (data.type === "color") {
      const color = cleanColor(data.color);
      if (!color) return;
      // No-op: si ya tiene ese color, ni escribimos ni difundimos (un picker
      // dispara muchos valores intermedios al arrastrar; no inundamos la sala).
      const cur = this.ctx.storage.sql
        .exec<{ color: string }>("SELECT color FROM profiles WHERE name = ?", name)
        .toArray();
      if (cur.length && cur[0].color === color) return;
      this.ctx.storage.sql.exec(
        `INSERT INTO profiles (name, color, lastJoinTs) VALUES (?, ?, 0)
         ON CONFLICT(name) DO UPDATE SET color = excluded.color`,
        name,
        color,
      );
      ws.serializeAttachment({ name, color, ip } satisfies Attachment);
      this.broadcast(JSON.stringify({ type: "color", name, color }));
      return;
    }

    if (data.type !== "msg" || typeof data.body !== "string") return;
    const body = data.body.trim().slice(0, 1000);
    if (!body) return;

    this.append(name, body, "user");
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // ya cerrado
    }
  }

  // --- helpers -------------------------------------------------------------

  // Registra la conexión y decide si anunciarla (fuera de la ventana). El color
  // SOLO se fija al crear el perfil (fila nueva); en reconexiones NO se toca,
  // para no pisar el color elegido con el del query-param (que sería el por
  // defecto al entrar desde otro dispositivo o sin localStorage). El color solo
  // cambia luego vía el mensaje explícito {type:"color"}, que sí se difunde.
  // `lastJoinTs` solo avanza cuando SÍ anunciamos, así la ventana se mide desde
  // el último aviso y no se reinicia con cada reconexión.
  private touchProfile(name: string, color: string): boolean {
    const now = Date.now();
    const prev = this.ctx.storage.sql
      .exec<{ lastJoinTs: number }>("SELECT lastJoinTs FROM profiles WHERE name = ?", name)
      .toArray();
    const announce = prev.length === 0 || now - prev[0].lastJoinTs > JOIN_WINDOW_MS;
    this.ctx.storage.sql.exec(
      `INSERT INTO profiles (name, color, lastJoinTs) VALUES (?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         lastJoinTs = CASE WHEN ? = 1 THEN excluded.lastJoinTs ELSE profiles.lastJoinTs END`,
      name,
      color,
      announce ? now : 0,
      announce ? 1 : 0,
    );
    return announce;
  }

  // Inserta un mensaje (user/system) y lo reparte a todos los conectados.
  private append(author: string, body: string, kind: "user" | "system"): void {
    const ts = Date.now();
    const row = this.ctx.storage.sql
      .exec<{ seq: number }>(
        "INSERT INTO messages (author, body, ts, kind) VALUES (?, ?, ?, ?) RETURNING seq",
        author,
        body,
        ts,
        kind,
      )
      .one();
    // Ring buffer: conservamos solo los últimos MAX_MESSAGES (no-op mientras la
    // sala sea más corta que el tope).
    this.ctx.storage.sql.exec("DELETE FROM messages WHERE seq <= ?", row.seq - MAX_MESSAGES);
    this.broadcast(JSON.stringify({ type: "msg", seq: row.seq, author, body, ts, kind }));
  }

  // Token bucket por IP: true si la acción cabe en el presupuesto.
  private allow(ip: string): boolean {
    const now = Date.now();
    let b = this.buckets.get(ip);
    if (!b) {
      b = { tokens: RL_BURST, last: now };
      this.buckets.set(ip, b);
    }
    b.tokens = Math.min(RL_BURST, b.tokens + ((now - b.last) / 1000) * RL_REFILL_PER_SEC);
    b.last = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  private system(author: string, body: string): void {
    this.append(author, body, "system");
  }

  private broadcast(blob: string): void {
    for (const peer of this.ctx.getWebSockets()) {
      try {
        peer.send(blob);
      } catch {
        // peer muerto; el cierre lo limpia
      }
    }
  }

  // Mapa nombre → color para el snapshot inicial.
  private profiles(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const p of this.ctx.storage.sql
      .exec<{ name: string; color: string }>("SELECT name, color FROM profiles")
      .toArray()) {
      out[p.name] = p.color;
    }
    return out;
  }

  // Últimos `limit` mensajes en orden cronológico ascendente.
  private recent(limit: number): ChatMessage[] {
    return this.ctx.storage.sql
      .exec<ChatMessage>(
        "SELECT seq, author, body, ts, kind FROM messages ORDER BY seq DESC LIMIT ?",
        limit,
      )
      .toArray()
      .reverse();
  }
}
