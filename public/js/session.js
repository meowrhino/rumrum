// Identidad minimal del cliente. En rumrum el nombre es anónimo y local (no hay
// cuentas — eso es toctoc): se recuerda en localStorage y se pregunta una vez.

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
