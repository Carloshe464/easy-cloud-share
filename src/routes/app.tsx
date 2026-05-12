import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Cloud, Upload, Folder, FolderPlus, FileIcon, Download, Trash2, Pencil,
  Share2, LogOut, ChevronRight, Loader2, Home, Eye, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getStoredUserId, getStoredPhone, clearStoredUser, fetchUser,
  formatBytes, publicUrl, type CloudUser,
} from "@/lib/cloud";
import { toast } from "sonner";

export const Route = createFileRoute("/app")({
  component: AppPage,
  head: () => ({ meta: [{ title: "Minha Nuvem" }] }),
});

type FolderRow = { id: string; name: string; parent_id: string | null };
type FileRow = {
  id: string; name: string; storage_path: string; size_bytes: number;
  mime_type: string | null; share_token: string; folder_id: string | null;
};

function AppPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<CloudUser | null>(null);
  const [currentFolder, setCurrentFolder] = useState<FolderRow | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<FolderRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bootstrappedRef = useRef(false);
  const refreshRunRef = useRef(0);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    let active = true;

    const boot = async () => {
      const id = getStoredUserId();
      if (!id) {
        navigate({ to: "/" });
        return;
      }

      const u = await fetchUser(id);
      if (!active) return;
      if (!u) {
        clearStoredUser();
        navigate({ to: "/" });
        return;
      }
      setUser((prev) => (prev?.id === u.id && prev.used_bytes === u.used_bytes && prev.quota_bytes === u.quota_bytes ? prev : u));
    };

    boot();
    return () => { active = false; };
  }, [navigate]);

  const userId = user?.id;
  const folderId = currentFolder?.id ?? null;

  const refresh = useCallback(async () => {
    if (!userId) return;
    const runId = ++refreshRunRef.current;
    setLoading(true);
    try {
      let foldersQ = supabase.from("folders").select("*").eq("user_id", userId);
      let filesQ = supabase.from("files").select("*").eq("user_id", userId);
      if (folderId) {
        foldersQ = foldersQ.eq("parent_id", folderId);
        filesQ = filesQ.eq("folder_id", folderId);
      } else {
        foldersQ = foldersQ.is("parent_id", null);
        filesQ = filesQ.is("folder_id", null);
      }
      const [{ data: f }, { data: fi }, u] = await Promise.all([
        foldersQ, filesQ, fetchUser(userId),
      ]);
      if (runId !== refreshRunRef.current) return;
      setFolders((f as FolderRow[]) ?? []);
      setFiles((fi as FileRow[]) ?? []);
      if (u) setUser((prev) =>
        prev && prev.id === u.id && prev.used_bytes === u.used_bytes && prev.quota_bytes === u.quota_bytes
          ? prev : u
      );
    } finally {
      if (runId === refreshRunRef.current) setLoading(false);
    }
  }, [userId, folderId]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleLogout = () => { clearStoredUser(); navigate({ to: "/" }); };

  const enterFolder = (f: FolderRow) => {
    setBreadcrumbs([...breadcrumbs, f]);
    setCurrentFolder(f);
  };
  const goToCrumb = (idx: number) => {
    if (idx < 0) { setBreadcrumbs([]); setCurrentFolder(null); return; }
    const next = breadcrumbs.slice(0, idx + 1);
    setBreadcrumbs(next);
    setCurrentFolder(next[next.length - 1]);
  };

  const createFolder = async () => {
    if (!user) return;
    const name = window.prompt("Nome da pasta:");
    if (!name?.trim()) return;
    const { error } = await supabase.from("folders").insert({
      user_id: user.id, parent_id: currentFolder?.id ?? null, name: name.trim(),
    });
    if (error) toast.error(error.message); else { toast.success("Pasta criada"); refresh(); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !e.target.files) return;
    const filesToUpload = Array.from(e.target.files);
    e.target.value = "";
    const total = filesToUpload.reduce((s, f) => s + f.size, 0);
    if (user.used_bytes + total > user.quota_bytes) {
      toast.error("Cota de 4 TB excedida"); return;
    }
    setUploading(true);
    try {
      for (const file of filesToUpload) {
        const path = `${user.id}/${crypto.randomUUID()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("cloud-files").upload(path, file, {
          contentType: file.type || "application/octet-stream",
        });
        if (upErr) { toast.error(`${file.name}: ${upErr.message}`); continue; }
        const { error: dbErr } = await supabase.from("files").insert({
          user_id: user.id, folder_id: currentFolder?.id ?? null,
          name: file.name, storage_path: path, size_bytes: file.size,
          mime_type: file.type || null,
        });
        if (dbErr) toast.error(`${file.name}: ${dbErr.message}`);
      }
      toast.success("Upload concluído");
      refresh();
    } finally { setUploading(false); }
  };

  const deleteFile = async (f: FileRow) => {
    if (!confirm(`Excluir "${f.name}"?`)) return;
    await supabase.storage.from("cloud-files").remove([f.storage_path]);
    const { error } = await supabase.from("files").delete().eq("id", f.id);
    if (error) toast.error(error.message); else { toast.success("Arquivo excluído"); refresh(); }
  };

  const deleteFolder = async (f: FolderRow) => {
    if (!confirm(`Excluir pasta "${f.name}" e todo o conteúdo?`)) return;
    // remove storage objects under user's folder children recursively (best-effort: children files cascade DB)
    // fetch child files to remove from storage
    const { data: childFiles } = await supabase.from("files").select("storage_path").eq("folder_id", f.id);
    if (childFiles?.length) {
      await supabase.storage.from("cloud-files").remove(childFiles.map(c => c.storage_path));
    }
    const { error } = await supabase.from("folders").delete().eq("id", f.id);
    if (error) toast.error(error.message); else { toast.success("Pasta excluída"); refresh(); }
  };

  const renameFile = async (f: FileRow) => {
    const name = window.prompt("Novo nome:", f.name);
    if (!name?.trim() || name === f.name) return;
    const { error } = await supabase.from("files").update({ name: name.trim() }).eq("id", f.id);
    if (error) toast.error(error.message); else { toast.success("Renomeado"); refresh(); }
  };

  const renameFolder = async (f: FolderRow) => {
    const name = window.prompt("Novo nome:", f.name);
    if (!name?.trim() || name === f.name) return;
    const { error } = await supabase.from("folders").update({ name: name.trim() }).eq("id", f.id);
    if (error) toast.error(error.message); else { toast.success("Renomeado"); refresh(); }
  };

  const downloadFile = (f: FileRow) => {
    const url = publicUrl(f.storage_path);
    const a = document.createElement("a");
    a.href = url; a.download = f.name; a.target = "_blank";
    document.body.appendChild(a); a.click(); a.remove();
  };

  const shareFile = async (f: FileRow) => {
    const url = `${window.location.origin}/s/${f.share_token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link público copiado!");
    } catch {
      window.prompt("Copie o link:", url);
    }
  };

  if (!user) return null;
  const usedPct = (user.used_bytes / user.quota_bytes) * 100;

  return (
    <main className="min-h-screen">
      <header className="border-b border-border/50 backdrop-blur-xl bg-background/40 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Cloud className="w-7 h-7 text-primary" strokeWidth={1.5} />
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-lg leading-none">Nuvem Pública</div>
            <div className="text-xs text-muted-foreground truncate">{getStoredPhone()}</div>
          </div>
          <button onClick={handleLogout} className="text-muted-foreground hover:text-foreground p-2 rounded-lg hover:bg-secondary">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Quota */}
        <div className="bg-card/60 backdrop-blur rounded-2xl p-5 ring-1 ring-border mb-6">
          <div className="flex items-center justify-between mb-2 text-sm">
            <span className="text-muted-foreground">Espaço utilizado</span>
            <span className="font-medium">
              {formatBytes(user.used_bytes)} <span className="text-muted-foreground">/ {formatBytes(user.quota_bytes)}</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-accent transition-all"
              style={{ width: `${Math.min(100, usedPct)}%` }}
            />
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm mb-4 flex-wrap">
          <button onClick={() => goToCrumb(-1)} className="inline-flex items-center gap-1 hover:text-primary">
            <Home className="w-4 h-4" /> Início
          </button>
          {breadcrumbs.map((b, i) => (
            <span key={b.id} className="inline-flex items-center gap-1">
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <button onClick={() => goToCrumb(i)} className="hover:text-primary truncate max-w-[180px]">{b.name}</button>
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-4 py-2.5 font-medium hover:opacity-90 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Enviando..." : "Enviar arquivos"}
          </button>
          <button
            onClick={createFolder}
            className="inline-flex items-center gap-2 bg-secondary text-secondary-foreground rounded-xl px-4 py-2.5 font-medium hover:bg-secondary/80"
          >
            <FolderPlus className="w-4 h-4" /> Nova pasta
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
        </div>

        {/* Listing */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : folders.length === 0 && files.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Cloud className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nada por aqui ainda. Envie seu primeiro arquivo.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {folders.map((f) => (
              <div key={f.id} className="group bg-card/60 backdrop-blur rounded-xl p-4 ring-1 ring-border hover:ring-primary/50 transition flex items-center gap-3">
                <button onClick={() => enterFolder(f)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <Folder className="w-8 h-8 text-accent shrink-0" strokeWidth={1.5} />
                  <span className="font-medium truncate">{f.name}</span>
                </button>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <IconBtn onClick={() => renameFolder(f)} icon={Pencil} />
                  <IconBtn onClick={() => deleteFolder(f)} icon={Trash2} danger />
                </div>
              </div>
            ))}
            {files.map((f) => (
              <div key={f.id} className="group bg-card/60 backdrop-blur rounded-xl p-4 ring-1 ring-border hover:ring-primary/50 transition">
                <div className="flex items-center gap-3 mb-3">
                  <FileIcon className="w-8 h-8 text-primary shrink-0" strokeWidth={1.5} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{f.name}</div>
                    <div className="text-xs text-muted-foreground">{formatBytes(f.size_bytes)}</div>
                  </div>
                </div>
                <div className="flex gap-1 justify-end">
                  <IconBtn onClick={() => downloadFile(f)} icon={Download} title="Baixar" />
                  <IconBtn onClick={() => shareFile(f)} icon={Share2} title="Compartilhar" />
                  <IconBtn onClick={() => renameFile(f)} icon={Pencil} title="Renomear" />
                  <IconBtn onClick={() => deleteFile(f)} icon={Trash2} title="Excluir" danger />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function IconBtn({ onClick, icon: Icon, danger, title }: {
  onClick: () => void; icon: React.ComponentType<{ className?: string }>;
  danger?: boolean; title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 rounded-lg hover:bg-secondary transition ${danger ? "text-destructive hover:text-destructive" : "text-muted-foreground hover:text-foreground"}`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
