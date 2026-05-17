# ytdlp-resolver

Microserviço que recebe uma URL de embed/página e devolve o stream direto via `yt-dlp`.

## Endpoints

- `GET /health` → `{ ok: true }`
- `POST /resolve` (Authorization: `Bearer $RESOLVER_TOKEN`)
  ```json
  { "url": "https://...", "format": "best[protocol^=m3u8]/best[ext=mp4]/best" }
  ```
  Resposta:
  ```json
  {
    "streamUrl": "https://.../master.m3u8?token=...",
    "kind": "hls",
    "headers": { "Referer": "...", "User-Agent": "..." },
    "expiresAt": 1736000000000,
    "title": "Episódio 1"
  }
  ```

## Variáveis

| Nome             | Default                  | Descrição                                  |
| ---------------- | ------------------------ | ------------------------------------------ |
| `PORT`           | `8080`                   |                                            |
| `HOST`           | `0.0.0.0`                |                                            |
| `RESOLVER_TOKEN` | (vazio = aberto)         | Bearer token compartilhado com o Worker.   |
| `YTDLP_BIN`      | `/usr/local/bin/yt-dlp`  | Caminho do binário yt-dlp.                 |

## Deploy no Fly.io

```bash
cd services/ytdlp
flyctl launch --no-deploy --copy-config --name ytdlp-resolver --region gru
flyctl secrets set RESOLVER_TOKEN=$(openssl rand -hex 32)
flyctl deploy
flyctl scale count 1
```

A URL ficará em `https://ytdlp-resolver.fly.dev`. Configure no Worker:

```
YTDLP_SERVICE_URL=https://ytdlp-resolver.fly.dev
YTDLP_SERVICE_TOKEN=<mesmo RESOLVER_TOKEN>
```

`auto_stop_machines=stop` + `min_machines_running=0` faz o serviço dormir quando ocioso
(custo ~$0–2/mês em baixo tráfego; primeira request paga ~1s de cold start).

## Cache

LRU em memória (1000 entradas, TTL 5min) — barato e suficiente já que o Worker
também tem cache em Postgres. Reinicia limpo em cada cold start.

## Rate limit

60 req/min por IP (via `@fastify/rate-limit`).
