import { supabase } from "@/integrations/supabase/client";

const PHONE_KEY = "nuvem_phone";
const USER_KEY = "nuvem_user_id";

export type CloudUser = {
  id: string;
  phone: string;
  used_bytes: number;
  quota_bytes: number;
  activated_at: string | null;
  activation_code: string | null;
};

export function getStoredUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(USER_KEY);
}

export function getStoredPhone(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PHONE_KEY);
}

export function setStoredUser(id: string, phone: string) {
  localStorage.setItem(USER_KEY, id);
  localStorage.setItem(PHONE_KEY, phone);
}

export function clearStoredUser() {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(PHONE_KEY);
}

export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

export async function loginOrRegister(phoneRaw: string): Promise<CloudUser> {
  const phone = normalizePhone(phoneRaw);
  if (phone.length < 8) throw new Error("Número inválido");

  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (existing) {
    setStoredUser(existing.id, existing.phone);
    return existing as CloudUser;
  }

  const { data: created, error } = await supabase
    .from("users")
    .insert({ phone })
    .select("*")
    .single();
  if (error) throw error;
  setStoredUser(created.id, created.phone);
  return created as CloudUser;
}

export async function fetchUser(id: string): Promise<CloudUser | null> {
  const { data } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
  return (data as CloudUser) ?? null;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

export function publicUrl(storagePath: string): string {
  const { data } = supabase.storage.from("cloud-files").getPublicUrl(storagePath);
  return data.publicUrl;
}
