import { FileIcon, Music } from "lucide-react";
import { useState } from "react";
import { formatBytes, publicUrl } from "@/lib/cloud";
import { isAudio, isImage, isVideo, type FileRow } from "./types";

type Props = {
  file: FileRow;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
};

export function FileItem({ file, selected, onClick, onDoubleClick, onDragStart }: Props) {
  const url = publicUrl(file.storage_path);
  const img = isImage(file.mime_type, file.name);
  const vid = isVideo(file.mime_type, file.name);
  const aud = isAudio(file.mime_type, file.name);
  const [errored, setErrored] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      aria-selected={selected}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDoubleClick();
      }}
      onDragStart={onDragStart}
      className={[
        "nflx-tile group select-none cursor-pointer rounded-md ring-1 overflow-hidden",
        "bg-card",
        selected ? "ring-2 ring-primary" : "ring-border/60",
      ].join(" ")}
    >
      <div className="relative aspect-video w-full bg-secondary/40 flex items-center justify-center overflow-hidden">
        {img && !errored ? (
          <img
            src={url}
            alt={file.name}
            loading="lazy"
            decoding="async"
            onError={() => setErrored(true)}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : vid && !errored ? (
          <video
            src={`${url}#t=0.5`}
            preload="metadata"
            muted
            playsInline
            onError={() => setErrored(true)}
            className="w-full h-full object-cover"
          />
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
      </div>
      <div className="p-3">
        <div className="font-medium truncate text-sm">{file.name}</div>
        <div className="text-xs text-muted-foreground">{formatBytes(file.size_bytes)}</div>
      </div>
    </div>
  );
}
