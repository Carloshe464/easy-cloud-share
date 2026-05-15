import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, User, LogOut, Plus, Home as HomeIcon, Heart } from "lucide-react";
import { getStoredUserId, getStoredPhone, clearStoredUser } from "@/lib/cloud";

export const Route = createFileRoute("/streaming")({
  component: StreamingLayout,
  head: () => ({
    meta: [
      { title: "NuvemPlay — Streaming" },
      { name: "description", content: "Plataforma de streaming premium com catálogo personalizado." },
    ],
  }),
});

function StreamingLayout() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!getStoredUserId()) navigate({ to: "/" });
  }, [navigate]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const phone = getStoredPhone() ?? "";
  const initialQ = typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("q") ?? "") : "";
  const [q, setQ] = useState<string>(initialQ);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ to: "/streaming", search: { q } as never });
  };

  const navItem = (to: string, label: string, exact = false) => {
    const active = exact ? path === to : path.startsWith(to);
    return (
      <Link to={to} className={`text-sm font-medium transition ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className={`fixed top-0 inset-x-0 z-40 transition-all ${scrolled ? "bg-background/95 backdrop-blur-lg border-b border-border/60" : "bg-gradient-to-b from-black/80 via-black/40 to-transparent"}`}>
        <div className="max-w-[1600px] mx-auto px-4 md:px-10 h-16 flex items-center gap-6">
          <Link to="/streaming" className="nflx-logo text-2xl shrink-0">NUVEMPLAY</Link>
          <nav className="hidden md:flex items-center gap-5">
            {navItem("/streaming", "Início", true)}
            {navItem("/streaming/admin", "Gerenciar")}
            <Link to="/app" className="text-sm font-medium text-muted-foreground hover:text-foreground transition">Nuvem</Link>
          </nav>
          <form onSubmit={onSearch} className="ml-auto flex items-center gap-2 bg-secondary/60 ring-1 ring-border rounded-full px-3 py-1.5 w-44 focus-within:w-72 transition-all">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Títulos, gêneros…" className="bg-transparent text-sm outline-none flex-1 min-w-0" />
          </form>
          <Link to="/streaming/admin" className="hidden sm:inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-primary/15 text-primary ring-1 ring-primary/30 hover:bg-primary/25 transition">
            <Plus className="w-3.5 h-3.5" /> Adicionar
          </Link>
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-8 h-8 rounded-md bg-primary/20 ring-1 ring-primary/40 flex items-center justify-center">
              <User className="w-4 h-4 text-primary" />
            </div>
            <span className="hidden lg:inline">{phone}</span>
          </div>
          <button onClick={() => { clearStoredUser(); navigate({ to: "/" }); }} title="Sair"
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <Outlet />

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-lg border-t border-border/60 px-6 py-2 flex justify-around">
        <Link to="/streaming" className="flex flex-col items-center gap-1 py-1 text-muted-foreground"><HomeIcon className="w-5 h-5" /><span className="text-[10px]">Início</span></Link>
        <Link to="/streaming/admin" className="flex flex-col items-center gap-1 py-1 text-muted-foreground"><Plus className="w-5 h-5" /><span className="text-[10px]">Adicionar</span></Link>
        <Link to="/app" className="flex flex-col items-center gap-1 py-1 text-muted-foreground"><Heart className="w-5 h-5" /><span className="text-[10px]">Nuvem</span></Link>
      </nav>
    </div>
  );
}
