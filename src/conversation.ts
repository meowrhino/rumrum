import { DurableObject } from "cloudflare:workers";
import type { Env } from "./index";

// Un mensaje tal y como viaja al cliente y como se guarda en SQLite.
// `type` (no `interface`) para que tenga índice de string implícito y
// satisfaga el genérico de sql.exec<T> (Record<string, SqlStorageValue>).
export type ChatMessage = {
  seq: number;
  author: string;
  body: string;
  ts: number;
};

// Estado que sobrevive a la hibernación, atado a cada conexión (máx 16 KB).
interface Attachment {
  name: string;
}

/**
 * ConversationDO — el MOTOR. Una instancia por conversación (sala en rumrum,
 * 1:1 o grupo en toctoc). Es agnóstico al producto: solo sabe de mensajes,
 * orden y fan-out en tiempo real. La identidad/cuentas/membresía viven fuera
 * (en el Worker + D1), no aquí.
 *
 * Realtime vía WebSocket Hibernation API (`acceptWebSocket`, no `ws.accept()`):
 * el DO se desaloja de memoria cuando no hay actividad pero los clientes
 * siguen conectados, así no se acumulan cargos de Duration mientras está idle.
 */
export class ConversationDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Esquema: solo se ejecuta el CREATE; barato y idempotente.
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          seq    INTEGER PRIMARY KEY AUTOINCREMENT,
          author TEXT    NOT NULL,
          body   TEXT    NOT NULL,
          ts     INTEGER NOT NULL
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

    const { 0: client, 1: server } = new WebSocketPair();
    // acceptWebSocket (no ws.accept) → la conexión es hibernable.
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ name } satisfies Attachment);

    // Al conectar, mandamos el historial reciente para pintar la sala.
    server.send(JSON.stringify({ type: "history", messages: this.recent(50) }));

    return new Response(null, { status: 101, webSocket: client });
  }

  // Llega un mensaje de un cliente: persiste y reparte a todos los conectados.
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;
    let data: { type?: string; body?: unknown };
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (data.type !== "msg" || typeof data.body !== "string") return;

    const body = data.body.trim().slice(0, 1000);
    if (!body) return;

    const att = ws.deserializeAttachment() as Attachment | null;
    const author = att?.name ?? "anon";
    const ts = Date.now();

    // Persist first: el rowid autoincremental nos da orden total gratis.
    const row = this.ctx.storage.sql
      .exec<{ seq: number }>(
        "INSERT INTO messages (author, body, ts) VALUES (?, ?, ?) RETURNING seq",
        author,
        body,
        ts,
      )
      .one();

    const msg: ChatMessage = { seq: row.seq, author, body, ts };
    const blob = JSON.stringify({ type: "msg", ...msg });

    // Broadcast a todas las conexiones vivas (sobrevive a hibernación: el
    // runtime mantiene la lista, no necesitamos un Map en memoria).
    for (const peer of this.ctx.getWebSockets()) {
      try {
        peer.send(blob);
      } catch {
        // peer muerto; el cierre lo limpia.
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      // ya cerrado
    }
  }

  // Últimos `limit` mensajes en orden cronológico ascendente.
  private recent(limit: number): ChatMessage[] {
    return this.ctx.storage.sql
      .exec<ChatMessage>(
        "SELECT seq, author, body, ts FROM messages ORDER BY seq DESC LIMIT ?",
        limit,
      )
      .toArray()
      .reverse();
  }
}
