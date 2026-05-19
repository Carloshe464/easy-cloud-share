// Server-only. Resolve embed/page URLs into direct .m3u8 / .mp4 + required headers.
// Runs inside Cloudflare Worker: fetch + regex only, no native deps.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ResolvedStream = {
  streamUrl: string;
  kind: "hls" | "mp4";
  headers: Record<string, string>;
  expiresAt: number; // unix ms
  resolver: "worker" | "ytdlp" | "manual" | "passthrough";
};

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// --- helpers ----------------------------------------------------------------

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "*/*", ...headers },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function refererOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return "";
  }
}

// Unpack the classic dean-edwards p,a,c,k,e,d packer used by streamtape/filemoon/doodstream/etc.
function unpackPacked(src: string): string {
  const re = /eval\(function\(p,a,c,k,e,(?:r|d)\)\{.*?\}\((.*?)\.split\('\|'\)/s;
  const m = src.match(re);
  if (!m) return src;
  try {
    // Naive parse: pull "...", number, number, "...".split('|')
    const argRe = /'([^']*)',(\d+),(\d+),'([^']*)'\.split\('\|'\)/s;
    const a = src.match(argRe);
    if (!a) return src;
    let payload = a[1];
    const base = parseInt(a[2], 10);
    const count = parseInt(a[3], 10);
    const dict = a[4].split("|");
    const toBase = (n: number): string => {
      const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
      if (n < base) return chars[n] ?? String(n);
      return toBase(Math.floor(n / base)) + (chars[n % base] ?? String(n % base));
    };
    for (let i = count - 1; i >= 0; i--) {
      const key = toBase(i);
      const val = dict[i] || key;
      payload = payload.replace(new RegExp("\\b" + key + "\\b", "g"), val);
    }
    return payload;
  } catch {
    return src;
  }
}

function findInText(text: string): { url: string; kind: "hls" | "mp4" } | null {
  // Look for full URLs first
  const hls = text.match(/https?:\/\/[^\s'"<>]+\.m3u8[^\s'"<>]*/i);
  if (hls) return { url: hls[0], kind: "hls" };
  const mp4 = text.match(/https?:\/\/[^\s'"<>]+\.mp4[^\s'"<>]*/i);
  if (mp4) return { url: mp4[0], kind: "mp4" };
  // source: {file:"..."} variants
  const f = text.match(/(?:file|src|source)\s*[:=]\s*['"]([^'"]+\.(?:m3u8|mp4)[^'"]*)['"]/i);
  if (f) return { url: f[1], kind: f[1].includes(".m3u8") ? "hls" : "mp4" };
  return null;
}

// --- per-host extractors ----------------------------------------------------

type Extractor = (url: string) => Promise<ResolvedStream | null>;

const extractors: Record<string, Extractor> = {
  // streamtape: token-protected mp4. Page contains `document.getElementById('robotlink').innerHTML = 'XXX' + ('YYY').substring(N);`
  streamtape: async (url) => {
    const html = await fetchText(url);
    const m = html.match(
      /id=["']robotlink["'][^>]*>\s*([^<]+)<.*?\+\s*\('([^']+)'\)\.substring\((\d+)\)/s,
    );
    if (!m) return null;
    const part1 = m[1].trim();
    const part2 = m[2];
    const off = parseInt(m[3], 10);
    const tail = part2.substring(off);
    const link = `https:${part1}${tail}`;
    return mkResolved(link, "mp4", { Referer: refererOf(url) });
  },

  // filemoon / mixdrop / doodstream-like: packed JS with file:"...m3u8"
  filemoon: async (url) => unpackHostingPlayer(url),
  mixdrop: async (url) => unpackHostingPlayer(url),
  doodstream: async (url) => {
    // doodstream serves a pass_md5 endpoint; page contains /pass_md5/<token>/<hash>
    const html = await fetchText(url);
    const m = html.match(/\/pass_md5\/[\w-]+\/([\w-]+)/);
    if (!m) return unpackHostingPlayer(url);
    const passUrl = `https://${new URL(url).host}${html.match(/\/pass_md5\/[\w-]+\/[\w-]+/)![0]}`;
    const token = html.match(/token=([\w-]+)/)?.[1] ?? "";
    const expiry = Date.now();
    const seed = Math.random().toString(36).slice(2, 12);
    const base = await fetchText(passUrl, { Referer: refererOf(url) });
    if (!base.startsWith("http")) return null;
    const link = `${base}${seed}?token=${token}&expiry=${expiry}`;
    return mkResolved(link, "mp4", { Referer: refererOf(url) });
  },

  // generic: try same-origin fetch and search for m3u8/mp4 (works for many embeds with <source>)
  generic: async (url) => {
    const html = await fetchText(url);
    const unpacked = unpackPacked(html);
    const found = findInText(unpacked) ?? findInText(html);
    if (!found) return null;
    return mkResolved(found.url, found.kind, { Referer: refererOf(url) });
  },
};

async function unpackHostingPlayer(url: string): Promise<ResolvedStream | null> {
  const html = await fetchText(url);
  const unpacked = unpackPacked(html);
  const found = findInText(unpacked) ?? findInText(html);
  if (!found) return null;
  return mkResolved(found.url, found.kind, { Referer: refererOf(url) });
}

function mkResolved(
  streamUrl: string,
  kind: "hls" | "mp4",
  headers: Record<string, string>,
  resolver: ResolvedStream["resolver"] = "worker",
  ttlMs = DEFAULT_TTL_MS,
): ResolvedStream {
  return { streamUrl, kind, headers, resolver, expiresAt: Date.now() + ttlMs };
}

// --- routing ----------------------------------------------------------------

function pickExtractor(url: string): Extractor {
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return extractors.generic; }
  if (/streamtape/.test(host)) return extractors.streamtape;
  if (/filemoon|moonplayer|filelions|kerapoxy/.test(host)) return extractors.filemoon;
  if (/mixdrop/.test(host)) return extractors.mixdrop;
  if (/doodstream|dood\.(?:to|so|la|li|wf|pm|re|sh|yt|cx|stream|watch)/.test(host)) return extractors.doodstream;
  return extractors.generic;
}

// Direct passthrough — already a stream URL, no resolve needed.
function asDirect(url: string): ResolvedStream | null {
  if (/\.m3u8(\?|$)/i.test(url)) return mkResolved(url, "hls", {}, "passthrough", 24 * 3600 * 1000);
  if (/\.mp4(\?|$)/i.test(url))  return mkResolved(url, "mp4", {}, "passthrough", 24 * 3600 * 1000);
  return null;
}

// --- cache ------------------------------------------------------------------

async function readCache(sourceUrl: string): Promise<ResolvedStream | null> {
  const { data } = await supabaseAdmin
    .from("stream_cache")
    .select("resolved_url,kind,headers,resolver,expires_at")
    .eq("source_url", sourceUrl)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return null;
  return {
    streamUrl: data.resolved_url as string,
    kind: data.kind as "hls" | "mp4",
    headers: (data.headers as Record<string, string>) ?? {},
    resolver: data.resolver as ResolvedStream["resolver"],
    expiresAt: new Date(data.expires_at as string).getTime(),
  };
}

async function writeCache(sourceUrl: string, r: ResolvedStream) {
  await supabaseAdmin.from("stream_cache").upsert(
    {
      source_url: sourceUrl,
      resolved_url: r.streamUrl,
      kind: r.kind,
      headers: r.headers,
      resolver: r.resolver,
      expires_at: new Date(r.expiresAt).toISOString(),
    },
    { onConflict: "source_url" },
  );
}

// --- ytdlp fallback ---------------------------------------------------------

async function resolveViaYtdlp(sourceUrl: string): Promise<ResolvedStream | null> {
  const base = process.env.YTDLP_SERVICE_URL?.trim();
  const token = process.env.YTDLP_SERVICE_TOKEN?.trim();
  if (!base) {
    console.warn("[resolveStream] YTDLP_SERVICE_URL not set");
    return null;
  }
  const endpoint = `${base.replace(/\/+$/, "")}/resolve`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25_000); // yt-dlp can take a while
  try {
    console.log("[resolveStream] calling ytdlp", endpoint, "for", sourceUrl);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ url: sourceUrl }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn("[resolveStream] ytdlp service", res.status, await res.text().catch(() => ""));
      return null;
    }
    const j = (await res.json()) as {
      streamUrl?: string;
      kind?: "hls" | "mp4";
      headers?: Record<string, string>;
      expiresAt?: number;
    };
    if (!j.streamUrl || !j.kind) return null;
    return {
      streamUrl: j.streamUrl,
      kind: j.kind,
      headers: j.headers ?? {},
      resolver: "ytdlp",
      expiresAt: j.expiresAt ?? Date.now() + 30 * 60 * 1000,
    };
  } catch (err) {
    console.warn("[resolveStream] ytdlp fallback error", err);
    return null;
  } finally {
    clearTimeout(t);
  }
}

// --- public API -------------------------------------------------------------

export async function resolveStream(sourceUrl: string): Promise<ResolvedStream | null> {
  const direct = asDirect(sourceUrl);
  if (direct) return direct;

  const cached = await readCache(sourceUrl);
  if (cached) return cached;

  // Tier 1: worker-side regex/unpack extractors
  const extractor = pickExtractor(sourceUrl);
  try {
    const r = await extractor(sourceUrl);
    if (r) {
      await writeCache(sourceUrl, r).catch(() => { /* best-effort */ });
      return r;
    }
  } catch (err) {
    console.warn("[resolveStream] worker extractor failed", sourceUrl, err);
  }

  // Tier 2: yt-dlp microservice fallback
  const fallback = await resolveViaYtdlp(sourceUrl);
  if (fallback) {
    await writeCache(sourceUrl, fallback).catch(() => { /* best-effort */ });
    return fallback;
  }

  return null;
}

