import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { signStreamToken, verifyStreamToken } from "./stream-sign.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ADMIN_TTL_MS = 4 * 60 * 60 * 1000; // 4h

function normalize(s: string) { return s.replace(/\D/g, ""); }

// ---- Login ----------------------------------------------------------------

const LoginInput = z.object({
  phone: z.string().max(40),
  pin: z.string().max(40),
});

export const adminLoginFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => LoginInput.parse(input))
  .handler(async ({ data }) => {
    const expectedPhone = process.env.ADMIN_PHONE;
    const expectedPin = process.env.ADMIN_PIN;
    if (!expectedPhone || !expectedPin) {
      return { ok: false as const, reason: "not_configured" as const };
    }
    const ok =
      normalize(data.phone) === normalize(expectedPhone) &&
      data.pin.trim() === expectedPin.trim();
    if (!ok) return { ok: false as const, reason: "invalid" as const };
    // Reuse the existing HMAC signer; embed an admin marker in the URL field.
    const token = await signStreamToken({
      u: "admin://session",
      e: Date.now() + ADMIN_TTL_MS,
    });
    return { ok: true as const, token, expiresAt: Date.now() + ADMIN_TTL_MS };
  });

async function requireAdmin(token: string): Promise<boolean> {
  const p = await verifyStreamToken(token);
  return !!p && p.u === "admin://session";
}

// ---- Generate activation code --------------------------------------------

const TokenInput = z.object({ token: z.string().min(8).max(2048) });

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateCode(): string {
  let out = "";
  const arr = new Uint32Array(5);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 5; i++) out += ALPHABET[arr[i] % ALPHABET.length];
  return out;
}

export const adminCreateActivationCodeFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TokenInput.parse(input))
  .handler(async ({ data }) => {
    if (!(await requireAdmin(data.token))) {
      return { ok: false as const, reason: "unauthorized" as const };
    }
    for (let i = 0; i < 5; i++) {
      const code = generateCode();
      const { error } = await supabaseAdmin.from("activation_codes").insert({ code });
      if (!error) return { ok: true as const, code };
    }
    return { ok: false as const, reason: "generation_failed" as const };
  });

// ---- Dashboard data -------------------------------------------------------

export const adminDashboardFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TokenInput.parse(input))
  .handler(async ({ data }) => {
    if (!(await requireAdmin(data.token))) {
      return { ok: false as const, reason: "unauthorized" as const };
    }
    const [{ data: codes }, { data: filesAgg }, usersCount] = await Promise.all([
      supabaseAdmin
        .from("activation_codes")
        .select("id, code, created_at, used_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin.from("files").select("size_bytes"),
      supabaseAdmin
        .from("users")
        .select("id", { count: "exact", head: true })
        .not("activated_at", "is", null),
    ]);
    const usedBytes = (filesAgg ?? []).reduce(
      (s: number, r: { size_bytes: number | null }) => s + Number(r.size_bytes ?? 0),
      0,
    );
    return {
      ok: true as const,
      codes: codes ?? [],
      usedBytes,
      activeUsers: usersCount.count ?? 0,
    };
  });

// ---- Public: redeem activation code (no admin token needed) --------------

const RedeemInput = z.object({
  code: z.string().min(1).max(64),
  userId: z.string().uuid(),
});

export const redeemActivationCodeFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RedeemInput.parse(input))
  .handler(async ({ data }) => {
    const c = data.code.trim().toUpperCase();
    const { data: row } = await supabaseAdmin
      .from("activation_codes")
      .select("id, used_at")
      .eq("code", c)
      .maybeSingle();
    if (!row || row.used_at) return { ok: false as const };
    const now = new Date().toISOString();
    const { error: e1, data: updated } = await supabaseAdmin
      .from("activation_codes")
      .update({ used_at: now, used_by_user_id: data.userId })
      .eq("id", row.id)
      .is("used_at", null)
      .select("id");
    if (e1 || !updated || updated.length === 0) return { ok: false as const };
    await supabaseAdmin
      .from("users")
      .update({ activated_at: now, activation_code: c })
      .eq("id", data.userId);
    return { ok: true as const };
  });
