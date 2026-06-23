// Identidad minimal del cliente. En rumrum el nombre es anónimo y local (no hay
// cuentas — eso es toctoc): se recuerda en localStorage y se pregunta una vez.
// El color también es local en este dispositivo, pero se sincroniza a la sala
// (el resto lo ve) vía el perfil que guarda el DO.
import { colorFor } from "./util.js";

export function getRoom() {
  const params = new URLSearchParams(location.search);
  return params.get("room") || location.hash.slice(1) || "lobby";
}

export function getName() {
  let name = localStorage.getItem("rumrum_name");
  if (!name) {
    name = (prompt("¿tu nombre?") || "anon").slice(0, 25) || "anon";
    localStorage.setItem("rumrum_name", name);
  }
  return name;
}

// Color elegido (hex) o, si nunca eligió, el determinista por nombre.
export function getColor() {
  return localStorage.getItem("rumrum_color") || colorFor(getName());
}

export function setColor(color) {
  localStorage.setItem("rumrum_color", color);
}
