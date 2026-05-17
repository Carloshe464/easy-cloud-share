// Server-only HMAC token: base64url(payload).base64url(sig)
// Payload = { u: string (target url), h?: Record<string,string>, e: number (unix ms) }

type Payload = { u: string; h?: Record<string, string>; e: number };

function b64u(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64u(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for stream signing");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toAB(u8: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}

export async function signStreamToken(payload: Payload): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, toAB(json));
  return `${b64u(json)}.${b64u(sig)}`;
}

export async function verifyStreamToken(token: string): Promise<Payload | null> {
  const [pB64, sB64] = token.split(".");
  if (!pB64 || !sB64) return null;
  try {
    const json = unb64u(pB64);
    const sig = unb64u(sB64);
    const key = await hmacKey();
    const ok = await crypto.subtle.verify("HMAC", key, toAB(sig), toAB(json));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(json)) as Payload;
    if (typeof p.e !== "number" || p.e < Date.now()) return null;
    if (typeof p.u !== "string") return null;
    return p;
  } catch {
    return null;
  }
}

export const SEG_TTL_MS = 10 * 60 * 1000;   // 10 min
export const PLAY_TTL_MS = 2 * 60 * 60 * 1000; // 2 h
