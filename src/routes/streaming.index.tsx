import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Plus, Check, Info, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { getStoredUserId } from "@/lib/cloud";
import { fetchCatalog, posterFor, useFavorites, useHistory, useProgress, type Title } from "@/lib/streaming";
import type { FolderRow } from "@/components/cloud/types";
import { toast } from "sonner";

export const Route = createFileRoute("/streaming/")({
  component: StreamingHome,
  validateSearch: (s: Record<string, unknown>) => ({ q: typeof s.q === "string" ? s.q : "" }),
});

function StreamingHome() {
  const { q } = Route.useSearch();
  const userId = getStoredUserId();
  const [titles, setTitles] = useState<Title[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fav = useFavorites(userId);
  const hist = useHistory(userId);
  const prog = useProgress(userId);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setLoading(true);
      try {
        const { folders, titles } = await fetchCatalog(userId);
        setTitles(titles); setFolders(folders);
      } catch { toast.error("Falha ao carregar catálogo"); }
      finally { setLoading(false); }
    })();
  }, [userId]);

  const filtered = useMemo(() => {
    if (!q) return titles;
    const s = q.toLowerCase();
    return titles.filter((t) => t.name.toLowerCase().includes(s) || (t.description ?? "").toLowerCase().includes(s));
  }, [q, titles]);

  const featured = filtered[0];
  const continueWatching = useMemo(
    () => hist.ids.map((id) => titles.find((t) => t.id === id)).filter(Boolean) as Title[],
    [hist.ids, titles],
  );
  const favorites = useMemo(
    () => fav.ids.map((id) => titles.find((t) => t.id === id)).filter(Boolean) as Title[],
    [fav.ids, titles],
  );
  const trending = useMemo(() => [...filtered].sort(() => Math.random() - 0.5).slice(0, 10), [filtered]);
  const indicados = useMemo(
    () => filtered.filter((t) => t.is_public && t.user_id && t.user_id !== userId),
    [filtered, userId],
  );
  const byCategory = useMemo(() => {
    const map = new Map<string, Title[]>();
    // Only own items here — items from others live in "Indicados da galera"
    for (const t of filtered) {
      if (t.user_id && t.user_id !== userId) continue;
      const k = t.category ?? "Sem categoria";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return Array.from(map.entries());
  }, [filtered, userId]);

  if (!userId) return null;

  if (loading) {
    return (
      <main className="pt-24 pb-24 max-w-[1600px] mx-auto px-4 md:px-10">
        <div className="h-[60vh] rounded-xl bg-card animate-pulse mb-10" />
        {[0,1,2].map((i) => (
          <div key={i} className="mb-10">
            <div className="h-5 w-40 bg-card rounded mb-4 animate-pulse" />
            <div className="flex gap-3 overflow-hidden">
              {[...Array(6)].map((_, j) => <div key={j} className="aspect-[2/3] w-44 shrink-0 rounded-md bg-card animate-pulse" />)}
            </div>
          </div>
        ))}
      </main>
    );
  }

  if (titles.length === 0) {
    return (
      <main className="pt-24 pb-24 max-w-[1600px] mx-auto px-4 md:px-10">
        <div className="text-center py-20 ring-1 ring-border rounded-2xl bg-card/40">
          <Sparkles className="w-12 h-12 mx-auto mb-4 text-primary" />
          <h2 className="font-display text-3xl mb-3">Seu catálogo está vazio</h2>
          <p className="text-muted-foreground mb-6">Adicione links de vídeos ou popule com conteúdo de demonstração.</p>
          <Link to="/streaming/admin" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-md font-semibold hover:opacity-90">
            <Plus className="w-4 h-4" /> Ir para o painel
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="pb-24">
      {featured && <Hero title={featured} fav={fav} />}
      <div className="mt-4 md:-mt-20 relative z-10 space-y-8 max-w-[1600px] mx-auto px-4 md:px-10">
        {q && <h2 className="font-display text-2xl">Resultados para "{q}"</h2>}
        {continueWatching.length > 0 && <Row title="Continuar assistindo" items={continueWatching} progressMap={prog.map} />}
        {favorites.length > 0 && <Row title="Minha lista" items={favorites} />}
        {!q && <Row title="Em alta" items={trending} />}
        {indicados.length > 0 && <Row title="Indicados da galera" items={indicados} showCategory />}
        {byCategory.map(([cat, items]) => (
          <Row key={cat} title={cat} items={items} />
        ))}
      </div>
    </main>
  );
}

function Hero({ title, fav }: { title: Title; fav: ReturnType<typeof useFavorites> }) {
  const navigate = useNavigate();
  const poster = posterFor(title);
  const isFav = fav.has(title.id);
  return (
    <section className="relative h-[80vh] min-h-[520px] w-full overflow-hidden">
      <motion.img
        key={title.id} src={poster} alt={title.name}
        initial={{ scale: 1.08, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1.2 }}
        className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/50 to-transparent" />
      <div className="relative z-10 h-full flex items-end pb-32 max-w-[1600px] mx-auto px-4 md:px-10">
        <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, duration: 0.6 }} className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.3em] text-primary mb-3">Destaque</p>
          <h1 className="font-display text-5xl md:text-7xl mb-4 drop-shadow-lg">{title.name}</h1>
          {title.description && <p className="text-base md:text-lg text-foreground/80 mb-6 line-clamp-3">{title.description}</p>}
          <div className="flex gap-3">
            <button onClick={() => navigate({ to: "/streaming/watch/$id", params: { id: title.id } })}
              className="inline-flex items-center gap-2 bg-foreground text-background px-7 py-3 rounded-md font-bold hover:bg-foreground/90 transition">
              <Play className="w-5 h-5 fill-current" /> Assistir
            </button>
            <button onClick={() => fav.toggle(title.id)}
              className="inline-flex items-center gap-2 bg-secondary/80 text-foreground px-6 py-3 rounded-md font-semibold hover:bg-secondary transition ring-1 ring-border">
              {isFav ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              {isFav ? "Na lista" : "Minha lista"}
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Row({ title, items, progressMap, showCategory }: { title: string; items: Title[]; progressMap?: Record<string, { t: number; d: number }>; showCategory?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const scroll = (dir: 1 | -1) => {
    const el = ref.current; if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };
  return (
    <section className="group/row">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-xl md:text-2xl">{title}</h2>
      </div>
      <div className="relative">
        <button onClick={() => scroll(-1)} aria-label="Anterior"
          className="hidden md:flex absolute left-0 top-0 bottom-0 z-20 w-12 items-center justify-center bg-gradient-to-r from-background/80 to-transparent opacity-0 group-hover/row:opacity-100 transition">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div ref={ref} className="flex gap-3 overflow-x-auto scroll-smooth pb-4 -mx-4 md:-mx-10 px-4 md:px-10 snap-x [&::-webkit-scrollbar]:hidden">
          {items.map((t) => {
            const p = progressMap?.[t.id];
            const pct = p && p.d ? Math.min(100, (p.t / p.d) * 100) : 0;
            return (
              <Link key={t.id} to="/streaming/watch/$id" params={{ id: t.id }}
                onMouseEnter={() => setHovered(t.id)} onMouseLeave={() => setHovered((h) => h === t.id ? null : h)}
                className="relative shrink-0 snap-start nflx-tile rounded-md overflow-hidden ring-1 ring-border bg-card w-36 md:w-44 aspect-[2/3]">
                <img src={posterFor(t)} alt={t.name} loading="lazy"
                  className="w-full h-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
                  <div className="text-xs font-semibold line-clamp-2">{t.name}</div>
                </div>
                {pct > 0 && (
                  <div className="absolute bottom-0 inset-x-0 h-1 bg-black/60">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                )}
                <AnimatePresence>
                  {hovered === t.id && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Play className="w-10 h-10 text-foreground drop-shadow-lg fill-current" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Link>
            );
          })}
        </div>
        <button onClick={() => scroll(1)} aria-label="Próximo"
          className="hidden md:flex absolute right-0 top-0 bottom-0 z-20 w-12 items-center justify-center bg-gradient-to-l from-background/80 to-transparent opacity-0 group-hover/row:opacity-100 transition">
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>
    </section>
  );
}

// silence unused imports
void Info;
