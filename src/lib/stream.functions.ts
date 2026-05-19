import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveStream } from "./stream-resolver.server";
import { signStreamToken, PLAY_TTL_MS } from "./stream-sign.server";

const Input = z.object({
  url: z.string().url().max(2048),
});

export const resolveStreamFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const r = await resolveStream(data.url);
    if (!r) return { ok: false as const, reason: "unresolved" as const };

    // Ytdlp resolver (Terabox/Hefesto): retorna direto sem proxy.
    // O CDN do Terabox aceita requisições diretas do browser sem Referer
    // quando a URL já está assinada com token temporário.
    if (r.resolver === "ytdlp") {
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
