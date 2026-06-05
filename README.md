# Nuvem Pública / NuvemPlay

> Plataforma híbrida de **armazenamento em nuvem pública** e **streaming de catálogo personalizado**, com 4 TB grátis por número de telefone, sem senhas, rodando 100 % no edge (Cloudflare Workers).

---

## Visão Geral

O projeto é composto por **duas frentes interligadas** que compartilham a mesma base de usuários, arquivos e pastas:

1. **Nuvem Pública** — Um gerenciador de arquivos estilo Google Drive, onde cada usuário (identificado por número de telefone) recebe 4 TB de espaço para upload, pastas, compartilhamento público via link (`/s/:token`) e curadoria de conteúdo.
2. **NuvemPlay** — Uma interface de streaming inspirada em Netflix, que consome o catálogo de arquivos (uploads próprios + links externos públicos da comunidade) e os reproduz através de um player inteligente com fallback multi-nível.

A arquitetura é **serverless edge-first**: todo o backend roda como Cloudflare Worker via TanStack Start v1, sem servidor Node.js dedicado.

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Framework | TanStack Start v1 (React 19, SSR/SSG, file-based routing) |
| Build Tool | Vite 7 |
| Runtime | Cloudflare Workers (`nodejs_compat`) |
| Banco de Dados / Auth / Storage / Realtime | Supabase (via Lovable Cloud) |
| Estilo | Tailwind CSS v4 (`@import` nativo, tokens semânticos em `oklch`) |
| Animações | Framer Motion |
| Player de Vídeo | HLS.js + `<video>` nativo + iframe embeds |
| Ícones | Lucide React |
| Notificações | Sonner |
| Validação | Zod |

---

## Estrutura de Diretórios

```
src/
├── components/
│   ├── cloud/               # Gerenciador de arquivos (Nuvem Pública)
│   │   ├── DragLayer.tsx
│   │   ├── ExternalLinkViewer.tsx   # Modal de adicionar/editar links externos
│   │   ├── FileItem.tsx
│   │   ├── FolderItem.tsx
│   │   ├── PreviewCard.tsx
│   │   ├── SelectionManager.ts      # Hook de seleção multi-item
│   │   ├── Toolbar.tsx
│   │   └── types.ts         # Tipos: FileRow, FolderRow, detectExternalKind, etc.
│   └── ThemeToggle.tsx
├── hooks/
│   └── use-mobile.tsx
├── integrations/supabase/
│   ├── auth-attacher.ts     # Anexa Bearer token em serverFn RPCs
│   ├── auth-middleware.ts   # Middleware requireSupabaseAuth
│   ├── client.server.ts     # Cliente admin (service_role) — server-only
│   ├── client.ts            # Cliente browser (anon key + localStorage)
│   └── types.ts             # Tipos gerados do Supabase
├── lib/
│   ├── activation.ts        # Lógica de ativação de conta (códigos)
│   ├── admin.functions.ts   # Server functions do painel administrativo
│   ├── cloud.ts             # Cliente-side cloud: login, upload helpers, formatBytes
│   ├── error-capture.ts
│   ├── error-page.ts
│   ├── stream-resolver.server.ts  # Hefesto — resolve URLs de hospedagem → .m3u8/.mp4
│   ├── stream-sign.server.ts      # Assinatura HMAC de tokens de stream (proxy)
│   ├── stream.functions.ts        # ServerFn: resolveStreamFn (com allowlist anti-SSRF)
│   ├── streaming.ts         # Hooks: useFavorites, useHistory, useProgress, posterFor, seedDemoCatalog
│   └── utils.ts
├── routes/
│   ├── __root.tsx           # Layout raiz (head, providers)
│   ├── index.tsx            # Landing + login/registro por telefone
│   ├── app.tsx              # Nuvem Pública (gerenciador de arquivos)
│   ├── activate.tsx         # Tela de ativação por código
│   ├── admin.tsx            # Painel administrativo (códigos de ativação, estatísticas)
│   ├── s.$token.tsx         # Página pública de download por token
│   ├── streaming.tsx        # Layout do streaming (header fixo, busca, navegação)
│   ├── streaming.index.tsx  # Catálogo em carrosséis (hero, continuar, favoritos, em alta, indicados)
│   ├── streaming.admin.tsx  # Painel de curadoria do catálogo (CRUD de títulos + seed demo)
│   └── streaming.watch.$id.tsx  # Player de vídeo (HLS/MP4/iframe/resolved)
│   └── api/public/
│       ├── stream.play.ts   # Endpoint de proxy de stream (valida token HMAC, repassa com headers)
│       └── stream.seg.ts    # Proxy de segmentos HLS (mesma lógica)
├── router.tsx
├── server.ts
├── start.ts                 # Registro de attachSupabaseAuth em functionMiddleware
└── styles.css               # Tokens de design system em oklch
```

---

## Autenticação & Ativação

### Login por Telefone (sem senha)

```
[/] → informa telefone → loginOrRegister(phone)
```

- Não há senhas. O número é normalizado (`replace(/\D/g, '')`) e usado como identificador único.
- Se o número não existir na tabela `users`, uma conta é criada automaticamente com **4 TB de quota** (`quota_bytes = 4 * 1024^4`).
- O `userId` e o `phone` ficam em `localStorage` (`nuvem_user_id`, `nuvem_phone`).

### Fluxo de Ativação

```
usuário novo → is_public = false, activated_at = null → /activate
usuário ativado → activated_at preenchido → /app ou /streaming
```

- A conta só funciona após ativação com um **código de ativação de 5 dígitos** (ex: `7X2A9`).
- O admin gera códigos via `adminCreateActivationCodeFn` (server-side, `supabaseAdmin`).
- Ao resgatar (`redeemActivationCodeFn`), o código é marcado como `used` e o `users.activated_at` é preenchido.

### Admin

- Acesso via `/admin` (rota separada do painel de curadoria `/streaming/admin`).
- Login via `phone` + `PIN` de 4 dígitos, validados server-side contra secrets `ADMIN_PHONE` / `ADMIN_PIN`.
- Sessão admin via token HMAC assinado (`signStreamToken` com `u: "admin://session"`).
- Permite gerar códigos de ativação em lote e visualizar estatísticas de uso.

---

## Nuvem Pública (Gerenciador de Arquivos)

### Modelo de Dados

| Tabela | Chave | Descrição |
|---|---|---|
| `users` | `id` (UUID), `phone` (único), `used_bytes`, `quota_bytes`, `activated_at`, `activation_code` | Perfil do usuário |
| `folders` | `id`, `user_id`, `parent_id`, `name` | Pastas hierárquicas |
| `files` | `id`, `user_id`, `folder_id`, `name`, `storage_path`, `size_bytes`, `mime_type`, `external_url`, `poster_url`, `description`, `is_public`, `share_token` | Arquivo ou link externo |
| `activation_codes` | `id`, `code`, `used`, `created_at` | Códigos de ativação |
| `stream_cache` | `source_url`, `resolved_url`, `kind`, `headers`, `resolver`, `expires_at` | Cache de resolução de streams (Hefesto) |

### Funcionalidades

- **Upload**: Drag & drop (window-level + drop em pastas), input file multi-select. Cota validada antes do envio.
- **Pastas**: Criar, renomear, excluir (cascata remove arquivos internos do storage). Navegação em breadcrumbs.
- **Links externos**: Adicionar/editar URLs de qualquer provedor (YouTube, Vimeo, Terabox, etc.) com `mime_type = application/x-external-link`.
- **Seleção múltipla**: Shift+click para range, Ctrl+A para selecionar tudo, drag para mover.
- **Ações em lote**: Download (abre múltiplas abas), copiar links de compartilhamento, renomear, excluir, publicar/despublicar no Play.
- **Compartilhamento público**: Todo arquivo possui `share_token` (UUID). Acessível em `/s/:token` sem autenticação.
- **Publicação no Play**: Toggle `is_public` expõe o item no catálogo global (`/streaming`).

---

## NuvemPlay (Streaming)

### Catálogo

O catálogo (`fetchCatalog`) retorna:

- **Itens públicos** (`is_public = true`) de **todos os usuários** → seção "Indicados da galera".
- **Itens do usuário logado** (mesmo privados) → para curadoria no painel admin do streaming.

Cada item é um `Title = FileRow + { category?: string }`, onde `category` vem do nome da `folder`.

### Home do Streaming (`/streaming`)

Layout em carrosséis estilo Netflix:

1. **Hero** — primeiro item em destaque com poster full-bleed, sinopse e CTA "Assistir".
2. **Continuar assistindo** — últimos 30 itens do histórico local (`localStorage`).
3. **Minha lista** — favoritos local (`localStorage`).
4. **Em alta** — 10 itens aleatórios do catálogo.
5. **Indicados da galera** — itens públicos (`is_public = true`) de outros usuários.
6. **Por categoria** — agrupamento dinâmico por nome de pasta.

**Realtime**: Canal Supabase Realtime escuta `files` e `folders` para atualizar o catálogo sem refresh.

### Player (`/streaming/watch/:id`)

A página de reprodução resolve a fonte de vídeo em cascata:

```
1. URL direta .m3u8  → NativePlayer (HLS.js)
2. URL direta .mp4   → NativePlayer (<video>)
3. YouTube/Vimeo/Drive/Mega/etc → IframePlayer (embed oficial)
4. Hosts desconhecidos → ResolvedPlayer (chama Hefesto)
   4a. Hefesto resolve → NativePlayer via proxy (/api/public/stream/play)
   4b. Hefesto falha → IframePlayer (fallback) ou BlockedEmbedFallback (Terabox)
```

#### Player Nativo (NativePlayer)

- Suporta **HLS** via HLS.js (com level switching manual).
- Suporta **MP4** direto via `<video>`.
- Controles customizados: play/pause, volume, mudo, seek bar, fullscreen, velocidade (0.5x–2x), legendas (textTracks toggle).
- **Progresso salvo** em `localStorage` (`nflx:prog:${userId}`) — ao retornar, o vídeo continua do timestamp.
- **Histórico** (`nflx:hist:${userId}`) — mantém os últimos 30 títulos assistidos.
- **Favoritos** (`nflx:fav:${userId}`) — toggle com ícone de coração.
- **Auto-próximo**: ao terminar, navega para o próximo episódio da mesma pasta.

---

## Hefesto — Resolução de Streams

Módulo server-only (`src/lib/stream-resolver.server.ts`) que transforma URLs de páginas de hospedagem em URLs diretas de mídia (`.m3u8` ou `.mp4`).

### Tier 1: Extractors Worker-side

Regex e unpack de JavaScript executados no edge, sem dependências nativas:

| Host | Técnica |
|---|---|
| **Streamtape** | Regex no `robotlink` + substring para montar URL direta |
| **FileMoon / MixDrop** | Unpack do packed JS (dean-edwards) → busca `file:"...m3u8"` |
| **DoodStream** | Regex no `/pass_md5/<token>/<hash>` + fetch do endpoint pass |
| **Terabox & aliases** | Delega para Tier 2 (yt-dlp) — sempre usa proxy |
| **Genérico** | Fetch da página → unpack → regex por `.m3u8` / `.mp4` / `source:` |

### Tier 2: yt-dlp Microservice

Se o extractor worker-side falhar, chama um microserviço externo de yt-dlp:

```
POST {YTDLP_SERVICE_URL}/resolve
Body: { url: "..." }
```

- Timeout progressivo: 20s (hot) → 55s (cold-start).
- Token de autenticação via `YTDLP_SERVICE_TOKEN`.

### Tier 3: Proxy de Stream

Quando o stream resolvido precisa de headers customizados (ex: `Referer`) ou é Terabox, o backend assina um token HMAC com:

```json
{ "u": "https://cdn.../video.mp4", "h": { "Referer": "..." }, "e": 1748600000000 }
```

O navegador recebe uma URL proxy:

```
/api/public/stream/play?t=<token_assinado>
```

O endpoint `/api/public/stream/play` valida a assinatura, reescreve os headers necessários e faz `fetch` → `ReadableStream` para o cliente, mantendo os segredos server-side.

### Cache

Resultados de resolução são cacheados na tabela `stream_cache` com TTL de 5 minutos (ou 24h para passthrough), evitando re-extrair a mesma página.

### Segurança

- **Allowlist de hosts** (`ALLOWED_HOST_RE`): apenas domínios conhecidos podem ser resolvidos — protege contra SSRF.
- **Bloqueio de redes privadas** (`PRIVATE_NET_RE`): 10.x, 192.168.x, localhost, etc.

---

## Segurança

### RLS (Row Level Security)

As tabelas `users`, `files`, `folders`, `activation_codes` possuem RLS habilitado. O acesso anônimo (`anon`) é restrito; `authenticated` tem permissões de leitura/escrita nas próprias linhas (escopo por `user_id`).

> Nota: o projeto usa autenticação customizada por telefone (não Supabase Auth padrão). A coluna `user_id` em `files`/`folders` vincula ao `users.id`.

### Anti-SSRF

`resolveStreamFn` valida URLs contra:
1. Protocolo (`http:` ou `https:`)
2. Host contra regex de domínios permitidos
3. IPs privados bloqueados

### Admin

Credenciais admin (`ADMIN_PHONE`, `ADMIN_PIN`) são secrets do ambiente, nunca hardcoded no cliente. Login gera token HMAC server-side.

---

## Fluxos Principais

### Novo Usuário

```
[/] → digita telefone → loginOrRegister() → criado em users (inativo)
→ /activate → digita código de ativação → redeemActivationCodeFn()
→ users.activated_at = now → /app
```

### Upload + Publicação no Play

```
/app → upload de arquivo OU adicionar link externo
→ seleciona arquivo → "Publicar no Play" → is_public = true
→ /streaming → item aparece no catálogo global
```

### Assistir um Título

```
/streaming → clica em título → /streaming/watch/:id
→ busca file no Supabase → resolve playUrl
→ se .m3u8/.mp4 → NativePlayer
→ se embed conhecido → IframePlayer
→ se desconhecido → resolveStreamFn (Hefesto)
  → resolve ok + proxy → NativePlayer via /api/public/stream/play
  → resolve falha → fallback iframe ou mensagem de erro (Terabox)
→ onProgress salva timestamp em localStorage
```

---

## Variáveis de Ambiente

| Variável | Contexto | Descrição |
|---|---|---|
| `VITE_SUPABASE_URL` | Build + Browser | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Build + Browser | Chave anon do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Chave service_role (admin) |
| `YTDLP_SERVICE_URL` | Server-only | URL base do microserviço yt-dlp |
| `YTDLP_SERVICE_TOKEN` | Server-only | Token Bearer do microserviço yt-dlp |
| `ADMIN_PHONE` | Server-only | Número de telefone do admin |
| `ADMIN_PIN` | Server-only | PIN de 4 dígitos do admin |
| `STREAM_SECRET` | Server-only | Chave HMAC para tokens de stream proxy |

---

## Scripts

```bash
# Desenvolvimento
bun run dev

# Build para produção (Cloudflare Worker)
bun run build

# Typecheck
bunx tsc --noEmit
```

---

## Roadmap / Standby

- [ ] RLS com `auth.uid()` (migração para Supabase Auth nativo com OTP por telefone)
- [ ] Realtime para upload progress (Supabase Storage realtime events)
- [ ] Suporte a legendas SRT/VTT externas no player nativo
- [ ] Chromecast / AirPlay no NativePlayer
- [ ] Download offline (Cache API / Service Worker)

---

## Licença

Projeto privado. Todos os direitos reservados.
