import { ConversationDO } from "./conversation";

export interface Env {
  CHAT: DurableObjectNamespace<ConversationDO>;
  ASSETS: Fetcher;
}

// El DO debe re-exportarse desde el entrypoint del Worker.
export { ConversationDO };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /ws?room=<id>&name=<nombre> → enruta el WebSocket al DO de esa sala.
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      const room = (url.searchParams.get("room") || "lobby").slice(0, 64) || "lobby";
      // idFromName: mismo nombre de sala → siempre el mismo DO.
      const id = env.CHAT.idFromName(room);
      return env.CHAT.get(id).fetch(request);
    }

    // Todo lo demás: ficheros estáticos (public/).
    return env.ASSETS.fetch(request);
  },
};
