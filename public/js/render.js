import { $, colorFor, hhmm, dayKey, dayLabel } from "./util.js";

// Pinta la sala estilo Chatango: filas densas "HH:MM nombre mensaje", con el
// nombre en su color (el elegido por esa persona, o el determinista por
// defecto). Inserta un separador antes del primer mensaje de cada día, y pinta
// los avisos de conexión (kind:"system") como una línea aparte. Todo con
// textContent (nunca innerHTML) → el texto del usuario queda escapado.

const list = () => $("#messages");

let colors = {}; // nombre → color elegido (snapshot del DO + cambios en vivo)
let lastDay = null; // dayKey del último mensaje pintado, para los separadores

const colorOf = (name) => colors[name] || colorFor(name);

// Si este mensaje cae en un día distinto al anterior, mete un separador.
function daySeparatorIfNeeded(ts) {
  const key = dayKey(ts);
  if (key === lastDay) return;
  lastDay = key;
  const li = document.createElement("li");
  li.className = "daysep";
  const span = document.createElement("span");
  span.textContent = dayLabel(ts);
  li.appendChild(span);
  list().appendChild(li);
}

export function addMessage(m) {
  // ¿Estaba el usuario pegado (o casi) al fondo? Si subió a leer historial, no
  // lo arrancamos de vuelta abajo con cada mensaje/aviso de conexión entrante.
  const box = list();
  const wasAtBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;

  daySeparatorIfNeeded(m.ts);

  const li = document.createElement("li");
  const time = document.createElement("span");
  time.className = "time";
  time.textContent = hhmm(m.ts);

  if (m.kind === "system") {
    li.className = "msg system";
    const text = document.createElement("span");
    text.className = "sys";
    text.textContent = `${m.author} ${m.body}`;
    li.append(time, text);
  } else {
    li.className = "msg";
    li.dataset.author = m.author; // para recolorear al vuelo

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = m.author;
    name.style.color = colorOf(m.author);

    const body = document.createElement("span");
    body.className = "body";
    body.textContent = m.body;

    li.append(time, name, body);
  }

  box.appendChild(li);
  if (wasAtBottom) box.scrollTop = box.scrollHeight;
}

export function renderHistory(messages, profiles) {
  colors = profiles || {};
  lastDay = null;
  list().innerHTML = "";
  messages.forEach(addMessage);
}

// Alguien (quizá yo) cambió su color: actualiza el mapa y recolorea los nombres
// ya pintados de esa persona. Comparamos dataset.author en JS para no construir
// un selector con un nombre arbitrario (evita roturas / inyección de selector).
export function applyColor(name, color) {
  colors[name] = color;
  for (const li of list().querySelectorAll(".msg")) {
    if (li.dataset.author === name) {
      const el = li.querySelector(".name");
      if (el) el.style.color = color;
    }
  }
}
