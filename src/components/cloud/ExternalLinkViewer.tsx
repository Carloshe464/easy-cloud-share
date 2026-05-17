import { useEffect, useMemo, useState } from "react";
import { Link as LinkIcon, Pencil, X } from "lucide-react";
import { detectExternalKind } from "./types";

export type ExternalLinkInitial = { url: string; name: string };

export function ExternalLinkViewer({
  onClose, onSave, initial, mode = "create",
}: {
  onClose: () => void;
  onSave: (input: { url: string; name: string }) => Promise<void> | void;
  initial?: ExternalLinkInitial | null;
  mode?: "create" | "edit";
}) {
  const [url, setUrl] = useState(initial?.url ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [saving, setSaving] = useState(false);

  const detected = useMemo(() => (url ? detectExternalKind(url) : null), [url]);
  const valid = !!detected;
  const isEdit = mode === "edit";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Suggest name from URL (only when creating, and only if name is empty)
  useEffect(() => {
    if (isEdit || !detected || name) return;
    try {
      const u = new URL(url);
      const last = u.pathname.split("/").filter(Boolean).pop();
      setName(last ? decodeURIComponent(last) : u.hostname.replace(/^www\./, ""));
    } catch { /* noop */ }
  }, [detected, url, name, isEdit]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onSave({ url: url.trim(), name: name.trim() || url.trim() });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
      <form
        onSubmit={submit}
        className="bg-card ring-1 ring-border rounded-2xl w-full max-w-lg p-6 shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-5">
          {isEdit
            ? <Pencil className="w-5 h-5 text-primary" strokeWidth={1.5} />
            : <LinkIcon className="w-5 h-5 text-primary" strokeWidth={1.5} />}
          <h2 className="font-display text-lg font-semibold flex-1">
            {isEdit ? "Editar link" : "Adicionar link"}
          </h2>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary"
            aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">URL</label>
        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://… (imagem, vídeo, YouTube, Vimeo, PDF)"
          className="w-full bg-secondary/60 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary mb-4"
        />

        <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Nome</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Como esse link aparecerá"
          className="w-full bg-secondary/60 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary mb-2"
        />

        <p className="text-xs text-muted-foreground min-h-[1.25rem] mb-4">
          {url && !detected && "URL inválida."}
          {detected && `Tipo detectado: ${detected.kind}`}
        </p>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary transition">
            Cancelar
          </button>
          <button type="submit" disabled={!valid || saving}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition">
            {saving ? "Salvando…" : isEdit ? "Salvar alterações" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
