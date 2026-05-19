import { Download, ExternalLink, FileIcon, Link2, Loader2, Pencil, X } from "lucide-react";
import { formatBytes, publicUrl } from "@/lib/cloud";
import {
  detectExternalKind, isAudio, isExternalLink, isImage, isVideo, type FileRow,
} from "./types";
import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { resolveStreamFn } from "@/lib/stream.functions";

export function PreviewCard({ file, onClose, onEditLink }: {
  file: FileRow;
  onClose: () => void;
  onEditLink?: (file: FileRow) => void;
}) {
  const ext = isExternalLink(file) && file.external_url ? detectExternalKind(file.external_url) : null;
  const url = !ext && file.storage_path ? publicUrl(file.storage_path) : "";
  const img = !ext && isImage(file.mime_type, file.name);
  const vid = !ext && isVideo(file.mime_type, file.name);
  const aud = !ext && isAudio(file.mime_type, file.name);
  const pdf = !ext && (file.mime_type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-150">
      <div className="border-b border-border/60 px-4 py-3 flex items-center gap-3">
        {ext ? <Link2 className="w-5 h-5 text-primary shrink-0" strokeWidth={1.5} />
             : <FileIcon className="w-5 h-5 text-primary shrink-0" strokeWidth={1.5} />}
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{file.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {ext ? file.external_url : formatBytes(file.size_bytes)}
          </div>
        </div>
        {ext ? (
          <>
            {onEditLink && (
              <button onClick={() => onEditLink(file)}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition"
                aria-label="Editar link">
                <Pencil className="w-5 h-5" />
              </button>
            )}
            <a href={file.external_url!} target="_blank" rel="noopener noreferrer"
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition"
              aria-label="Abrir em nova aba">
              <ExternalLink className="w-5 h-5" />
            </a>
          </>
        ) : url && (
          <a href={url} download={file.name} target="_blank" rel="noopener"
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition"
            aria-label="Baixar">
            <Download className="w-5 h-5" />
          </a>
        )}
        <button onClick={onClose}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition"
          aria-label="Fechar">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 p-4 flex items-center justify-center">
        {ext ? (
          ext.kind === "image" ? (
            <img src={ext.src} alt={file.name} className="max-w-full max-h-full object-contain rounded-lg" />
          ) : ext.kind === "video" ? (
            <video src={ext.src} controls autoPlay className="max-w-full max-h-full rounded-lg" />
          ) : ext.kind === "audio" ? (
            <audio src={ext.src} controls autoPlay className="w-full max-w-xl" />
          ) : (
            <iframe src={ext.src} title={file.name} className="w-full h-full rounded-lg bg-card"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          )
        ) : img ? (
          <img src={url} alt={file.name} className="max-w-full max-h-full object-contain rounded-lg" />
        ) : vid ? (
          <video src={url} controls autoPlay className="max-w-full max-h-full rounded-lg" />
        ) : aud ? (
          <audio src={url} controls autoPlay className="w-full max-w-xl" />
        ) : pdf ? (
          <iframe src={url} title={file.name} className="w-full h-full rounded-lg bg-card" />
        ) : (
          <div className="text-center max-w-sm">
            <FileIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground" strokeWidth={1.2} />
            <h2 className="font-display text-xl font-bold mb-2">Pré-visualização indisponível</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Este tipo de arquivo pode ser baixado, mas não visualizado diretamente no app.
            </p>
            {url && (
              <a href={url} download={file.name} target="_blank" rel="noopener"
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-5 py-3 font-semibold hover:opacity-90">
                <Download className="w-5 h-5" /> Baixar arquivo
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
