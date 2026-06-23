// Helpers minúsculos compartidos por el resto de módulos.

export const $ = (sel, root = document) => root.querySelector(sel);

// Color estable por nombre (estilo Chatango: cada nick con su color). Hash
// simple del nombre → tono HSL, y de ahí a HEX para que el <input type="color">
// pueda mostrarlo. Saturación y luz fijas para que siempre se lea sobre el
// fondo oscuro cálido de twoitter. Es solo el color POR DEFECTO: cada quien
// puede elegir el suyo (ver session.js / el selector de la cabecera).
export function colorFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return hslToHex(h, 55, 70);
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Hora corta HH:MM a partir de un timestamp en ms.
export function hhmm(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Clave de día LOCAL (YYYY-MM-DD) — sirve para detectar el cambio de día entre
// mensajes consecutivos. Local (no UTC) para que el corte coincida con la
// medianoche de quien mira.
export function dayKey(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Etiqueta amable para el separador de día: "hoy" / "ayer" / "3 jun 2026".
// `now` es inyectable para poder testearlo sin depender del reloj. "Ayer" se
// calcula por aritmética de CALENDARIO (no restando 24h fijas), así respeta los
// días de 23/25h de los cambios de hora.
export function dayLabel(ts, now = Date.now()) {
  const k = dayKey(ts);
  if (k === dayKey(now)) return "hoy";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (k === dayKey(yesterday.getTime())) return "ayer";
  const d = new Date(ts);
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}
