import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { LRUCache } from "lru-cache";
import { create as createYtdlp } from "youtube-dl-exec";

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? "0.0.0.0";
const SHARED_TOKEN = process.env.RESOLVER_TOKEN ?? "";
const YTDLP_BIN = process.env.YTDLP_BIN ?? "/usr/local/bin/yt-dlp";

const ytdlp = createYtdlp(YTDLP_BIN);

type Resolved = {
  streamUrl: string;
  kind: "hls" | "mp4";
  headers: Record<string, string>;
  expiresAt: number;
  title?: string | null;
};

const cache = new LRUCache<string, Resolved>({
  max: 1000,
  ttl: 5 * 60 * 1000,
});

const app = Fastify({ logger: true, bodyLimit: 16 * 1024 });

await app.register(rateLimit, {
  max: 60,
  timeWindow: "1 minute",
  keyGenerator: (req) => req.headers["x-forwarded-for"]?.toString() ?? req.ip,
});

app.addHook("onRequest", async (req, reply) => {
  if (req.url === "/health") return;
  if (!SHARED_TOKEN) return; // open if not configured (dev)
  const auth = req.headers["authorization"];
  if (auth !== `Bearer ${SHARED_TOKEN}`) {
    reply.code(401).send({ error: "unauthorized" });
  }
});

app.get("/health", async () => ({ ok: true }));

app.post<{ Body: { url?: string; format?: string } }>("/resolve", async (req, reply) => {
  const url = (req.body?.url ?? "").trim();
  if (!/^https?:\/\//i.test(url) || url.length > 2048) {
    return reply.code(400).send({ error: "invalid url" });
  }

  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached;

  try {
    const out = await runYtdlp(url, req.body?.format);
    cache.set(url, out);
    return out;
  } catch (err: unknown) {
    req.log.error({ err, url }, "ytdlp failed");
    const msg = err instanceof Error ? err.message : String(err);
    return reply.code(502).send({ error: "resolve_failed", detail: msg.slice(0, 500) });
  }
});

async function runYtdlp(url: string, format?: string): Promise<Resolved> {
  // -j prints JSON with .url (final stream URL) + .http_headers
  const result = (await ytdlp(url, {
    dumpSingleJson: true,
    noWarnings: true,
    noCheckCertificate: true,
    preferFreeFormats: true,
    format: format ?? "best[protocol^=m3u8]/best[ext=mp4]/best",
    noPlaylist: true,
    addHeader: ["Accept-Language: en-US,en;q=0.9"],
  })) as YtdlpJson;

  const streamUrl = pickUrl(result);
  if (!streamUrl) throw new Error("no playable url in yt-dlp output");
  const headers = sanitizeHeaders(result.http_headers ?? {});
  const kind: "hls" | "mp4" = /\.m3u8(\?|$)/i.test(streamUrl) || result.protocol?.includes("m3u8")
    ? "hls"
    : "mp4";

  // Many CDNs sign URLs valid for 1-6h; we cap at 30min to be safe.
  const expiresAt = Date.now() + 30 * 60 * 1000;
  return { streamUrl, kind, headers, expiresAt, title: result.title ?? null };
}

type YtdlpJson = {
  url?: string;
  manifest_url?: string;
  protocol?: string;
  title?: string;
  http_headers?: Record<string, string>;
  formats?: Array<{ url?: string; protocol?: string; vcodec?: string; acodec?: string; height?: number }>;
};

function pickUrl(j: YtdlpJson): string | null {
  if (j.manifest_url && /m3u8/i.test(j.manifest_url)) return j.manifest_url;
  if (j.url) return j.url;
  if (j.formats?.length) {
    const m3u8 = j.formats.find((f) => f.protocol?.includes("m3u8"));
    if (m3u8?.url) return m3u8.url;
    const mp4 = j.formats
      .filter((f) => f.vcodec && f.vcodec !== "none" && f.acodec && f.acodec !== "none")
      .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
    if (mp4?.url) return mp4.url;
  }
  return null;
}

function sanitizeHeaders(h: Record<string, string>): Record<string, string> {
  const keep = new Set(["referer", "user-agent", "origin", "cookie", "x-requested-with"]);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (keep.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

await app.listen({ port: PORT, host: HOST });
