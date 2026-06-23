// rumrum — cliente minimal. Conecta a una sala por WebSocket, pinta el
// historial y los mensajes nuevos en vivo, y envía lo que escribes.

const $ = (sel) => document.querySelector(sel);
const messagesEl = $("#messages");
const form = $("#composer");
const input = $("#body");

// Sala: ?room=foo o #foo en la URL; por defecto "lobby".
const params = new URLSearchParams(location.search);
const room = params.get("room") || location.hash.slice(1) || "lobby";

// Nombre: se recuerda en localStorage; si no hay, se pregunta una vez.
let name = localStorage.getItem("rumrum_name");
if (!name) {
  name = (prompt("¿tu nombre?") || "anon").slice(0, 25) || "anon";
  localStorage.setItem("rumrum_name", name);
}

$("#room").textContent = room;
$("#me").textContent = name;

let ws;

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const url = `${proto}://${location.host}/ws?room=${encodeURIComponent(room)}&name=${encodeURIComponent(name)}`;
  ws = new WebSocket(url);

  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === "history") {
      messagesEl.innerHTML = "";
      data.messages.forEach(addMessage);
    } else if (data.type === "msg") {
      addMessage(data);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  };

  // Reconexión simple si se cae (p.ej. el DO hiberna y el navegador reabre).
  ws.onclose = () => setTimeout(connect, 1000);
}

function addMessage(m) {
  const li = document.createElement("li");
  const who = document.createElement("b");
  who.textContent = m.author;
  li.appendChild(who);
  li.appendChild(document.createTextNode(m.body));
  messagesEl.appendChild(li);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const body = input.value.trim();
  if (!body || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "msg", body }));
  input.value = "";
});

connect();
