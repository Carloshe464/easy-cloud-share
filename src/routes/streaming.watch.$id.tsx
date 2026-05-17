import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import {
  ArrowLeft, Check, Heart, Maximize, Pause, Play, SkipForward,
  Volume2, VolumeX, Loader2, Gauge, Subtitles, Settings,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { detectExternalKind } from "@/components/cloud/types";
import { getStoredUserId } from "@/lib/cloud";
import { useFavorites, useHistory, useProgress, posterFor, fetchCatalog, type Title } from "@/lib/streaming";
import { toast } from "sonner";

export const Route = createFileRoute("/streaming/watch/$id")({
  component: WatchPage,
});

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function WatchPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const userId = getStoredUserId();
  const [title, setTitle] = useState<Title | null>(null);
  const [episodes, setEpisodes] = useState<Title[]>([]);
  const [related, setRelated] = useState<Title[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"episodes" | "related">("episodes");
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
      // Access control: must be public or owned by current user
      if (!t.is_public && t.user_id !== userId) {
        toast.error("Este conteúdo é privado"); navigate({ to: "/streaming" }); return;
      }
      setTitle(t);
      hist.push(t.id);
      const { titles } = await fetchCatalog(userId);
      // Episodes = same owner + same folder (mirrors Minha Nuvem structure)
      const eps = titles.filter((x) => x.user_id === t.user_id && x.folder_id === t.folder_id);
      setEpisodes(eps);
      setRelated(titles.filter((x) => x.id !== t.id && x.folder_id !== t.folder_id).slice(0, 18));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, userId]);

  if (!userId) return null;
  if (loading || !title) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const currentIdx = episodes.findIndex((e) => e.id === title.id);
  const next = currentIdx >= 0 && currentIdx < episodes.length - 1 ? episodes[currentIdx + 1] : null;

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

      <div className="mt-6 grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <h1 className="font-display text-3xl md:text-4xl mb-2">{title.name}</h1>
          {title.category && (
            <p className="text-xs uppercase tracking-[0.25em] text-primary/80 mb-3">{title.category}</p>
          )}
          {title.description && <p className="text-muted-foreground max-w-3xl leading-relaxed">{title.description}</p>}
        </div>
        <div className="text-sm text-muted-foreground space-y-2">
          <div><span className="text-foreground/70 font-medium">Origem:</span> {title.external_url ? new URL(title.external_url).hostname.replace(/^www\./, "") : "—"}</div>
          {title.is_public ? (
            <div className="inline-flex items-center gap-1.5 text-primary"><Check className="w-3.5 h-3.5" /> Compartilhado pela comunidade</div>
          ) : (
            <div className="text-muted-foreground">Conteúdo privado (apenas você)</div>
          )}
        </div>
      </div>

      <section className="mt-10">
        <div className="flex items-center gap-6 border-b border-border mb-5">
          <TabBtn active={tab === "episodes"} onClick={() => setTab("episodes")}>
            Episódios <span className="text-muted-foreground ml-1">({episodes.length})</span>
          </TabBtn>
          <TabBtn active={tab === "related"} onClick={() => setTab("related")}>
            Títulos semelhantes
          </TabBtn>
        </div>

        {tab === "episodes" ? (
          <EpisodeList items={episodes} currentId={title.id} progressMap={prog.map} />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {related.map((s) => (
              <Link key={s.id} to="/streaming/watch/$id" params={{ id: s.id }}
                className="nflx-tile rounded-md overflow-hidden ring-1 ring-border bg-card aspect-[2/3] block">
                <img src={posterFor(s)} alt={s.name} loading="lazy" className="w-full h-full object-cover" />
              </Link>
            ))}
            {related.length === 0 && <p className="col-span-full text-muted-foreground text-sm">Nada por aqui ainda.</p>}
          </div>
        )}
      </section>

      {next && (
        <button onClick={() => navigate({ to: "/streaming/watch/$id", params: { id: next.id } })}
          className="fixed bottom-6 right-4 md:right-10 z-30 inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-3 rounded-full font-semibold shadow-lg hover:opacity-90 transition">
          <SkipForward className="w-4 h-4" /> Próximo: {next.name.slice(0, 22)}
        </button>
      )}
    </main>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`relative pb-3 text-sm font-semibold uppercase tracking-wider transition ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
      {children}
      {active && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded" />}
    </button>
  );
}

function EpisodeList({ items, currentId, progressMap }:
  { items: Title[]; currentId: string; progressMap: Record<string, { t: number; d: number }> }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">Nenhum outro item nesta pasta.</p>;
  }
  return (
    <ul className="divide-y divide-border/60 ring-1 ring-border rounded-xl overflow-hidden bg-card/30">
      {items.map((ep, i) => {
        const isCurrent = ep.id === currentId;
        const p = progressMap[ep.id];
        const pct = p && p.d ? Math.min(100, (p.t / p.d) * 100) : 0;
        return (
          <li key={ep.id} className={`transition ${isCurrent ? "bg-primary/10" : "hover:bg-secondary/40"}`}>
            <Link to="/streaming/watch/$id" params={{ id: ep.id }}
              className="flex items-stretch gap-4 p-3 md:p-4">
              <div className="text-2xl font-display text-muted-foreground w-8 shrink-0 self-center text-center">
                {i + 1}
              </div>
              <div className="relative shrink-0 w-40 md:w-56 aspect-video rounded-md overflow-hidden ring-1 ring-border bg-black">
                <img src={posterFor(ep)} alt={ep.name} loading="lazy" className="w-full h-full object-cover" />
                {isCurrent && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Play className="w-8 h-8 text-foreground fill-current drop-shadow" />
                  </div>
                )}
                {pct > 0 && (
                  <div className="absolute bottom-0 inset-x-0 h-1 bg-black/60">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 self-center">
                <div className="flex items-center gap-2">
                  <h3 className={`font-semibold truncate ${isCurrent ? "text-primary" : ""}`}>{ep.name}</h3>
                  {isCurrent && <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/20 text-primary">Assistindo</span>}
                </div>
                {ep.description && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{ep.description}</p>}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
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
  const [speed, setSpeed] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [subtitlesOn, setSubtitlesOn] = useState(false);
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

  // sync tracks visibility
  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const tracks = v.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = subtitlesOn ? "showing" : "hidden";
    }
  }, [subtitlesOn]);

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
  const skip = (delta: number) => { const v = videoRef.current; if (!v) return; v.currentTime = Math.max(0, Math.min((v.duration || 0), v.currentTime + delta)); };
  const fullscreen = () => { wrapRef.current?.requestFullscreen?.(); };
  const setQuality = (idx: number) => { if (hlsRef.current) hlsRef.current.currentLevel = idx; setCurrentLevel(idx); };
  const changeSpeed = (s: number) => { const v = videoRef.current; if (!v) return; v.playbackRate = s; setSpeed(s); };

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

      {/* Skip back/forward overlay buttons */}
      <div className="absolute inset-0 flex items-center justify-center gap-10 opacity-0 group-hover:opacity-100 transition pointer-events-none">
        <button onClick={() => skip(-10)} className="pointer-events-auto bg-black/40 hover:bg-black/60 backdrop-blur rounded-full p-3 text-foreground" aria-label="Voltar 10s">
          <span className="text-xs font-bold">−10s</span>
        </button>
        <button onClick={togglePlay} className="pointer-events-auto bg-black/40 hover:bg-black/60 backdrop-blur rounded-full p-4 text-foreground" aria-label={playing ? "Pausar" : "Reproduzir"}>
          {playing ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current" />}
        </button>
        <button onClick={() => skip(10)} className="pointer-events-auto bg-black/40 hover:bg-black/60 backdrop-blur rounded-full p-3 text-foreground" aria-label="Avançar 10s">
          <span className="text-xs font-bold">+10s</span>
        </button>
      </div>

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
            <button onClick={() => setSubtitlesOn((v) => !v)}
              className={`transition ${subtitlesOn ? "text-primary" : "hover:text-primary"}`} aria-label="Legendas">
              <Subtitles className="w-5 h-5" />
            </button>

            {/* Settings popover */}
            <div className="relative">
              <button onClick={() => setSettingsOpen((v) => !v)}
                className={`transition ${settingsOpen ? "text-primary" : "hover:text-primary"}`} aria-label="Ajustes">
                <Settings className="w-5 h-5" />
              </button>
              {settingsOpen && (
                <div className="absolute right-0 bottom-9 w-56 bg-black/90 backdrop-blur ring-1 ring-white/10 rounded-md p-3 text-sm shadow-2xl">
                  <div className="mb-3">
                    <div className="text-xs uppercase tracking-wider text-foreground/60 mb-1.5 inline-flex items-center gap-1"><Gauge className="w-3 h-3" /> Velocidade</div>
                    <div className="grid grid-cols-3 gap-1">
                      {SPEEDS.map((s) => (
                        <button key={s} onClick={() => changeSpeed(s)}
                          className={`px-2 py-1 rounded text-xs font-medium transition ${speed === s ? "bg-primary text-primary-foreground" : "bg-white/10 hover:bg-white/20"}`}>
                          {s}x
                        </button>
                      ))}
                    </div>
                  </div>
                  {levels.length > 0 && (
                    <div>
                      <div className="text-xs uppercase tracking-wider text-foreground/60 mb-1.5">Qualidade</div>
                      <div className="flex flex-wrap gap-1">
                        <button onClick={() => setQuality(-1)}
                          className={`px-2 py-1 rounded text-xs font-medium transition ${currentLevel === -1 ? "bg-primary text-primary-foreground" : "bg-white/10 hover:bg-white/20"}`}>
                          Auto
                        </button>
                        {levels.map((l) => (
                          <button key={l.index} onClick={() => setQuality(l.index)}
                            className={`px-2 py-1 rounded text-xs font-medium transition ${currentLevel === l.index ? "bg-primary text-primary-foreground" : "bg-white/10 hover:bg-white/20"}`}>
                            {l.height}p
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button onClick={onEnded} className="hover:text-primary transition" aria-label="Próximo"><SkipForward className="w-5 h-5" /></button>
            <button onClick={fullscreen} className="hover:text-primary transition" aria-label="Tela cheia"><Maximize className="w-5 h-5" /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
