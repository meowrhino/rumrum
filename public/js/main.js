// Punto de entrada: lee sala + nombre + color, conecta el WebSocket y cablea el
// formulario y el selector de color.
import { $ } from "./util.js";
import { getRoom, getName, getColor, setColor } from "./session.js";
import { connectRoom } from "./ws.js";
import { addMessage, renderHistory, applyColor } from "./render.js";

const room = getRoom();
const name = getName();
let color = getColor();

$("#room").textContent = room;
$("#me").textContent = name;
$("#me").style.color = color;

const picker = $("#mycolor");
picker.value = color;

const conn = connectRoom({
  room,
  name,
  color,
  onHistory: renderHistory,
  onMessage: addMessage,
  onColor: ({ name, color }) => applyColor(name, color),
});

// Mientras arrastro el selector (`input` dispara en cada tic): recoloreo mi
// nombre al instante en local, SIN tocar la red.
picker.addEventListener("input", () => {
  color = picker.value;
  $("#me").style.color = color;
  applyColor(name, color);
});

// Al soltar/cerrar el selector (`change` dispara una vez): lo recuerdo y aviso
// a la sala una sola vez para que todos lo vean.
picker.addEventListener("change", () => {
  color = picker.value;
  setColor(color);
  $("#me").style.color = color;
  applyColor(name, color);
  conn.setColor(color);
});

$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#body");
  const body = input.value.trim();
  if (!body) return;
  conn.send(body);
  input.value = "";
});
