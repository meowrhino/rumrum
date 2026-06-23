import { $, colorFor, hhmm } from "./util.js";

// Pinta la sala estilo Chatango: filas densas "HH:MM nombre mensaje", con el
// nombre en su color estable. Todo con textContent (nunca innerHTML) → el texto
// del usuario queda escapado por construcción.

const list = () => $("#messages");

export function addMessage(m) {
  const li = document.createElement("li");
  li.className = "msg";

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = hhmm(m.ts);

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = m.author;
  name.style.color = colorFor(m.author);

  const body = document.createElement("span");
  body.className = "body";
  body.textContent = m.body;

  li.append(time, name, body);

  const el = list();
  el.appendChild(li);
  el.scrollTop = el.scrollHeight;
}

export function renderHistory(messages) {
  list().innerHTML = "";
  messages.forEach(addMessage);
}
