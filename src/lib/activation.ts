import { supabase } from "@/integrations/supabase/client";

const ADMIN_KEY = "nuvem_admin_ok";
export const ADMIN_PHONE = "9999999999";
export const ADMIN_PIN = "3721";

export function normalize(s: string) { return s.replace(/\D/g, ""); }

export function isAdminAuthed(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(ADMIN_KEY) === "1";
}
export function setAdminAuthed(v: boolean) {
  if (v) sessionStorage.setItem(ADMIN_KEY, "1");
  else sessionStorage.removeItem(ADMIN_KEY);
}

export function adminLogin(phoneRaw: string, pin: string): boolean {
  const ok = normalize(phoneRaw) === ADMIN_PHONE && pin.trim() === ADMIN_PIN;
  if (ok) setAdminAuthed(true);
  return ok;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars
export function generateCode(): string {
  let out = "";
  const arr = new Uint32Array(5);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 5; i++) out += ALPHABET[arr[i] % ALPHABET.length];
  return out;
}

export async function createActivationCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    const { error } = await supabase.from("activation_codes").insert({ code });
    if (!error) return code;
  }
  throw new Error("Falha ao gerar código");
}

export async function redeemCode(code: string, userId: string): Promise<boolean> {
  const c = code.trim().toUpperCase();
  const { data: row } = await supabase
    .from("activation_codes")
    .select("*")
    .eq("code", c)
    .maybeSingle();
  if (!row || row.used_at) return false;
  const now = new Date().toISOString();
  const { error: e1 } = await supabase
    .from("activation_codes")
    .update({ used_at: now, used_by_user_id: userId })
    .eq("id", row.id)
    .is("used_at", null);
  if (e1) return false;
  await supabase.from("users").update({ activated_at: now, activation_code: c }).eq("id", userId);
  return true;
}
