import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { ArrowLeft, Heart, Maximize, Pause, Play, SkipForward, Volume2, VolumeX, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { detectExternalKind } from "@/components/cloud/types";
import { getStoredUserId } from "@/lib/cloud";
import { useFavorites, useHistory, useProgress, type Title, fetchCatalog } from "@/lib/streaming";
import { toast } from "sonner";

export const Route = createFileRoute("/streaming/watch/$id")({
  component: WatchPage,
});

function WatchPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const userId = getStoredUserId();
  const [title, setTitle] = useState<Title | null>(null);
  const [siblings, setSiblings] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const fav = useFavorites(userId);
  const hist = useHistory(userId);
  const prog = useProgress(userId);

  useEffect(() => {
    if (!userId) { navigate({ to: "/" }); return; }
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("files").select("*").eq("id", id).maybeSingle();
      if (!data || !data.external_url) { toast.error("Conteúdo não encontrado"); navigate({ to: "/streaming" }); return; }
      const t = data as Title;
      setTitle(t);
      hist.push(t.id);
      const { titles } = await fetchCatalog(userId);
      setSiblings(titles.filter((x) => x.folder_id === t.folder_id && x.id !== t.id));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, userId]);

  if (!userId) return null;
  if (loading || !title) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const next = siblings[0] ?? null;
  return (
    <main className="min-h-screen pt-20 pb-16 max-w-[1600px] mx-auto px-4 md:px-10">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => navigate({ to: "/streaming" })}
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <button onClick={() => fav.toggle(title.id)}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ring-1 transition ${fav.has(title.id) ? "bg-primary/20 text-primary ring-primary/40" : "bg-secondary text-muted-foreground ring-border hover:text-foreground"}`}>
          <Heart className={`w-4 h-4 ${fav.has(title.id) ? "fill-current" : ""}`} />
          {fav.has(title.id) ? "Na minha lista" : "Adicionar"}
        </button>
      </div>

      <PlayerSurface
        url={title.external_url!}
        name={title.name}
        initial={prog.get(title.id)?.t ?? 0}
        onProgress={(t, d) => prog.set(title.id, { t, d, at: Date.now() })}
        onEnded={() => next && navigate({ to: "/streaming/watch/$id", params: { id: next.id } })}
      />

      <div className="mt-6">
        <h1 className="font-display text-3xl md:text-4xl mb-2">{title.name}</h1>
        {title.description && <p className="text-muted-foreground max-w-3xl">{title.description}</p>}
      </div>

      {siblings.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl mb-4">Mais nesta categoria</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {siblings.slice(0, 12).map((s) => (
              <Link key={s.id} to="/streaming/watch/$id" params={{ id: s.id }}
                className="nflx-tile rounded-md overflow-hidden ring-1 ring-border bg-card aspect-[2/3] block">
                <img src={s.poster_url ?? ""} alt={s.name} loading="lazy" className="w-full h-full object-cover" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {next && (
        <button onClick={() => navigate({ to: "/streaming/watch/$id", params: { id: next.id } })}
          className="fixed bottom-24 md:bottom-8 right-4 md:right-10 z-30 inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-3 rounded-full font-semibold shadow-lg hover:opacity-90 transition">
          <SkipForward className="w-4 h-4" /> Próximo: {next.name.slice(0, 20)}
        </button>
      )}
    </main>
  );
}

function PlayerSurface({ url, name, initial, onProgress, onEnded }: {
  url: string; name: string; initial: number;
  onProgress: (t: number, d: number) => void;
  onEnded: () => void;
}) {
  const ext = detectExternalKind(url);
  const isHls = url.toLowerCase().includes(".m3u8");
  const isMp4 = ext?.kind === "video" && !isHls;
  const isEmbed = !isHls && !isMp4;

  if (isEmbed && ext) {
    return (
      <div className="relative aspect-video rounded-xl overflow-hidden ring-1 ring-border bg-black shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)]">
        <iframe src={ext.src} title={name} allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen className="absolute inset-0 w-full h-full" />
      </div>
    );
  }

  return <NativePlayer url={url} initial={initial} onProgress={onProgress} onEnded={onEnded} hls={isHls} />;
}

function NativePlayer({ url, initial, onProgress, onEnded, hls: useHls }: {
  url: string; initial: number;
  onProgress: (t: number, d: number) => void;
  onEnded: () => void; hls: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [vol, setVol] = useState(1);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [levels, setLevels] = useState<{ height: number; index: number }[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    if (useHls && Hls.isSupported()) {
      const inst = new Hls();
      hlsRef.current = inst;
      inst.loadSource(url);
      inst.attachMedia(v);
      inst.on(Hls.Events.MANIFEST_PARSED, () => {
        setLevels(inst.levels.map((l, i) => ({ height: l.height, index: i })));
        if (initial > 1) v.currentTime = initial;
      });
      return () => { inst.destroy(); hlsRef.current = null; };
    }
    v.src = url;
    if (initial > 1) v.currentTime = initial;
  }, [url, useHls, initial]);

  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const t = setInterval(() => { if (v.duration) onProgress(v.currentTime, v.duration); }, 4000);
    return () => clearInterval(t);
  }, [onProgress]);

  const togglePlay = () => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  };
  const toggleMute = () => {
    const v = videoRef.current; if (!v) return;
    v.muted = !v.muted; setMuted(v.muted);
  };
  const setVolume = (val: number) => {
    const v = videoRef.current; if (!v) return;
    v.volume = val; setVol(val); if (val > 0) { v.muted = false; setMuted(false); }
  };
  const seek = (val: number) => { const v = videoRef.current; if (!v) return; v.currentTime = val; setTime(val); };
  const fullscreen = () => { wrapRef.current?.requestFullscreen?.(); };
  const setQuality = (idx: number) => { if (hlsRef.current) hlsRef.current.currentLevel = idx; setCurrentLevel(idx); };

  const fmt = (n: number) => {
    if (!isFinite(n)) return "0:00";
    const m = Math.floor(n / 60); const s = Math.floor(n % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div ref={wrapRef} className="relative aspect-video rounded-xl overflow-hidden ring-1 ring-border bg-black shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] group">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full"
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime((e.target as HTMLVideoElement).currentTime)}
        onLoadedMetadata={(e) => setDur((e.target as HTMLVideoElement).duration)}
        onEnded={onEnded}
        playsInline
      />
      <div className="absolute inset-x-0 bottom-0 p-3 md:p-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent opacity-0 group-hover:opacity-100 transition">
        <input type="range" min={0} max={dur || 0} step={0.1} value={time}
          onChange={(e) => seek(Number(e.target.value))}
          className="w-full accent-primary mb-2 cursor-pointer" />
        <div className="flex items-center gap-3 text-foreground">
          <button onClick={togglePlay} className="hover:text-primary transition" aria-label={playing ? "Pausar" : "Reproduzir"}>
            {playing ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
          </button>
          <button onClick={toggleMute} className="hover:text-primary transition" aria-label="Mudo">
            {muted || vol === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : vol}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-20 accent-primary cursor-pointer" />
          <span className="text-xs text-foreground/80 tabular-nums">{fmt(time)} / {fmt(dur)}</span>
          <div className="ml-auto flex items-center gap-3">
            {levels.length > 0 && (
              <select value={currentLevel} onChange={(e) => setQuality(Number(e.target.value))}
                className="bg-black/60 ring-1 ring-white/20 rounded px-2 py-1 text-xs">
                <option value={-1}>Auto</option>
                {levels.map((l) => <option key={l.index} value={l.index}>{l.height}p</option>)}
              </select>
            )}
            <button onClick={onEnded} className="hover:text-primary transition" aria-label="Próximo"><SkipForward className="w-5 h-5" /></button>
            <button onClick={fullscreen} className="hover:text-primary transition" aria-label="Tela cheia"><Maximize className="w-5 h-5" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
