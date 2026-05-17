import { createFileRoute } from "@tanstack/react-router";
import { verifyStreamToken, signStreamToken, SEG_TTL_MS } from "@/lib/stream-sign.server";

const HOP = new Set([
  "host", "connection", "keep-alive", "transfer-encoding",
  "te", "trailer", "upgrade", "proxy-authorization", "proxy-authenticate",
]);

function filterReqHeaders(req: Request, extra: Record<string, string>): HeadersInit {
  const out: Record<string, string> = {};
  for (const [k, v] of req.headers.entries()) {
    const lk = k.toLowerCase();
    if (HOP.has(lk)) continue;
    if (lk === "cookie" || lk === "authorization") continue;
    if (lk === "range" || lk === "accept" || lk === "accept-encoding" || lk === "if-none-match" || lk === "if-modified-since") {
      out[k] = v;
    }
  }
  return { ...out, ...extra };
}

function filterRespHeaders(res: Response, contentType?: string): Headers {
  const h = new Headers();
  for (const [k, v] of res.headers.entries()) {
    const lk = k.toLowerCase();
    if (HOP.has(lk)) continue;
    if (lk === "set-cookie" || lk === "content-security-policy") continue;
    h.set(k, v);
  }
  if (contentType) h.set("content-type", contentType);
  h.set("access-control-allow-origin", "*");
  h.set("cache-control", "no-store");
  return h;
}

async function rewriteM3U8(text: string, baseUrl: string, headers: Record<string, string>): Promise<string> {
  const base = new URL(baseUrl);
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // URI=" inside attrs (e.g. EXT-X-KEY, EXT-X-MEDIA, EXT-X-MAP)
    if (line.startsWith("#")) {
      const replaced = await replaceUriAttr(line, base, headers);
      out.push(replaced);
      continue;
    }
    if (!line.trim()) { out.push(line); continue; }
    // playlist URI line
    const abs = new URL(line, base).toString();
    const isPlaylist = /\.m3u8(\?|$)/i.test(abs);
    const tok = await signStreamToken({
      u: abs, h: headers, e: Date.now() + SEG_TTL_MS,
    });
    out.push(isPlaylist
      ? `/api/public/stream/play?t=${encodeURIComponent(tok)}`
      : `/api/public/stream/seg?t=${encodeURIComponent(tok)}`);
  }
  return out.join("\n");
}

async function replaceUriAttr(line: string, base: URL, headers: Record<string, string>): Promise<string> {
  const re = /URI="([^"]+)"/g;
  const matches = [...line.matchAll(re)];
  if (matches.length === 0) return line;
  let result = line;
  for (const m of matches) {
    const abs = new URL(m[1], base).toString();
    const isPlaylist = /\.m3u8(\?|$)/i.test(abs);
    const tok = await signStreamToken({
      u: abs, h: headers, e: Date.now() + SEG_TTL_MS,
    });
    const proxied = isPlaylist
      ? `/api/public/stream/play?t=${encodeURIComponent(tok)}`
      : `/api/public/stream/seg?t=${encodeURIComponent(tok)}`;
    result = result.replace(m[0], `URI="${proxied}"`);
  }
  return result;
}

export const Route = createFileRoute("/api/public/stream/play")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const t = url.searchParams.get("t");
        if (!t) return new Response("missing token", { status: 400 });
        const payload = await verifyStreamToken(t);
        if (!payload) return new Response("invalid or expired token", { status: 403 });

        const upstreamHeaders = filterReqHeaders(request, payload.h ?? {});
        const upstream = await fetch(payload.u, {
          method: "GET",
          headers: upstreamHeaders,
          redirect: "follow",
        });

        const ct = upstream.headers.get("content-type") ?? "";
        const isM3U8 = /mpegurl|m3u8/i.test(ct) || /\.m3u8(\?|$)/i.test(payload.u);

        if (isM3U8 && upstream.ok) {
          const text = await upstream.text();
          // Use final URL after redirects as base
          const finalUrl = (upstream as Response & { url?: string }).url || payload.u;
          const rewritten = await rewriteM3U8(text, finalUrl, payload.h ?? {});
          return new Response(rewritten, {
            status: 200,
            headers: filterRespHeaders(upstream, "application/vnd.apple.mpegurl"),
          });
        }

        // MP4 / direct media — stream through (supports Range)
        return new Response(upstream.body, {
          status: upstream.status,
          headers: filterRespHeaders(upstream),
        });
      },
      OPTIONS: async () => new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "Range",
        },
      }),
    },
  },
});
