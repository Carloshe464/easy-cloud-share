import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Sparkles, Plus, Trash2, Film, Folder as FolderIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getStoredUserId } from "@/lib/cloud";
import { fetchCatalog, posterFor, seedDemoCatalog, type Title } from "@/lib/streaming";
import { detectExternalKind, EXTERNAL_LINK_MIME, type FolderRow } from "@/components/cloud/types";
import { toast } from "sonner";

export const Route = createFileRoute("/streaming/admin")({
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const userId = getStoredUserId();
  const [titles, setTitles] = useState<Title[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [saving, setSaving] = useState(false);

  // form
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [poster, setPoster] = useState("");
  const [description, setDescription] = useState("");
  const [folderId, setFolderId] = useState<string>("");
  const [newFolder, setNewFolder] = useState("");

  useEffect(() => { if (!userId) navigate({ to: "/" }); }, [userId, navigate]);

  const reload = async () => {
    if (!userId) return;
    const { folders, titles } = await fetchCatalog(userId);
    setFolders(folders); setTitles(titles); setLoading(false);
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [userId]);

  if (!userId) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !name.trim()) { toast.error("Informe nome e URL"); return; }
    if (!detectExternalKind(url)) { toast.error("URL inválida"); return; }
    setSaving(true);
    try {
      let folder = folderId;
      if (!folder && newFolder.trim()) {
        const { data, error } = await supabase.from("folders")
          .insert({ user_id: userId, name: newFolder.trim(), parent_id: null })
          .select("id").single();
        if (error) throw error;
        folder = data.id;
      }
      const { error } = await supabase.from("files").insert({
        user_id: userId,
        folder_id: folder || null,
        name: name.trim(),
        external_url: url.trim(),
        poster_url: poster.trim() || null,
        description: description.trim() || null,
        mime_type: EXTERNAL_LINK_MIME,
        size_bytes: 0,
      });
      if (error) throw error;
      toast.success("Adicionado ao catálogo");
      setName(""); setUrl(""); setPoster(""); setDescription(""); setNewFolder("");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Remover este título?")) return;
    await supabase.from("files").delete().eq("id", id);
    await reload();
  };

  const seed = async () => {
    setSeeding(true);
    try {
      const n = await seedDemoCatalog(userId);
      toast.success(n ? `${n} títulos adicionados` : "Catálogo de demo já estava completo");
      await reload();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erro"); }
    finally { setSeeding(false); }
  };

  return (
    <main className="pt-24 pb-24 max-w-[1600px] mx-auto px-4 md:px-10">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <Link to="/streaming" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Voltar ao catálogo
        </Link>
        <button onClick={seed} disabled={seeding}
          className="inline-flex items-center gap-2 bg-primary/15 text-primary px-4 py-2 rounded-md ring-1 ring-primary/30 hover:bg-primary/25 transition disabled:opacity-50">
          {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Popular com demo
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-8">
        <form onSubmit={submit} className="bg-card ring-1 ring-border rounded-2xl p-6 space-y-4 h-fit sticky top-24">
          <h2 className="font-display text-2xl flex items-center gap-2"><Plus className="w-5 h-5 text-primary" /> Novo título</h2>
          <Field label="Nome">
            <input value={name} onChange={(e) => setName(e.target.value)} required
              placeholder="Ex.: Inception" className={input} />
          </Field>
          <Field label="URL do vídeo (.mp4, .m3u8, YouTube, Vimeo)">
            <input value={url} onChange={(e) => setUrl(e.target.value)} required
              placeholder="https://…" className={input} />
          </Field>
          <Field label="URL do poster (opcional)">
            <input value={poster} onChange={(e) => setPoster(e.target.value)}
              placeholder="https://…/poster.jpg" className={input} />
          </Field>
          <Field label="Sinopse">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              rows={3} placeholder="Descrição curta…" className={`${input} resize-none`} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoria existente">
              <select value={folderId} onChange={(e) => { setFolderId(e.target.value); if (e.target.value) setNewFolder(""); }} className={input}>
                <option value="">— nenhuma —</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
            <Field label="ou nova categoria">
              <input value={newFolder} onChange={(e) => { setNewFolder(e.target.value); if (e.target.value) setFolderId(""); }}
                placeholder="Ex.: Ação" className={input} />
            </Field>
          </div>
          <button type="submit" disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-md py-2.5 font-semibold hover:opacity-90 disabled:opacity-50 transition">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Adicionar
          </button>
        </form>

        <div>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Stat icon={<Film className="w-5 h-5" />} label="Títulos" value={titles.length} />
            <Stat icon={<FolderIcon className="w-5 h-5" />} label="Categorias" value={folders.length} />
            <Stat icon={<Sparkles className="w-5 h-5" />} label="Com poster" value={titles.filter((t) => !!t.poster_url).length} />
          </div>
          <h2 className="font-display text-2xl mb-4">Catálogo</h2>
          {loading ? (
            <div className="text-muted-foreground text-sm">Carregando…</div>
          ) : titles.length === 0 ? (
            <div className="text-center py-12 ring-1 ring-border rounded-xl bg-card/40 text-muted-foreground">
              Nenhum título ainda. Adicione um ao lado ou popule com demo.
            </div>
          ) : (
            <div className="space-y-2">
              {titles.map((t) => (
                <div key={t.id} className="flex items-center gap-3 bg-card ring-1 ring-border rounded-lg p-2 hover:bg-secondary/40 transition">
                  <img src={posterFor(t)} alt="" className="w-12 h-16 object-cover rounded" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{t.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.category ?? "Sem categoria"} · {t.external_url}</div>
                  </div>
                  <Link to="/streaming/watch/$id" params={{ id: t.id }}
                    className="text-xs px-3 py-1.5 rounded-md bg-secondary hover:bg-secondary/70 transition">Assistir</Link>
                  <button onClick={() => remove(t.id)}
                    className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition" aria-label="Remover">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

const input = "w-full bg-secondary/60 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{label}</div>
      {children}
    </label>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-card ring-1 ring-border rounded-xl p-4">
      <div className="text-primary mb-1">{icon}</div>
      <div className="font-display text-2xl">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
