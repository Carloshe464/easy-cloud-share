import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveStream } from "./stream-resolver.server";
import { signStreamToken, PLAY_TTL_MS } from "./stream-sign.server";

// Allowlist of hostnames the resolver is allowed to fetch.
// Prevents SSRF (probing internal IPs, cloud metadata, etc.) and bandwidth abuse.
const ALLOWED_HOST_RE = /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com|player\.vimeo\.com|drive\.google\.com|docs\.google\.com|mega\.nz|mega\.co\.nz|dailymotion\.com|dai\.ly|twitch\.tv|tiktok\.com|facebook\.com|fb\.watch|instagram\.com|twitter\.com|x\.com|streamable\.com|odysee\.com|rumble\.com|kick\.com|soundcloud\.com|spotify\.com|terabox\.com|1024terabox\.com|teraboxapp\.com|4funbox\.com|mirrobox\.com|nephobox\.com|googleusercontent\.com|googlevideo\.com|akamaihd\.net|cloudfront\.net)$/i;

const PRIVATE_NET_RE = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|::1$|fc00:|fd00:|fe80:|localhost$)/i;

function isAllowedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (PRIVATE_NET_RE.test(host)) return false;
    return ALLOWED_HOST_RE.test(host);
  } catch {
    return false;
  }
}

function isTeraboxUrl(raw: string): boolean {
  try {
    return /(^|\.)(terabox\.com|terabox\.app|1024terabox\.com|teraboxapp\.com|4funbox\.com|mirrobox\.com|nephobox\.com|freeterabox\.com|videynow\.com|momerybox\.com)$/i.test(new URL(raw).hostname);
  } catch {
    return false;
  }
}

const Input = z.object({
  url: z.string().url().max(2048),
});

export const resolveStreamFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    if (!isAllowedUrl(data.url)) {
      return { ok: false as const, reason: "host_not_allowed" as const };
    }
    const r = await resolveStream(data.url);
    if (!r) return { ok: false as const, reason: "unresolved" as const };

    // Hefesto/Terabox: always proxy Terabox media so required headers stay server-side
    // and the browser never falls back to the blocked public page iframe.
    if (r.resolver === "ytdlp") {
      if (isTeraboxUrl(data.url)) {
        const token = await signStreamToken({
          u: r.streamUrl,
          h: r.headers,
          e: Date.now() + PLAY_TTL_MS,
        });
        return {
          ok: true as const,
          kind: r.kind,
          streamUrl: `/api/public/stream/play?t=${encodeURIComponent(token)}`,
          proxied: true as const,
          expiresAt: Date.now() + PLAY_TTL_MS,
          resolver: r.resolver,
        };
      }
      return {
        ok: true as const,
        kind: r.kind,
        streamUrl: r.streamUrl,
        proxied: false as const,
        expiresAt: r.expiresAt,
        resolver: r.resolver,
      };
    }

    // Passthrough direct urls don't need proxy — return as-is.
    if (r.resolver === "passthrough" && Object.keys(r.headers).length === 0) {
      return {
        ok: true as const,
        kind: r.kind,
        streamUrl: r.streamUrl,
        proxied: false as const,
        expiresAt: r.expiresAt,
        resolver: r.resolver,
      };
    }

    const token = await signStreamToken({
      u: r.streamUrl,
      h: r.headers,
      e: Date.now() + PLAY_TTL_MS,
    });
    const proxyUrl = `/api/public/stream/play?t=${encodeURIComponent(token)}`;
    return {
      ok: true as const,
      kind: r.kind,
      streamUrl: proxyUrl,
      proxied: true as const,
      expiresAt: Date.now() + PLAY_TTL_MS,
      resolver: r.resolver,
    };
  });
