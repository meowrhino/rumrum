# rumrum

chat anónimo multi-sala en tiempo real. el murmullo de fondo de mucha gente.

es también el **motor** de realtime que reutilizará [`toctoc`](https://github.com/meowrhino/toctoc) (el messenger privado). la pieza reutilizable es `src/conversation.ts` — agnóstica al producto: solo sabe de mensajes, orden y fan-out. la identidad/cuentas/membresía viven fuera.

## stack

cloudflare workers + **durable objects** (uno por sala) + **websocket hibernation** + sqlite embebido en el DO.

- **un DO por sala** (`idFromName(room)`): orden de mensajes fuerte y gratis.
- **hibernation api** (`acceptWebSocket`, no `ws.accept()`): el DO se desaloja de memoria cuando nadie habla pero las conexiones siguen vivas → no se pagan GB-s en idle.
- **sqlite en el DO**: los mensajes de la sala viven colocados con la lógica; `seq` autoincremental = orden + paginación.

## arquitectura

```
Worker (src/index.ts)
  /ws?room=<id>&name=<n>  →  idFromName(room)  →  ConversationDO
  resto                    →  ASSETS (public/)

ConversationDO (src/conversation.ts)   ← EL MOTOR (reutilizable por toctoc)
  acceptWebSocket  ·  webSocketMessage (persist + broadcast)  ·  sqlite
```

## correr en local

```bash
npm install
npm run dev          # wrangler dev — sirve public/ y el Worker
```

abre la URL que imprime wrangler. para probar varias salas: `?room=loquesea`.
para chatear contigo mismo abre dos pestañas en la misma sala.

## desplegar

```bash
npm run deploy
```

(requiere `wrangler login`. la migración `v1` crea el DO con sqlite la primera vez.)

## qué falta (siguiente vuelta, sigue minimal)

- presencia ("N conectados") y "está escribiendo…" (efímeros, broadcast sin persistir)
- paginación de historial hacia atrás (cursor por `seq`)
- web component embebible (`<rumrum-chat room="...">`) para meterlo en otras webs
- anti-spam (rate limit por IP, como en twoitter)
