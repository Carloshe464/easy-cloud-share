export type FolderRow = { id: string; name: string; parent_id: string | null };
export type FileRow = {
  id: string;
  name: string;
  storage_path: string;
  size_bytes: number;
  mime_type: string | null;
  share_token: string;
  folder_id: string | null;
};

export type ItemKind = "file" | "folder";
export type SelectionKey = `${ItemKind}:${string}`;

export const key = (kind: ItemKind, id: string): SelectionKey => `${kind}:${id}`;

export function isImage(mime: string | null, name: string) {
  if (mime?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp)$/i.test(name);
}
export function isVideo(mime: string | null, name: string) {
  if (mime?.startsWith("video/")) return true;
  return /\.(mp4|webm|mov)$/i.test(name);
}
export function isAudio(mime: string | null, name: string) {
  if (mime?.startsWith("audio/")) return true;
  return /\.(wav|mp3|ogg)$/i.test(name);
}
