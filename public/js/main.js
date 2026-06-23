// Punto de entrada: lee sala + nombre, conecta el WebSocket y cablea el form.
import { $ } from "./util.js";
import { getRoom, getName } from "./session.js";
import { connectRoom } from "./ws.js";
import { addMessage, renderHistory } from "./render.js";

const room = getRoom();
const name = getName();
$("#room").textContent = room;
$("#me").textContent = name;

const conn = connectRoom({ room, name, onHistory: renderHistory, onMessage: addMessage });

$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#body");
  const body = input.value.trim();
  if (!body) return;
  conn.send(body);
  input.value = "";
});
