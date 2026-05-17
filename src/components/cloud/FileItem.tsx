import { FileIcon, Globe, Link2, Music, Play } from "lucide-react";
import { useState } from "react";
import { formatBytes, publicUrl } from "@/lib/cloud";
import {
  detectExternalKind, isAudio, isExternalLink, isImage, isVideo, youtubeThumb,
  type FileRow,
} from "./types";

type Props = {
  file: FileRow;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
};

export function FileItem({ file, selected, onClick, onDoubleClick, onDragStart }: Props) {
  const [errored, setErrored] = useState(false);
  const ext = isExternalLink(file) && file.external_url ? detectExternalKind(file.external_url) : null;

  const url = !ext && file.storage_path ? publicUrl(file.storage_path) : "";
  const img = !ext && isImage(file.mime_type, file.name);
  const vid = !ext && isVideo(file.mime_type, file.name);
  const aud = !ext && isAudio(file.mime_type, file.name);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      aria-selected={selected}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={(e) => { if (e.key === "Enter") onDoubleClick(); }}
      onDragStart={onDragStart}
      className={[
        "nflx-tile group select-none cursor-pointer rounded-md ring-1 overflow-hidden",
        "bg-card",
        selected ? "ring-2 ring-primary" : "ring-border/60",
      ].join(" ")}
    >
      <div className="relative aspect-video w-full bg-secondary/40 flex items-center justify-center overflow-hidden">
        {ext ? (
          ext.kind === "image" && !errored ? (
            <img src={ext.src} alt={file.name} loading="lazy" onError={() => setErrored(true)}
              className="w-full h-full object-cover" draggable={false} />
          ) : ext.kind === "youtube" ? (
            <>
              {youtubeThumb(ext.src) && !errored ? (
                <img src={youtubeThumb(ext.src)!} alt={file.name} loading="lazy"
                  onError={() => setErrored(true)} className="w-full h-full object-cover" draggable={false} />
              ) : <Link2 className="w-12 h-12 text-primary/70" strokeWidth={1.2} />}
              <Play className="absolute w-10 h-10 text-white drop-shadow-lg" fill="currentColor" />
            </>
          ) : ext.kind === "video" && !errored ? (
            <video src={`${ext.src}#t=0.5`} preload="metadata" muted playsInline
              onError={() => setErrored(true)} className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-primary/70">
              <Link2 className="w-10 h-10" strokeWidth={1.2} />
              <span className="text-[10px] uppercase tracking-wider">{ext.kind}</span>
            </div>
          )
        ) : img && !errored ? (
          <img src={url} alt={file.name} loading="lazy" decoding="async"
            onError={() => setErrored(true)} className="w-full h-full object-cover" draggable={false} />
        ) : vid && !errored ? (
          <video src={`${url}#t=0.5`} preload="metadata" muted playsInline
            onError={() => setErrored(true)} className="w-full h-full object-cover" />
        ) : aud ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-3">
            <Music className="w-8 h-8 text-primary" strokeWidth={1.5} />
            <audio src={url} controls className="w-full max-w-[220px]" onClick={(e) => e.stopPropagation()} />
          </div>
        ) : (
          <FileIcon className="w-12 h-12 text-primary/70" strokeWidth={1.2} />
        )}
        {selected && (
          <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center shadow-md">
            ✓
          </div>
        )}
        {ext && (
          <div className="absolute top-2 right-2 bg-black/60 text-white rounded-md p-1">
            <Link2 className="w-3 h-3" />
          </div>
        )}
        {file.is_public && (
          <div className="absolute bottom-2 right-2 bg-primary/90 text-primary-foreground rounded-md px-1.5 py-0.5 text-[10px] font-bold inline-flex items-center gap-1 shadow">
            <Globe className="w-3 h-3" /> Play
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="font-medium truncate text-sm">{file.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {ext ? new URL(file.external_url!).hostname.replace(/^www\./, "") : formatBytes(file.size_bytes)}
        </div>
      </div>
    </div>
  );
}
