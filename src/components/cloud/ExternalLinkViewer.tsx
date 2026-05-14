import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Link as LinkIcon, X } from "lucide-react";

type Kind = "image" | "video" | "audio" | "youtube" | "vimeo" | "iframe";

function detectKind(raw: string): { kind: Kind; src: string } | null {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  const href = url.toString();
  const path = url.pathname.toLowerCase();
  const host = url.hostname.replace(/^www\./, "");

  // YouTube
  if (host === "youtube.com" || host === "m.youtube.com") {
    const v = url.searchParams.get("v");
    if (v) return { kind: "youtube", src: `https://www.youtube.com/embed/${v}` };
    if (path.startsWith("/embed/")) return { kind: "youtube", src: href };
  }
  if (host === "youtu.be") {
    const id = path.replace(/^\//, "");
    if (id) return { kind: "youtube", src: `https://www.youtube.com/embed/${id}` };
  }
  // Vimeo
  if (host === "vimeo.com") {
    const id = path.replace(/^\//, "").split("/")[0];
    if (/^\d+$/.test(id)) return { kind: "vimeo", src: `https://player.vimeo.com/video/${id}` };
  }
  if (host === "player.vimeo.com") return { kind: "vimeo", src: href };

  if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(path)) return { kind: "image", src: href };
  if (/\.(mp4|webm|ogv|mov|m4v)$/i.test(path)) return { kind: "video", src: href };
  if (/\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(path)) return { kind: "audio", src: href };
  return { kind: "iframe", src: href };
}

export function ExternalLinkViewer({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const detected = useMemo(() => (submitted ? detectKind(submitted) : null), [submitted]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-150">
      <div className="border-b border-border/60 px-4 py-3 flex items-center gap-3">
        <LinkIcon className="w-5 h-5 text-primary shrink-0" strokeWidth={1.5} />
        <form
          onSubmit={(e) => { e.preventDefault(); setSubmitted(input); }}
          className="flex-1 flex items-center gap-2 min-w-0"
        >
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Cole um link de imagem, vídeo, YouTube, Vimeo, PDF…"
            className="flex-1 bg-secondary/60 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary min-w-0"
          />
          <button
            type="submit"
            className="bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm font-medium hover:opacity-90"
          >
            Abrir
          </button>
        </form>
        {submitted && (
          <a
            href={submitted}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary"
            aria-label="Abrir em nova aba"
            title="Abrir em nova aba"
          >
            <ExternalLink className="w-5 h-5" />
          </a>
        )}
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 p-4 flex items-center justify-center">
        {!submitted ? (
          <div className="text-center text-muted-foreground max-w-sm">
            <LinkIcon className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Cole um link acima para visualizar imagens, vídeos do YouTube/Vimeo, áudios ou páginas.</p>
          </div>
        ) : !detected ? (
          <div className="text-center text-destructive">URL inválida.</div>
        ) : detected.kind === "image" ? (
          <img src={detected.src} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
        ) : detected.kind === "video" ? (
          <video src={detected.src} controls autoPlay className="max-w-full max-h-full rounded-lg" />
        ) : detected.kind === "audio" ? (
          <audio src={detected.src} controls autoPlay className="w-full max-w-xl" />
        ) : (
          <iframe
            src={detected.src}
            title="Visualização externa"
            className="w-full h-full rounded-lg bg-card"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        )}
      </div>
    </div>
  );
}
