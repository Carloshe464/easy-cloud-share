export type FolderRow = { id: string; name: string; parent_id: string | null };
export type FileRow = {
  id: string;
  name: string;
  storage_path: string | null;
  size_bytes: number;
  mime_type: string | null;
  share_token: string;
  folder_id: string | null;
  external_url?: string | null;
  poster_url?: string | null;
  description?: string | null;
};

export type ItemKind = "file" | "folder";
export type SelectionKey = `${ItemKind}:${string}`;

export const key = (kind: ItemKind, id: string): SelectionKey => `${kind}:${id}`;

export function isImage(mime: string | null, name: string) {
  if (mime?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(name);
}
export function isVideo(mime: string | null, name: string) {
  if (mime?.startsWith("video/")) return true;
  return /\.(mp4|webm|mov|m4v|ogv)$/i.test(name);
}
export function isAudio(mime: string | null, name: string) {
  if (mime?.startsWith("audio/")) return true;
  return /\.(wav|mp3|ogg|m4a|flac|aac)$/i.test(name);
}

export type ExternalKind = "image" | "video" | "audio" | "youtube" | "vimeo" | "iframe";

export function detectExternalKind(raw: string): { kind: ExternalKind; src: string } | null {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  const href = url.toString();
  const path = url.pathname.toLowerCase();
  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtube.com" || host === "m.youtube.com") {
    const v = url.searchParams.get("v");
    if (v) return { kind: "youtube", src: `https://www.youtube.com/embed/${v}` };
    if (path.startsWith("/embed/")) return { kind: "youtube", src: href };
  }
  if (host === "youtu.be") {
    const id = path.replace(/^\//, "");
    if (id) return { kind: "youtube", src: `https://www.youtube.com/embed/${id}` };
  }
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

export function youtubeThumb(embedSrc: string): string | null {
  const m = embedSrc.match(/embed\/([\w-]+)/);
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null;
}

export const EXTERNAL_LINK_MIME = "application/x-external-link";
export function isExternalLink(file: FileRow): boolean {
  return !!file.external_url || file.mime_type === EXTERNAL_LINK_MIME;
}
