import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveStream } from "./stream-resolver.server";

const Input = z.object({
  url: z.string().url().max(2048),
});

export const resolveStreamFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const r = await resolveStream(data.url);
    if (!r) return { ok: false as const, reason: "unresolved" as const };
    // Don't leak headers to client — only kind + a play URL.
    // In Etapa 2 we replace streamUrl with a signed proxy URL.
    return {
      ok: true as const,
      kind: r.kind,
      streamUrl: r.streamUrl,
      expiresAt: r.expiresAt,
      resolver: r.resolver,
    };
  });
