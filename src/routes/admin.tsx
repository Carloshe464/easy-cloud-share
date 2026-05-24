import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Shield, Loader2, KeyRound, Plus, Users, HardDrive, LogOut, Copy } from "lucide-react";
import { isAdminAuthed, getAdminToken, setAdminToken } from "@/lib/activation";
import {
  adminLoginFn,
  adminCreateActivationCodeFn,
  adminDashboardFn,
} from "@/lib/admin.functions";
import { formatBytes } from "@/lib/cloud";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "Admin" }, { name: "robots", content: "noindex,nofollow" }] }),
});

type CodeRow = { id: string; code: string; created_at: string; used_at: string | null };

function AdminPage() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => { setAuthed(isAdminAuthed()); }, []);
  if (!authed) return <AdminLogin onOk={() => setAuthed(true)} />;
  return <AdminDashboard onLogout={() => { setAdminToken(null); setAuthed(false); }} />;
}

function AdminLogin({ onOk }: { onOk: () => void }) {
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await adminLoginFn({ data: { phone, pin } });
      if (res.ok) {
        setAdminToken(res.token);
        onOk();
      } else {
        setErr(res.reason === "not_configured" ? "Admin não configurado" : "Credenciais inválidas");
      }
    } catch {
      setErr("Falha ao autenticar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-card/60 backdrop-blur-xl rounded-2xl p-6 ring-1 ring-border shadow-2xl">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-primary" />
          <h1 className="font-bold text-lg">Acesso restrito</h1>
        </div>
        <label className="block text-sm mb-1">Usuário</label>
        <input
          type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required
          placeholder="99 99999999" autoComplete="off"
          className="w-full mb-3 px-4 py-2.5 rounded-xl bg-input ring-1 ring-border focus:ring-2 focus:ring-primary outline-none"
        />
        <label className="block text-sm mb-1">PIN</label>
        <input
          type="password" value={pin} onChange={(e) => setPin(e.target.value)} required
          inputMode="numeric" autoComplete="off"
          className="w-full mb-3 px-4 py-2.5 rounded-xl bg-input ring-1 ring-border focus:ring-2 focus:ring-primary outline-none"
        />
        {err && <div className="text-sm text-destructive mb-2">{err}</div>}
        <button disabled={busy} className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} Entrar
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Voltar
        </button>
      </form>
    </main>
  );
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [activeUsers, setActiveUsers] = useState(0);
  const [usedBytes, setUsedBytes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const token = getAdminToken();
    if (!token) { onLogout(); return; }
    try {
      const res = await adminDashboardFn({ data: { token } });
      if (!res.ok) { onLogout(); return; }
      setCodes(res.codes as CodeRow[]);
      setUsedBytes(res.usedBytes);
      setActiveUsers(res.activeUsers);
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => { refresh(); }, [refresh]);

  const generate = async () => {
    const token = getAdminToken();
    if (!token) { onLogout(); return; }
    setGenerating(true);
    try {
      const res = await adminCreateActivationCodeFn({ data: { token } });
      if (!res.ok) {
        toast.error(res.reason === "unauthorized" ? "Sessão expirada" : "Falha ao gerar código");
        if (res.reason === "unauthorized") onLogout();
        return;
      }
      toast.success(`Código gerado: ${res.code}`);
      try { await navigator.clipboard.writeText(res.code); } catch { /* ignore */ }
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setGenerating(false); }
  };

  return (
    <main className="min-h-screen">
      <header className="border-b border-border/50 backdrop-blur-xl bg-background/40 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <Shield className="w-6 h-6 text-primary" />
          <div className="font-bold flex-1">Painel administrativo</div>
          <button onClick={onLogout} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground" aria-label="Sair">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <button
          onClick={generate}
          disabled={generating}
          className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-2xl py-4 font-semibold text-lg hover:opacity-90 disabled:opacity-50 transition shadow-lg shadow-primary/20"
        >
          {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
          Gerar código
        </button>

        <div className="grid grid-cols-2 gap-4">
          <Stat icon={Users} label="Usuários ativos" value={activeUsers.toString()} />
          <Stat icon={HardDrive} label="Armazenamento usado" value={formatBytes(usedBytes)} />
        </div>

        <div className="bg-card/60 backdrop-blur rounded-2xl ring-1 ring-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border/60 font-semibold text-sm">Histórico de códigos</div>
          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : codes.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Nenhum código ainda</div>
          ) : (
            <ul className="divide-y divide-border/60">
              {codes.map((c) => (
                <li key={c.id} className="px-5 py-3 flex items-center gap-3">
                  <code className="font-mono font-bold tracking-wider text-base">{c.code}</code>
                  <button
                    onClick={() => { navigator.clipboard?.writeText(c.code); toast.success("Copiado"); }}
                    className="p-1 text-muted-foreground hover:text-foreground"
                    aria-label="Copiar"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex-1" />
                  <div className="text-xs text-right">
                    {c.used_at ? (
                      <>
                        <div className="text-emerald-400">Ativado</div>
                        <div className="text-muted-foreground">{new Date(c.used_at).toLocaleString("pt-BR")}</div>
                      </>
                    ) : (
                      <>
                        <div className="text-muted-foreground">Disponível</div>
                        <div className="text-muted-foreground/60">Criado {new Date(c.created_at).toLocaleString("pt-BR")}</div>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="bg-card/60 backdrop-blur rounded-2xl p-5 ring-1 ring-border">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide mb-2">
        <Icon className="w-4 h-4" /> {label}
      </div>
      <div className="font-display font-bold text-2xl">{value}</div>
    </div>
  );
}
