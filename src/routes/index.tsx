import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Cloud, ArrowRight, Loader2 } from "lucide-react";
import { loginOrRegister, getStoredUserId, formatBytes } from "@/lib/cloud";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Nuvem Pública — Armazenamento sem login" },
      { name: "description", content: "Armazenamento em nuvem público com login por número de telefone. 4 TB por usuário." },
    ],
  }),
});

function Index() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getStoredUserId()) navigate({ to: "/app" });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await loginOrRegister(phone);
      navigate({ to: "/app" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao entrar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 ring-1 ring-primary/30 mb-6 shadow-[var(--shadow-glow)]">
            <Cloud className="w-8 h-8 text-primary" strokeWidth={1.5} />
          </div>
          <h1 className="text-4xl font-bold mb-3">Nuvem Pública</h1>
          <p className="text-muted-foreground text-balance">
            Sua nuvem pessoal, acessível de qualquer dispositivo. Sem senha.
            Apenas seu número.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-3">
            {formatBytes(4398046511104)} grátis por número
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card/60 backdrop-blur-xl rounded-2xl p-6 ring-1 ring-border shadow-2xl">
          <label className="block text-sm font-medium mb-2">Número de telefone</label>
          <input
            type="tel"
            inputMode="tel"
            placeholder="(11) 99999-9999"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-input border-0 ring-1 ring-border focus:ring-2 focus:ring-primary outline-none transition text-lg"
            required
          />
          <button
            type="submit"
            disabled={loading || !phone}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-3 font-semibold hover:opacity-90 disabled:opacity-50 transition"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Entrar <ArrowRight className="w-4 h-4" /></>}
          </button>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Se o número não existir, sua conta é criada automaticamente.
          </p>
        </form>
      </div>
    </main>
  );
}
