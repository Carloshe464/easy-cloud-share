const ADMIN_KEY = "nuvem_admin_token";

export function normalize(s: string) { return s.replace(/\D/g, ""); }

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(ADMIN_KEY);
}
export function setAdminToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) sessionStorage.setItem(ADMIN_KEY, token);
  else sessionStorage.removeItem(ADMIN_KEY);
}
export function isAdminAuthed(): boolean {
  return !!getAdminToken();
}
