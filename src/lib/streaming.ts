import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { FileRow, FolderRow } from "@/components/cloud/types";
import { detectExternalKind, youtubeThumb, EXTERNAL_LINK_MIME } from "@/components/cloud/types";

export type Title = FileRow & { category?: string | null };

export function posterFor(t: Title): string {
  if (t.poster_url) return t.poster_url;
  if (t.external_url) {
    const k = detectExternalKind(t.external_url);
    if (k?.kind === "youtube") {
      const tb = youtubeThumb(k.src);
      if (tb) return tb;
    }
    if (k?.kind === "image") return k.src;
  }
  // gradient fallback (data URI tiny svg)
  const seed = (t.id || t.name).slice(0, 6);
  const hue = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 600'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${hue} 60% 25%)'/><stop offset='1' stop-color='hsl(${(hue+40)%360} 70% 12%)'/></linearGradient></defs><rect width='400' height='600' fill='url(#g)'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function fetchCatalog(userId: string): Promise<{
  folders: FolderRow[];
  titles: Title[];
}> {
  // Public catalog = items any user has shared via "Publicar no Play"
  // PLUS items owned by the current user (so own items show even if not public yet — useful for admin/seeded demos)
  const { data: files } = await supabase
    .from("files")
    .select("*")
    .not("external_url", "is", null)
    .or(`is_public.eq.true,user_id.eq.${userId}`)
    .order("created_at", { ascending: false });

  const fileRows = (files ?? []) as FileRow[];
  const folderIds = Array.from(new Set(fileRows.map((f) => f.folder_id).filter((x): x is string => !!x)));
  let folders: FolderRow[] = [];
  if (folderIds.length) {
    const { data } = await supabase.from("folders").select("*").in("id", folderIds);
    folders = (data ?? []) as FolderRow[];
  }
  const fmap = new Map(folders.map((f) => [f.id, f.name]));
  const titles: Title[] = fileRows.map((f) => ({
    ...f,
    category: f.folder_id ? fmap.get(f.folder_id) ?? null : null,
  }));
  return { folders, titles };
}

// localStorage state ----------------------------------------------------------
type Map<T = unknown> = Record<string, T>;
const KEYS = {
  fav: (uid: string) => `nflx:fav:${uid}`,
  hist: (uid: string) => `nflx:hist:${uid}`,
  prog: (uid: string) => `nflx:prog:${uid}`,
};

function read<T>(k: string, fb: T): T {
  if (typeof window === "undefined") return fb;
  try { return JSON.parse(localStorage.getItem(k) || "") as T; } catch { return fb; }
}
function write(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
}

export function useFavorites(userId: string | null) {
  const k = userId ? KEYS.fav(userId) : "";
  const [ids, setIds] = useState<string[]>(() => userId ? read<string[]>(k, []) : []);
  useEffect(() => { if (userId) setIds(read<string[]>(k, [])); }, [userId, k]);
  const toggle = useCallback((id: string) => {
    setIds((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      if (k) write(k, next);
      return next;
    });
  }, [k]);
  return { ids, toggle, has: (id: string) => ids.includes(id) };
}

export function useHistory(userId: string | null) {
  const k = userId ? KEYS.hist(userId) : "";
  const [ids, setIds] = useState<string[]>(() => userId ? read<string[]>(k, []) : []);
  useEffect(() => { if (userId) setIds(read<string[]>(k, [])); }, [userId, k]);
  const push = useCallback((id: string) => {
    setIds((cur) => {
      const next = [id, ...cur.filter((x) => x !== id)].slice(0, 30);
      if (k) write(k, next);
      return next;
    });
  }, [k]);
  return { ids, push };
}

export type Progress = { t: number; d: number; at: number };
export function useProgress(userId: string | null) {
  const k = userId ? KEYS.prog(userId) : "";
  const [map, setMap] = useState<Map<Progress>>(() => userId ? read<Map<Progress>>(k, {}) : {});
  useEffect(() => { if (userId) setMap(read<Map<Progress>>(k, {})); }, [userId, k]);
  const set = useCallback((id: string, p: Progress) => {
    setMap((cur) => {
      const next = { ...cur, [id]: p };
      if (k) write(k, next);
      return next;
    });
  }, [k]);
  return { map, set, get: (id: string): Progress | undefined => map[id] };
}

export const SAMPLE_CATALOG: Array<{ category: string; items: Array<{ name: string; url: string; poster: string; description: string }> }> = [
  {
    category: "Tendências",
    items: [
      { name: "Big Buck Bunny", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", poster: "https://image.tmdb.org/t/p/w500/uVEFQvFMMsg4e6yb03xOu2F1pH8.jpg", description: "Um coelho gigante e bondoso enfrenta três roedores sem coração." },
      { name: "Sintel", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4", poster: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Sintel_poster.jpg/640px-Sintel_poster.jpg", description: "A jornada épica de uma jovem em busca do seu dragão perdido." },
      { name: "Tears of Steel", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4", poster: "https://mango.blender.org/wp-content/gallery/4k-renders/01_thom_celia_bridge.jpg", description: "Ficção científica com efeitos visuais impressionantes." },
      { name: "Elephant's Dream", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4", poster: "https://orange.blender.org/wp-content/themes/orange/images/media/gallery/s7_proog2.jpg", description: "Dois personagens exploram um mundo bizarro de máquinas." },
    ],
  },
  {
    category: "Trailers",
    items: [
      { name: "Inception (Trailer)", url: "https://www.youtube.com/watch?v=YoHD9XEInc0", poster: "https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg", description: "Um ladrão que invade sonhos é desafiado a plantar uma ideia." },
      { name: "Interstellar (Trailer)", url: "https://www.youtube.com/watch?v=zSWdZVtXT7E", poster: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", description: "Exploradores viajam por um buraco de minhoca para salvar a humanidade." },
      { name: "Tenet (Trailer)", url: "https://www.youtube.com/watch?v=L3pk_TBkihU", poster: "https://image.tmdb.org/t/p/w500/k68nPLbIST6NP96JmTxmZijEvCA.jpg", description: "Armado com uma única palavra, um agente luta para salvar o mundo." },
      { name: "Dune (Trailer)", url: "https://www.youtube.com/watch?v=8g18jFHCLXk", poster: "https://image.tmdb.org/t/p/w500/d5NXSklXo0qyIYkgV94XAgMIckC.jpg", description: "Paul Atreides lidera nômades em uma revolta contra um inimigo brutal." },
      { name: "Oppenheimer (Trailer)", url: "https://www.youtube.com/watch?v=uYPbbksJxIg", poster: "https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", description: "A história do físico que ajudou a criar a bomba atômica." },
    ],
  },
  {
    category: "Animações",
    items: [
      { name: "Caminandes 3", url: "https://www.youtube.com/watch?v=SkVqJ1SGeL0", poster: "https://i.ytimg.com/vi/SkVqJ1SGeL0/maxresdefault.jpg", description: "Uma lhama curiosa enfrenta a Patagônia gelada." },
      { name: "Spring", url: "https://www.youtube.com/watch?v=WhWc3b3KhnY", poster: "https://i.ytimg.com/vi/WhWc3b3KhnY/maxresdefault.jpg", description: "Uma jovem pastora e seu cachorro despertam o ciclo das estações." },
      { name: "Agent 327", url: "https://www.youtube.com/watch?v=mN0zPOpADL4", poster: "https://i.ytimg.com/vi/mN0zPOpADL4/maxresdefault.jpg", description: "Um agente secreto holandês em uma missão perigosa." },
    ],
  },
];

export async function seedDemoCatalog(userId: string): Promise<number> {
  let count = 0;
  for (const cat of SAMPLE_CATALOG) {
    let folderId: string | null = null;
    const { data: existing } = await supabase
      .from("folders").select("id").eq("user_id", userId).eq("name", cat.category).maybeSingle();
    if (existing) folderId = existing.id;
    else {
      const { data: created } = await supabase
        .from("folders").insert({ user_id: userId, name: cat.category, parent_id: null })
        .select("id").single();
      folderId = created?.id ?? null;
    }
    for (const it of cat.items) {
      const { data: dup } = await supabase
        .from("files").select("id")
        .eq("user_id", userId).eq("external_url", it.url).maybeSingle();
      if (dup) continue;
      await supabase.from("files").insert({
        user_id: userId,
        folder_id: folderId,
        name: it.name,
        external_url: it.url,
        poster_url: it.poster,
        description: it.description,
        mime_type: EXTERNAL_LINK_MIME,
        size_bytes: 0,
        is_public: true,
      });
      count++;
    }
  }
  return count;
}
