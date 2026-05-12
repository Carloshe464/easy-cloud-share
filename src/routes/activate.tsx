import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Loader2, ArrowRight, Check, LogOut } from "lucide-react";
import { getStoredUserId, fetchUser, clearStoredUser } from "@/lib/cloud";
import { redeemCode } from "@/lib/activation";
import { toast } from "sonner";

export const Route = createFileRoute("/activate")({
  component: ActivatePage,
  head: () => ({ meta: [{ title: "Ativar acesso" }] }),
});

function ActivatePage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      const id = getStoredUserId();
      if (!id) { navigate({ to: "/" }); return; }
      const u = await fetchUser(id);
      if (!u) { clearStoredUser(); navigate({ to: "/" }); return; }
      if (u.activated_at) { navigate({ to: "/app" }); return; }
      setChecking(false);
    })();
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const id = getStoredUserId();
    if (!id) { navigate({ to: "/" }); return; }
    setBusy(true);
    try {
      const ok = await redeemCode(code, id);
      if (!ok) {
        setError("Código inválido ou já utilizado");
        return;
      }
      setSuccess(true);
      toast.success("Acesso liberado!");
      setTimeout(() => navigate({ to: "/app" }), 800);
    } finally { setBusy(false); }
  };

  if (checking) {
    return <main className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></main>;
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 ring-1 ring-primary/30 mb-4">
            {success ? <Check className="w-8 h-8 text-emerald-400" /> : <KeyRound className="w-8 h-8 text-primary" />}
          </div>
          <h1 className="text-3xl font-bold mb-2">Ativar acesso</h1>
          <p className="text-muted-foreground text-sm">Informe o código de ativação fornecido pelo administrador.</p>
        </div>

        <form onSubmit={submit} className="bg-card/60 backdrop-blur-xl rounded-2xl p-6 ring-1 ring-border shadow-2xl">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))}
            placeholder="A7K2P"
            maxLength={5}
            autoCapitalize="characters"
            autoComplete="off"
            disabled={success}
            className={`w-full px-4 py-4 text-center font-mono font-bold text-2xl tracking-[0.5em] rounded-xl bg-input ring-1 outline-none transition ${
              error ? "ring-destructive" : "ring-border focus:ring-2 focus:ring-primary"
            }`}
            required
          />
          {error && <div className="text-sm text-destructive mt-2 text-center animate-in fade-in">{error}</div>}
          <button
            type="submit"
            disabled={busy || code.length < 5 || success}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-3 font-semibold hover:opacity-90 disabled:opacity-50 transition"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : success ? <>Acesso liberado <Check className="w-4 h-4" /></> : <>Ativar acesso <ArrowRight className="w-4 h-4" /></>}
          </button>
        </form>

        <button
          onClick={() => { clearStoredUser(); navigate({ to: "/" }); }}
          className="mt-6 w-full inline-flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <LogOut className="w-4 h-4" /> Sair
        </button>
      </div>
    </main>
  );
}
