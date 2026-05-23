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
  is_public?: boolean | null;
  user_id?: string;
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
  const rawPath = url.pathname;
  const path = rawPath.toLowerCase();
  const host = url.hostname.replace(/^www\./, "");

  if (host === "youtube.com" || host === "m.youtube.com") {
    const v = url.searchParams.get("v");
    if (v) return { kind: "youtube", src: `https://www.youtube.com/embed/${v}` };
    if (path.startsWith("/embed/")) return { kind: "youtube", src: href };
  }
  if (host === "youtu.be") {
    const id = rawPath.replace(/^\//, "").split(/[?#]/)[0];
    if (id) return { kind: "youtube", src: `https://www.youtube.com/embed/${id}` };
  }
  if (host === "vimeo.com") {
    const id = path.replace(/^\//, "").split("/")[0];
    if (/^\d+$/.test(id)) return { kind: "vimeo", src: `https://player.vimeo.com/video/${id}` };
  }
  if (host === "player.vimeo.com") return { kind: "vimeo", src: href };

  // Google Drive — convert public share URLs to embeddable preview player
  if (host === "drive.google.com" || host === "docs.google.com") {
    let id: string | null = null;
    const m = rawPath.match(/\/file\/d\/([\w-]{10,})/i);
    if (m) id = m[1];
    if (!id) id = url.searchParams.get("id");
    if (id) return { kind: "iframe", src: `https://drive.google.com/file/d/${id}/preview` };
  }
  // Mega.nz — public file links → embed player
  if (host === "mega.nz" || host === "mega.co.nz") {
    const m = rawPath.match(/\/file\/([\w-]+)/i);
    if (m) return { kind: "iframe", src: `https://mega.nz/embed/${m[1]}${url.hash || ""}` };
    const m2 = rawPath.match(/\/embed\/([\w-]+)/i);
    if (m2) return { kind: "iframe", src: href };
  }

  // Dailymotion
  if (host === "dailymotion.com") {
    const m = path.match(/\/video\/([\w]+)/);
    if (m) return { kind: "iframe", src: `https://www.dailymotion.com/embed/video/${m[1]}` };
  }
  if (host === "dai.ly") {
    const id = rawPath.replace(/^\//, "");
    if (id) return { kind: "iframe", src: `https://www.dailymotion.com/embed/video/${id}` };
  }

  // Twitch clip / video
  if (host === "twitch.tv" || host === "clips.twitch.tv") {
    const parent = "lovable.app";
    const clip = rawPath.match(/\/clip\/([\w-]+)/i) || (host === "clips.twitch.tv" ? [null, rawPath.slice(1)] : null);
    if (clip && clip[1]) return { kind: "iframe", src: `https://clips.twitch.tv/embed?clip=${clip[1]}&parent=${parent}` };
    const vid = path.match(/\/videos\/(\d+)/);
    if (vid) return { kind: "iframe", src: `https://player.twitch.tv/?video=${vid[1]}&parent=${parent}` };
  }

  // TikTok
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    const m = rawPath.match(/\/video\/(\d+)/i);
    if (m) return { kind: "iframe", src: `https://www.tiktok.com/embed/v2/${m[1]}` };
  }

  // Facebook video / reels / watch
  if (host === "facebook.com" || host === "m.facebook.com" || host === "fb.watch") {
    return { kind: "iframe", src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(href)}&show_text=false&autoplay=true` };
  }

  // Instagram reels / posts
  if (host === "instagram.com") {
    const m = rawPath.match(/\/(reel|p|tv)\/([\w-]+)/i);
    if (m) return { kind: "iframe", src: `https://www.instagram.com/${m[1]}/${m[2]}/embed` };
  }

  // X / Twitter status
  if (host === "twitter.com" || host === "x.com") {
    const m = rawPath.match(/\/status\/(\d+)/i);
    if (m) return { kind: "iframe", src: `https://platform.twitter.com/embed/Tweet.html?id=${m[1]}` };
  }

  // Streamable
  if (host === "streamable.com") {
    const id = rawPath.replace(/^\/(e\/)?/i, "").split(/[/?#]/)[0];
    if (id) return { kind: "iframe", src: `https://streamable.com/e/${id}` };
  }

  // Odysee
  if (host === "odysee.com") {
    return { kind: "iframe", src: href.replace("odysee.com/", "odysee.com/$/embed/") };
  }

  // Rumble
  if (host === "rumble.com") {
    const m = rawPath.match(/\/(v[\w-]+)/i);
    if (m) return { kind: "iframe", src: `https://rumble.com/embed/${m[1]}/` };
  }

  // Kick
  if (host === "kick.com") {
    const m = rawPath.match(/\/video\/([\w-]+)/i);
    if (m) return { kind: "iframe", src: `https://player.kick.com/${m[1]}` };
  }

  // SoundCloud / Spotify
  if (host === "soundcloud.com") {
    return { kind: "iframe", src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(href)}&auto_play=true` };
  }
  if (host === "open.spotify.com") {
    return { kind: "iframe", src: href.replace("open.spotify.com/", "open.spotify.com/embed/") };
  }

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
