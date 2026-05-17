# Easy Cloud Share / Streaming Platform

Plataforma web full-stack que combina uma **nuvem pessoal** de arquivos (estilo Google Drive) com uma **dashboard de streaming** estilo Netflix, alimentada por links externos compartilháveis entre usuários.

Stack: **TanStack Start v1 + React 19 + Vite 7 + Tailwind v4 + Supabase (Postgres / Auth / Storage)**, com deploy alvo em **Cloudflare Workers**.

---

## Sumário

1. [Arquitetura geral](#arquitetura-geral)
2. [Estrutura de pastas](#estrutura-de-pastas)
3. [Rotas e fluxo de navegação](#rotas-e-fluxo-de-navegação)
4. [Camada de dados (Supabase)](#camada-de-dados-supabase)
5. [Domínios funcionais](#domínios-funcionais)
6. [Build, dev e deploy](#build-dev-e-deploy)
7. [Variáveis de ambiente](#variáveis-de-ambiente)
8. [Removendo a dependência do Lovable](#removendo-a-dependência-do-lovable)

---

## Arquitetura geral

```
┌────────────────────────────────────────────────────────────┐
│  Browser (React 19 + TanStack Router file-based)           │
│  ├─ /app           → Minha Nuvem (admin pessoal)           │
│  ├─ /streaming/*   → Catálogo público estilo Netflix       │
│  └─ /s/:token      → Link público de compartilhamento      │
└──────────────┬─────────────────────────────────────────────┘
               │ supabase-js (anon key + RLS)
               │ createServerFn() RPC c/ Bearer JWT
               ▼
┌────────────────────────────────────────────────────────────┐
│  TanStack Start SSR (Cloudflare Worker — src/server.ts)    │
│  ├─ Server functions (createServerFn)                      │
│  ├─ Server routes    (src/routes/api/...)                  │
│  └─ Middlewares: attachSupabaseAuth, requireSupabaseAuth   │
└──────────────┬─────────────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────────────┐
│  Supabase                                                  │
│  ├─ Postgres (users, folders, files) + RLS                 │
│  ├─ Auth (telefone / e-mail)                               │
│  └─ Storage bucket: cloud-files                            │
└────────────────────────────────────────────────────────────┘
```

- **SSR**: o ponto de entrada do Worker é `src/server.ts`, que envolve o handler oficial do TanStack Start com captura de erros (`src/lib/error-capture.ts`) e uma página branded (`src/lib/error-page.ts`).
- **Router**: `src/router.tsx` cria o `QueryClient` e o `Router` a partir da `routeTree.gen.ts` (auto‑gerada pelo plugin do TanStack Router).
- **Shell HTML**: `src/routes/__root.tsx` define `<html>/<head>/<body>` via `shellComponent`.
- **Auth bridge**: `src/start.ts` registra `attachSupabaseAuth` como `functionMiddleware` global; toda chamada `createServerFn` do client envia automaticamente `Authorization: Bearer <jwt>`.

---

## Estrutura de pastas

```
.
├─ src/
│  ├─ routes/                      # File-based routing (TanStack Router)
│  │  ├─ __root.tsx                # Shell HTML + providers
│  │  ├─ index.tsx                 # Landing page
│  │  ├─ activate.tsx              # Ativação por código
│  │  ├─ admin.tsx                 # Painel administrativo interno
│  │  ├─ app.tsx                   # "Minha nuvem" (arquivos/pastas)
│  │  ├─ s.$token.tsx              # Compartilhamento público por token
│  │  ├─ streaming.tsx             # Layout Netflix (header + <Outlet/>)
│  │  ├─ streaming.index.tsx       # Home do catálogo (carrosséis)
│  │  ├─ streaming.watch.$id.tsx   # Player + episódios + similares
│  │  └─ streaming.admin.tsx       # Cadastro/curadoria + seed demo
│  │
│  ├─ components/
│  │  ├─ cloud/                    # UI da nuvem pessoal
│  │  │  ├─ FileItem.tsx           # Item de arquivo + badge "Play"
│  │  │  ├─ FolderItem.tsx
│  │  │  ├─ Toolbar.tsx            # Upload, novo link, publicar
│  │  │  ├─ PreviewCard.tsx        # Preview img/vídeo/áudio/iframe
│  │  │  ├─ ExternalLinkViewer.tsx # Player p/ links externos
│  │  │  ├─ DragLayer.tsx          # Drag & drop overlay
│  │  │  ├─ SelectionManager.ts    # Seleção multi-item (Set<key>)
│  │  │  └─ types.ts               # FileRow, FolderRow, helpers MIME
│  │  ├─ ui/                       # shadcn/ui (Radix + cva)
│  │  └─ ThemeToggle.tsx
│  │
│  ├─ lib/
│  │  ├─ cloud.ts                  # Login/registro por telefone, quota,
│  │  │                            # publicUrl(), formatBytes()
│  │  ├─ streaming.ts              # fetchCatalog, hooks de progresso/
│  │  │                            # favoritos/histórico (localStorage),
│  │  │                            # seedDemoCatalog
│  │  ├─ activation.ts             # Validação de códigos de ativação
│  │  ├─ utils.ts                  # cn() (tailwind-merge)
│  │  ├─ error-capture.ts          # Hook global de erros SSR
│  │  └─ error-page.ts             # HTML branded 500
│  │
│  ├─ integrations/supabase/       # ⚠ AUTO-GERADO — não editar
│  │  ├─ client.ts                 # Browser client (anon, persistSession)
│  │  ├─ client.server.ts          # Admin client (service role, bypassa RLS)
│  │  ├─ auth-middleware.ts        # requireSupabaseAuth p/ serverFn
│  │  ├─ auth-attacher.ts          # attachSupabaseAuth (Bearer no RPC)
│  │  └─ types.ts                  # Tipos gerados do schema Postgres
│  │
│  ├─ hooks/use-mobile.tsx
│  ├─ router.tsx                   # createRouter() + QueryClient
│  ├─ server.ts                    # Worker entry (envolve Start)
│  ├─ start.ts                     # createStart() + middlewares globais
│  ├─ routeTree.gen.ts             # ⚠ AUTO-GERADO pelo plugin
│  └─ styles.css                   # Tailwind v4 + tokens semânticos OKLCH
│
├─ supabase/
│  ├─ config.toml                  # project_id
│  └─ migrations/                  # SQL versionado
│
├─ vite.config.ts                  # @lovable.dev/vite-tanstack-config
├─ wrangler.jsonc                  # Config Cloudflare Worker
├─ tsconfig.json                   # strict: true, alias @/*
├─ eslint.config.js
└─ package.json
```

---

## Rotas e fluxo de navegação

| Rota                          | Arquivo                          | Descrição                                                                 |
| ----------------------------- | -------------------------------- | ------------------------------------------------------------------------- |
| `/`                           | `routes/index.tsx`               | Landing / entrada do produto.                                             |
| `/activate`                   | `routes/activate.tsx`            | Ativação por código (libera quota inicial).                               |
| `/admin`                      | `routes/admin.tsx`               | Painel admin interno (códigos, usuários).                                 |
| `/app`                        | `routes/app.tsx`                 | **Minha Nuvem** — árvore de pastas, upload, links externos, publicar.     |
| `/s/$token`                   | `routes/s.$token.tsx`            | Visualização pública de um arquivo por `share_token`.                     |
| `/streaming`                  | `routes/streaming.tsx`           | Layout Netflix (header fixo, busca, `<Outlet/>`).                         |
| `/streaming` (index)          | `routes/streaming.index.tsx`     | Hero + carrosséis (categorias, Continuar, Minha Lista, Indicados galera). |
| `/streaming/watch/$id`        | `routes/streaming.watch.$id.tsx` | Player (HLS/MP4/iframe) + episódios da pasta + similares.                 |
| `/streaming/admin`            | `routes/streaming.admin.tsx`     | Cadastro/curadoria + seed de catálogo demo.                               |

Convenção TanStack Router: arquivos com **ponto** geram aninhamento (`streaming.watch.$id.tsx` → `/streaming/watch/:id`). `routeTree.gen.ts` é regenerado pelo `@tanstack/router-plugin` em dev/build — **nunca editar à mão**.

---

## Camada de dados (Supabase)

### Tabelas principais (`public`)

| Tabela        | Campos relevantes                                                                                                | Observações                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `users`       | `id`, `phone`, `used_bytes`, `quota_bytes`, `activated_at`, `activation_code`                                    | Login por telefone (ver `src/lib/cloud.ts`).           |
| `folders`     | `id`, `name`, `parent_id`, `user_id`                                                                             | Árvore com self-FK em `parent_id`.                     |
| `files`       | `id`, `name`, `storage_path`, `size_bytes`, `mime_type`, `share_token`, `folder_id`, `user_id`, `external_url`, `poster_url`, `description`, `is_public` | `external_url` = links externos; `is_public` = aparece no catálogo. |

### Migrations

Versionadas em `supabase/migrations/`. Highlights:

- `…fffe9` / `…409fc` / `…e5cf35`: schema base (users, folders, files) + RLS.
- `…e1db91`: adiciona `external_url` em `files`.
- `…967f96`: adiciona `poster_url` e `description` (Streaming).
- `…0f3428`: adiciona `is_public` + índice (compartilhamento global).

### RLS — padrão usado

Cada tabela filtra por `user_id = auth.uid()`. Para o catálogo público de streaming, há uma policy adicional em `files`:

```sql
-- pseudo
USING (is_public = true OR user_id = auth.uid())
```

### Clientes Supabase

| Arquivo                          | Quando usar                                                  |
| -------------------------------- | ------------------------------------------------------------ |
| `integrations/supabase/client.ts`        | **Browser** — auth, realtime, queries com RLS.       |
| `integrations/supabase/client.server.ts` | **Server** — service role, **bypassa RLS** (admin). |
| `integrations/supabase/auth-middleware.ts` | `requireSupabaseAuth` — protege serverFn.           |
| `integrations/supabase/auth-attacher.ts`   | `attachSupabaseAuth` — anexa Bearer no RPC.         |

---

## Domínios funcionais

### 1. Minha Nuvem (`/app`)

- Listagem de `folders` + `files` por `folder_id`, breadcrumbs e navegação.
- Upload via `supabase.storage.from("cloud-files").upload(...)`.
- **Links externos**: armazenados em `files.external_url` (sem upload físico). MIME especial `application/x-external-link`.
- **Publicar no Play**: toggle `is_public` na `Toolbar`. Badge "Play" em `FileItem` quando público.
- Seleção multi (`SelectionManager.ts`), drag & drop (`DragLayer.tsx`), preview (`PreviewCard.tsx`).
- Compartilhamento público via `/s/:share_token`.

### 2. Streaming (`/streaming`)

`src/lib/streaming.ts` concentra:

- `fetchCatalog(userId)`: `SELECT * FROM files WHERE external_url IS NOT NULL AND (is_public = true OR user_id = $1)`.
- Hooks `useFavorites`, `useHistory`, `useProgress`: persistência em `localStorage`.
- `seedDemoCatalog`: popula trailers públicos para demo.

Páginas:

- **Home**: hero + carrosséis (`Row`). Categorias = nomes das pastas do dono. Fileira **"Indicados da galera"** filtra `is_public && user_id !== me` exibindo a pasta de origem como rótulo.
- **Watch**: player com `hls.js` (HLS adaptativo, seleção de qualidade), `<video>` nativo (MP4) e iframe (YouTube/Vimeo). Popover de ajustes (velocidade 0.5–2x, legendas, ±10s). Aba lateral com episódios (mesmo `folder_id`/dono) e similares.
- **Admin**: CRUD de títulos + seed.

### 3. Compartilhamento por link (`/s/:token`)

Resolve `files` por `share_token` (público), sem auth.

---

## Build, dev e deploy

```bash
bun install              # ou npm/pnpm
bun run dev              # vite dev (HMR + SSR)
bun run build            # build produção (Worker bundle)
bun run build:dev        # build em modo development
bun run preview          # serve build local
bun run lint             # eslint
bun run format           # prettier --write
```

**Runtime de produção**: Cloudflare Worker (`wrangler.jsonc` → `main: src/server.ts`, `nodejs_compat`).

> ⚠ O Worker **não** roda Node real. Evite `child_process`, `sharp`, `puppeteer`, `fs.watch`, bindings nativos. APIs seguras: `fs`, `path`, `crypto`, `Buffer`, `stream`, `fetch`.

### Server functions

Padrão obrigatório (ver `src/integrations/supabase/auth-middleware.ts`):

```ts
// src/lib/things.functions.ts
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listThings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("things").select("*");
    return { items: data };
  });
```

Chamar do client via `useServerFn(listThings)` + React Query.

---

## Variáveis de ambiente

| Nome                              | Onde                  | Para quê                                |
| --------------------------------- | --------------------- | --------------------------------------- |
| `VITE_SUPABASE_URL`               | client (build-time)   | URL do projeto Supabase.                |
| `VITE_SUPABASE_PUBLISHABLE_KEY`   | client (build-time)   | Anon key (com RLS).                     |
| `VITE_SUPABASE_PROJECT_ID`        | client                | Referência do projeto.                  |
| `SUPABASE_URL`                    | server (runtime)      | Igual à acima, no Worker.               |
| `SUPABASE_PUBLISHABLE_KEY`        | server                | Anon key no servidor.                   |
| `SUPABASE_SERVICE_ROLE_KEY`       | server (**secreto**)  | Admin client — **nunca expor**.         |

No Cloudflare: usar `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`.

---

## Removendo a dependência do Lovable

O projeto foi inicializado no Lovable, mas o código é portável. Tudo da Lovable é **complementar** — Supabase, TanStack Start e Cloudflare são padrão de mercado. Para migrar:

### 1. Remover pacotes Lovable

```bash
bun remove @lovable.dev/vite-tanstack-config
```

Esse pacote agrega `@tanstack/start/plugin`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `vite-tsconfig-paths`, `@cloudflare/vite-plugin`, dedupe de React/TanStack, injeção de `VITE_*`, alias `@/*`, lovable componentTagger (dev) e detecção de sandbox. Você precisa **recriar manualmente** essas peças.

### 2. Reescrever `vite.config.ts`

```ts
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { cloudflare } from "@cloudflare/vite-plugin";
import path from "node:path";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({ server: { entry: "src/server.ts" } }),
    react(),
    cloudflare(), // remova se for deployar fora do Cloudflare
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"],
  },
  server: { host: true, port: 5173, strictPort: true },
});
```

Instale o que vier faltando:

```bash
bun add -d @vitejs/plugin-react @tailwindcss/vite vite-tsconfig-paths @cloudflare/vite-plugin
```

### 3. Reassumir os arquivos "auto-gerados"

Estes 4 arquivos são reescritos pelo Lovable a cada execução. Após desconectar, **eles passam a ser seus** — comite e edite normalmente:

- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/client.server.ts`
- `src/integrations/supabase/auth-middleware.ts`
- `src/integrations/supabase/auth-attacher.ts`
- `src/integrations/supabase/types.ts` ← regenerar com `supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts`
- `.env` ← passe a gerenciar manualmente (ou via Vault do seu host)

Mantenha o conteúdo atual como base — os contratos (`supabase`, `supabaseAdmin`, `requireSupabaseAuth`, `attachSupabaseAuth`) já estão corretos.

### 4. Substituir o SSR error wrapper (opcional)

`src/server.ts` envolve o handler para mostrar uma página branded em 500. Você pode mantê-lo como está; apenas troque o conteúdo de `src/lib/error-page.ts` pela sua marca.

### 5. Migrar do Supabase gerenciado pelo Lovable Cloud

Lovable Cloud **é** um projeto Supabase. Para migrar:

1. Crie um projeto novo em [supabase.com](https://supabase.com).
2. Aplique as migrations em ordem:
   ```bash
   supabase link --project-ref <NOVO_REF>
   supabase db push    # aplica supabase/migrations/*
   ```
3. Exporte dados do projeto atual (Studio → Database → Backups, ou `pg_dump`) e importe no novo.
4. Recrie o bucket de Storage `cloud-files` (público para leitura, escrita só auth).
5. Atualize as variáveis (`VITE_SUPABASE_URL`, `..._PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).

### 6. Deploy fora do Lovable

**Cloudflare Workers** (recomendado — já configurado):

```bash
bun add -d wrangler
bunx wrangler deploy
```

`wrangler.jsonc` já aponta para `src/server.ts`. Configure os secrets:

```bash
bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
bunx wrangler secret put SUPABASE_URL
bunx wrangler secret put SUPABASE_PUBLISHABLE_KEY
```

**Outras opções** (remover `cloudflare()` do `vite.config.ts`):

- **Node**: trocar o entry SSR para o handler Node do TanStack Start e rodar com `node` atrás de um proxy.
- **Vercel / Netlify**: usar o adapter Node do TanStack Start em uma serverless function.
- **Docker**: build `vite build` + `node .output/server/index.mjs` (adapter Node).

### 7. Limpeza final

```bash
rm -rf .lovable supabase/.lovable
grep -rn "lovable" src/ vite.config.ts wrangler.jsonc   # confirmar zero refs
```

Verifique também:

- `.lovable/project.json` — pode remover.
- Quaisquer comentários ou badges "Edit on Lovable" no UI.
- `publishable_url` / `preview_url` em meta tags do `__root.tsx`, se houver.

Pronto — o projeto roda 100% independente em **TanStack Start + Supabase + Cloudflare** (ou outro host de sua escolha).

---

## Licença

Privado / proprietário (ajuste conforme necessário).
