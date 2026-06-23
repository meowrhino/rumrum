// Helpers minúsculos compartidos por el resto de módulos.

export const $ = (sel, root = document) => root.querySelector(sel);

// Color estable por nombre (estilo Chatango: cada nick con su color). Hash
// simple del nombre → tono HSL; saturación y luz fijas para que siempre se lea
// sobre el fondo oscuro cálido de twoitter.
export function colorFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h}, 55%, 70%)`;
}

// Hora corta HH:MM a partir de un timestamp en ms.
export function hhmm(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
