// Conexión WebSocket a una sala, con reconexión automática. El protocolo (JSON
// con {type:"history"|"msg"}) lo define el motor (ConversationDO en el backend).

export function connectRoom({ room, name, onHistory, onMessage }) {
  let ws;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const url = `${proto}://${location.host}/ws?room=${encodeURIComponent(room)}&name=${encodeURIComponent(name)}`;

  function open() {
    ws = new WebSocket(url);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "history") onHistory(data.messages);
      else if (data.type === "msg") onMessage(data);
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
  };
}
