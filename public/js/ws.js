// Conexión WebSocket a una sala, con reconexión automática. El protocolo (JSON
// con {type:"history"|"msg"|"color"}) lo define el motor (ConversationDO).
//   history → { messages, profiles }   (snapshot inicial)
//   msg     → un mensaje (user o system)
//   color   → { name, color }          (alguien cambió su color)

export function connectRoom({ room, name, color, onHistory, onMessage, onColor }) {
  let ws;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const url =
    `${proto}://${location.host}/ws` +
    `?room=${encodeURIComponent(room)}` +
    `&name=${encodeURIComponent(name)}` +
    `&color=${encodeURIComponent(color)}`;

  function open() {
    ws = new WebSocket(url);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "history") onHistory(data.messages, data.profiles || {});
      else if (data.type === "msg") onMessage(data);
      else if (data.type === "color") onColor(data);
    };
    // El DO hiberna o la red cae → el socket se cierra; reabrimos solos.
    ws.onclose = () => setTimeout(open, 1000);
  }
  open();

  return {
    send(body) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "msg", body }));
      }
    },
    setColor(color) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "color", color }));
      }
    },
  };
}
