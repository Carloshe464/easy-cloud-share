import { createFileRoute } from "@tanstack/react-router";
import { verifyStreamToken } from "@/lib/stream-sign.server";

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
    if (lk === "range" || lk === "accept" || lk === "accept-encoding") out[k] = v;
  }
  return { ...out, ...extra };
}

function filterRespHeaders(res: Response): Headers {
  const h = new Headers();
  for (const [k, v] of res.headers.entries()) {
    const lk = k.toLowerCase();
    if (HOP.has(lk)) continue;
    if (lk === "set-cookie" || lk === "content-security-policy") continue;
    h.set(k, v);
  }
  h.set("access-control-allow-origin", "*");
  return h;
}

export const Route = createFileRoute("/api/public/stream/seg")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const t = url.searchParams.get("t");
        if (!t) return new Response("missing token", { status: 400 });
        const payload = await verifyStreamToken(t);
        if (!payload) return new Response("invalid or expired token", { status: 403 });

        const upstream = await fetch(payload.u, {
          method: "GET",
          headers: filterReqHeaders(request, payload.h ?? {}),
          redirect: "follow",
        });

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
