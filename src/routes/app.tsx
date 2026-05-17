import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  Cloud, Upload, FolderPlus, LogOut, ChevronRight, Loader2, Home,
  CheckSquare, Square, Link as LinkIcon,
} from "lucide-react";
import { ExternalLinkViewer } from "@/components/cloud/ExternalLinkViewer";
import { supabase } from "@/integrations/supabase/client";
import {
  getStoredUserId, getStoredPhone, clearStoredUser, fetchUser,
  formatBytes, publicUrl, type CloudUser,
} from "@/lib/cloud";
import { toast } from "sonner";
import { FileItem } from "@/components/cloud/FileItem";
import { FolderItem } from "@/components/cloud/FolderItem";
import { Toolbar } from "@/components/cloud/Toolbar";
import { PreviewCard } from "@/components/cloud/PreviewCard";
import { DragLayer } from "@/components/cloud/DragLayer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSelection } from "@/components/cloud/SelectionManager";
import {
  key as makeKey, type FileRow, type FolderRow, type SelectionKey,
} from "@/components/cloud/types";

export const Route = createFileRoute("/app")({
  component: AppPage,
  head: () => ({ meta: [{ title: "Minha Nuvem" }] }),
});

const INTERNAL_MIME = "application/x-cloud-items";

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
  const [dropTarget, setDropTarget] = useState<string | null>(null); // folder id
  const [externalDrag, setExternalDrag] = useState(false);
  const [linkViewerOpen, setLinkViewerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refreshRunRef = useRef(0);

  const sel = useSelection();

  // ---------- bootstrap ----------
  useEffect(() => {
    let active = true;
    const boot = async () => {
      const id = getStoredUserId();
      if (!id) { navigate({ to: "/" }); return; }
      const u = await fetchUser(id);
      if (!active) return;
      if (!u) { clearStoredUser(); navigate({ to: "/" }); return; }
      if (!u.activated_at) { navigate({ to: "/activate" }); return; }
      setUser((prev) =>
        prev?.id === u.id && prev.used_bytes === u.used_bytes && prev.quota_bytes === u.quota_bytes
          ? prev : u
      );
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
        foldersQ.order("name"), filesQ.order("name"), fetchUser(userId),
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

  // clear selection when navigating folders
  useEffect(() => { sel.clear(); }, [folderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- keys & ordered selection list ----------
  const orderedKeys = useMemo<SelectionKey[]>(
    () => [
      ...folders.map((f) => makeKey("folder", f.id)),
      ...files.map((f) => makeKey("file", f.id)),
    ],
    [folders, files]
  );

  const selectedFiles = useMemo(
    () => files.filter((f) => sel.isSelected(makeKey("file", f.id))),
    [files, sel]
  );
  const selectedFolders = useMemo(
    () => folders.filter((f) => sel.isSelected(makeKey("folder", f.id))),
    [folders, sel]
  );

  // ---------- handlers ----------
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
    if (error) toast.error(error.message);
    else { toast.success("Pasta criada"); refresh(); }
  };

  const uploadFiles = useCallback(async (list: File[]) => {
    if (!user || list.length === 0) return;
    const total = list.reduce((s, f) => s + f.size, 0);
    if (user.used_bytes + total > user.quota_bytes) {
      toast.error("Cota de 4 TB excedida"); return;
    }
    setUploading(true);
    const tId = toast.loading(`Enviando ${list.length} arquivo(s)...`);
    try {
      for (const file of list) {
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
      toast.success("Upload concluído", { id: tId });
      refresh();
    } finally { setUploading(false); }
  }, [user, currentFolder, refresh]);

  const handleUploadInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const list = Array.from(e.target.files);
    e.target.value = "";
    await uploadFiles(list);
  };

  // ---------- bulk actions ----------
  const downloadSelected = () => {
    if (selectedFiles.length === 0) {
      toast.message("Selecione arquivos para baixar");
      return;
    }
    selectedFiles.forEach((f, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = f.external_url ?? (f.storage_path ? publicUrl(f.storage_path) : "");
        if (!a.href) return;
        if (f.external_url) a.rel = "noopener";
        else a.download = f.name;
        a.target = "_blank";
        document.body.appendChild(a); a.click(); a.remove();
      }, i * 150);
    });
  };

  const copyShareLinks = async () => {
    if (selectedFiles.length === 0) return;
    const urls = selectedFiles.map((f) => `${window.location.origin}/s/${f.share_token}`).join("\n");
    try {
      await navigator.clipboard.writeText(urls);
      toast.success(`${selectedFiles.length} link(s) copiado(s)!`);
    } catch {
      window.prompt("Copie os links:", urls);
    }
  };

  const shareSelected = async () => {
    if (selectedFiles.length === 0) return;
    const f = selectedFiles[0];
    const url = `${window.location.origin}/s/${f.share_token}`;
    const shareData = { title: f.name, text: f.name, url };
    if (navigator.share) {
      try { await navigator.share(shareData); return; } catch { /* fall through */ }
    }
    await copyShareLinks();
  };

  const renameSelected = async () => {
    const total = selectedFiles.length + selectedFolders.length;
    if (total !== 1) { toast.message("Selecione apenas 1 item para renomear"); return; }
    if (selectedFiles.length === 1) {
      const f = selectedFiles[0];
      const name = window.prompt("Novo nome:", f.name);
      if (!name?.trim() || name === f.name) return;
      const { error } = await supabase.from("files").update({ name: name.trim() }).eq("id", f.id);
      if (error) toast.error(error.message); else { toast.success("Renomeado"); refresh(); }
    } else {
      const f = selectedFolders[0];
      const name = window.prompt("Novo nome:", f.name);
      if (!name?.trim() || name === f.name) return;
      const { error } = await supabase.from("folders").update({ name: name.trim() }).eq("id", f.id);
      if (error) toast.error(error.message); else { toast.success("Renomeado"); refresh(); }
    }
  };

  const deleteSelected = async () => {
    const total = selectedFiles.length + selectedFolders.length;
    if (total === 0) return;
    if (!confirm(`Excluir ${total} item(s)?`)) return;
    const tId = toast.loading("Excluindo...");
    try {
      if (selectedFiles.length) {
        const paths = selectedFiles.map((f) => f.storage_path).filter((p): p is string => !!p);
        if (paths.length) await supabase.storage.from("cloud-files").remove(paths);
        await supabase.from("files").delete().in("id", selectedFiles.map((f) => f.id));
      }
      for (const fo of selectedFolders) {
        const { data: childFiles } = await supabase.from("files").select("storage_path").eq("folder_id", fo.id);
        const childPaths = (childFiles ?? []).map((c) => c.storage_path).filter((p): p is string => !!p);
        if (childPaths.length) {
          await supabase.storage.from("cloud-files").remove(childPaths);
        }
        await supabase.from("folders").delete().eq("id", fo.id);
      }
      toast.success("Itens excluídos", { id: tId });
      sel.clear();
      refresh();
    } catch (e) {
      toast.error((e as Error).message, { id: tId });
    }
  };

  const togglePublicSelected = async () => {
    if (selectedFiles.length === 0) { toast.message("Selecione arquivos para publicar"); return; }
    const allPublic = selectedFiles.every((f) => !!f.is_public);
    const next = !allPublic;
    const ids = selectedFiles.map((f) => f.id);
    const { error } = await supabase.from("files").update({ is_public: next }).in("id", ids);
    if (error) toast.error(error.message);
    else { toast.success(next ? "Publicado no Play" : "Removido do Play"); refresh(); }
  };

  // ---------- drag & drop (move) ----------
  const beginInternalDrag = (e: React.DragEvent, k: SelectionKey) => {
    // if dragged item not selected, drag just it; else drag whole selection
    let keys: SelectionKey[];
    if (sel.isSelected(k)) {
      keys = Array.from(sel.selected);
    } else {
      keys = [k];
      sel.clear();
      sel.toggle(k);
    }
    e.dataTransfer.setData(INTERNAL_MIME, JSON.stringify(keys));
    e.dataTransfer.effectAllowed = "move";
  };

  const moveItemsToFolder = useCallback(async (keys: SelectionKey[], targetFolderId: string | null) => {
    const fileIds: string[] = [];
    const folderIds: string[] = [];
    for (const k of keys) {
      const [kind, id] = k.split(":") as [string, string];
      if (kind === "file") fileIds.push(id);
      else if (kind === "folder") {
        if (targetFolderId && id === targetFolderId) {
          toast.error("Não é possível mover uma pasta para dentro dela mesma");
          return;
        }
        folderIds.push(id);
      }
    }
    const tId = toast.loading("Movendo...");
    try {
      if (fileIds.length) {
        const { error } = await supabase.from("files").update({ folder_id: targetFolderId }).in("id", fileIds);
        if (error) throw error;
      }
      if (folderIds.length) {
        const { error } = await supabase.from("folders").update({ parent_id: targetFolderId }).in("id", folderIds);
        if (error) throw error;
      }
      toast.success("Itens movidos", { id: tId });
      sel.clear();
      refresh();
    } catch (e) {
      toast.error((e as Error).message, { id: tId });
    }
  }, [refresh, sel]);

  const onFolderDragOver = (e: React.DragEvent, fId: string) => {
    if (!e.dataTransfer.types.includes(INTERNAL_MIME) && !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes("Files") ? "copy" : "move";
    setDropTarget(fId);
  };
  const onFolderDragLeave = (_e: React.DragEvent, fId: string) => {
    setDropTarget((prev) => (prev === fId ? null : prev));
  };
  const onFolderDrop = async (e: React.DragEvent, targetFolder: FolderRow) => {
    e.preventDefault();
    setDropTarget(null);
    setExternalDrag(false);
    const internal = e.dataTransfer.getData(INTERNAL_MIME);
    if (internal) {
      const keys = JSON.parse(internal) as SelectionKey[];
      if (keys.some((k) => k === makeKey("folder", targetFolder.id))) {
        toast.error("Não é possível mover uma pasta para dentro dela mesma"); return;
      }
      await moveItemsToFolder(keys, targetFolder.id);
      return;
    }
    if (e.dataTransfer.files?.length) {
      // Upload directly into target folder
      const list = Array.from(e.dataTransfer.files);
      const prevFolder = currentFolder;
      // temporarily set folder for upload context
      const path = `${user!.id}/`;
      // inline upload to specific folder
      const total = list.reduce((s, f) => s + f.size, 0);
      if (user!.used_bytes + total > user!.quota_bytes) {
        toast.error("Cota de 4 TB excedida"); return;
      }
      setUploading(true);
      const tId = toast.loading(`Enviando ${list.length} arquivo(s)...`);
      try {
        for (const file of list) {
          const sp = `${path}${crypto.randomUUID()}-${file.name}`;
          const { error: upErr } = await supabase.storage.from("cloud-files").upload(sp, file, {
            contentType: file.type || "application/octet-stream",
          });
          if (upErr) { toast.error(`${file.name}: ${upErr.message}`); continue; }
          await supabase.from("files").insert({
            user_id: user!.id, folder_id: targetFolder.id, name: file.name,
            storage_path: sp, size_bytes: file.size, mime_type: file.type || null,
          });
        }
        toast.success("Upload concluído", { id: tId });
        if (prevFolder?.id === currentFolder?.id) refresh();
      } finally { setUploading(false); }
    }
  };

  // window-level drop = upload to current folder
  useEffect(() => {
    let counter = 0;
    const onDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        counter++;
        setExternalDrag(true);
      }
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        counter = Math.max(0, counter - 1);
        if (counter === 0) setExternalDrag(false);
      }
    };
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      counter = 0;
      setExternalDrag(false);
      // if dropped on a folder, that handler runs first and stops here; otherwise upload to current
      if (e.dataTransfer?.files?.length && !dropTarget) {
        e.preventDefault();
        uploadFiles(Array.from(e.dataTransfer.files));
      }
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [uploadFiles, dropTarget]);

  // ---------- keyboard shortcuts ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (t && t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        sel.selectAll(orderedKeys);
      } else if (e.key === "Delete") {
        if (sel.count > 0) { e.preventDefault(); deleteSelected(); }
      } else if (e.key === "F2") {
        if (sel.count === 1) { e.preventDefault(); renameSelected(); }
      } else if (e.key === "Escape") {
        sel.clear();
      } else if (e.key === "Enter") {
        if (selectedFiles.length === 1 && selectedFolders.length === 0) {
          setSelectedFile(selectedFiles[0]);
        } else if (selectedFolders.length === 1 && selectedFiles.length === 0) {
          enterFolder(selectedFolders[0]);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // intentionally no deps — always uses current closure

  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
      </main>
    );
  }
  const usedPct = (user.used_bytes / user.quota_bytes) * 100;
  const allSelected = orderedKeys.length > 0 && orderedKeys.every((k) => sel.isSelected(k));

  return (
    <main className="min-h-screen pb-28">
      <header className="border-b border-border/40 backdrop-blur-xl bg-background/80 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Cloud className="w-6 h-6 text-primary shrink-0" strokeWidth={1.8} />
            <span className="font-display text-xl sm:text-2xl tracking-wide leading-none">Minha Nuvem</span>
          </div>
          <div className="flex-1 min-w-0 hidden sm:block">
            <div className="text-xs text-muted-foreground truncate">{getStoredPhone()}</div>
          </div>
          <button
            onClick={() => setLinkViewerOpen(true)}
            aria-label="Visualizar link externo"
            title="Visualizar link"
            className="text-muted-foreground hover:text-foreground p-2 rounded-md hover:bg-secondary"
          >
            <LinkIcon className="w-5 h-5" />
          </button>
          <a href="/streaming" title="Modo streaming"
            className="text-xs font-bold uppercase tracking-wider text-primary hover:opacity-80 px-2 py-1 rounded-md ring-1 ring-primary/30 hover:ring-primary/60 transition">
            Play
          </a>
          <ThemeToggle />
          <button
            onClick={handleLogout}
            aria-label="Sair"
            className="text-muted-foreground hover:text-foreground p-2 rounded-md hover:bg-secondary"
          >
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
              {formatBytes(user.used_bytes)}{" "}
              <span className="text-muted-foreground">/ {formatBytes(user.quota_bytes)}</span>
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
              <button onClick={() => goToCrumb(i)} className="hover:text-primary truncate max-w-[180px]">
                {b.name}
              </button>
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-4 py-2.5 font-medium hover:opacity-90 disabled:opacity-50 transition"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Enviando..." : "Enviar arquivos"}
          </button>
          <button
            onClick={createFolder}
            className="inline-flex items-center gap-2 bg-secondary text-secondary-foreground rounded-xl px-4 py-2.5 font-medium hover:bg-secondary/80 transition"
          >
            <FolderPlus className="w-4 h-4" /> Nova pasta
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUploadInput} />
        </div>

        {/* Selection bar */}
        {orderedKeys.length > 0 && (
          <div className="flex items-center gap-2 mb-4 text-sm">
            <button
              onClick={() => (allSelected ? sel.clear() : sel.selectAll(orderedKeys))}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition"
            >
              {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              {allSelected ? "Desmarcar tudo" : "Selecionar todos"}
            </button>
            {sel.count > 0 && (
              <span className="text-muted-foreground">
                · {sel.count} selecionado(s)
              </span>
            )}
          </div>
        )}

        {/* Listing */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : folders.length === 0 && files.length === 0 ? (
          <div
            className="text-center py-20 text-muted-foreground border-2 border-dashed border-border/60 rounded-2xl"
            onClick={() => sel.clear()}
          >
            <Cloud className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nada por aqui ainda.</p>
            <p className="text-xs mt-1">Arraste arquivos ou clique em "Enviar arquivos".</p>
          </div>
        ) : (
          <div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
            onClick={(e) => { if (e.target === e.currentTarget) sel.clear(); }}
          >
            {folders.map((f) => {
              const k = makeKey("folder", f.id);
              return (
                <FolderItem
                  key={f.id}
                  folder={f}
                  selected={sel.isSelected(k)}
                  dropActive={dropTarget === f.id}
                  onClick={(e) => sel.handleClick(e, k, orderedKeys)}
                  onDoubleClick={() => enterFolder(f)}
                  onDragStart={(e) => beginInternalDrag(e, k)}
                  onDragOver={(e) => onFolderDragOver(e, f.id)}
                  onDragLeave={(e) => onFolderDragLeave(e, f.id)}
                  onDrop={(e) => onFolderDrop(e, f)}
                />
              );
            })}
            {files.map((f) => {
              const k = makeKey("file", f.id);
              return (
                <FileItem
                  key={f.id}
                  file={f}
                  selected={sel.isSelected(k)}
                  onClick={(e) => sel.handleClick(e, k, orderedKeys)}
                  onDoubleClick={() => setSelectedFile(f)}
                  onDragStart={(e) => beginInternalDrag(e, k)}
                />
              );
            })}
          </div>
        )}
      </div>

      <Toolbar
        count={sel.count}
        canRename={selectedFiles.length + selectedFolders.length === 1}
        canRemoveFromFolder={!!currentFolder && sel.count > 0}
        canTogglePublic={selectedFiles.length > 0}
        allPublic={selectedFiles.length > 0 && selectedFiles.every((f) => !!f.is_public)}
        onClear={() => sel.clear()}
        onDownload={downloadSelected}
        onShare={shareSelected}
        onCopyLink={copyShareLinks}
        onRename={renameSelected}
        onRemoveFromFolder={() => moveItemsToFolder(Array.from(sel.selected), null)}
        onTogglePublic={togglePublicSelected}
        onDelete={deleteSelected}
      />

      <DragLayer active={externalDrag} label="Solte para enviar à pasta atual" />

      {selectedFile && <PreviewCard file={selectedFile} onClose={() => setSelectedFile(null)} />}
      {linkViewerOpen && (
        <ExternalLinkViewer
          onClose={() => setLinkViewerOpen(false)}
          onSave={async ({ url, name }) => {
            if (!user) return;
            const { error } = await supabase.from("files").insert({
              user_id: user.id,
              folder_id: currentFolder?.id ?? null,
              name,
              storage_path: null,
              external_url: url,
              size_bytes: 0,
              mime_type: "application/x-external-link",
            });
            if (error) toast.error(error.message);
            else { toast.success("Link adicionado"); refresh(); }
          }}
        />
      )}
    </main>
  );
}
