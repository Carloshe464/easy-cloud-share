import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Cloud, Download, FileIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBytes, publicUrl } from "@/lib/cloud";

export const Route = createFileRoute("/s/$token")({
  component: SharePage,
  head: () => ({
    meta: [
      { title: `Arquivo compartilhado — Nuvem Pública` },
      { name: "description", content: `Baixe este arquivo compartilhado publicamente.` },
    ],
  }),
});

type FileRow = { name: string; size_bytes: number; storage_path: string; mime_type: string | null };

function SharePage() {
  const { token } = Route.useParams();
  const [file, setFile] = useState<FileRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("files").select("name,size_bytes,storage_path,mime_type")
      .eq("share_token", token).maybeSingle()
      .then(({ data }) => { setFile(data as FileRow | null); setLoading(false); });
  }, [token]);

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-8">
          <Cloud className="w-4 h-4" /> Nuvem Pública
        </Link>
        {loading ? (
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
        ) : !file ? (
          <div className="bg-card/60 backdrop-blur rounded-2xl p-8 ring-1 ring-border">
            <h1 className="text-xl font-bold mb-2">Link inválido</h1>
            <p className="text-muted-foreground text-sm">Este arquivo não existe ou foi removido.</p>
          </div>
        ) : (
          <div className="bg-card/60 backdrop-blur rounded-2xl p-8 ring-1 ring-border shadow-2xl">
            <FileIcon className="w-16 h-16 text-primary mx-auto mb-4" strokeWidth={1.2} />
            <h1 className="text-xl font-bold mb-1 break-words">{file.name}</h1>
            <p className="text-sm text-muted-foreground mb-6">{formatBytes(file.size_bytes)}</p>
            <a
              href={publicUrl(file.storage_path)}
              download={file.name}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-6 py-3 font-semibold hover:opacity-90"
            >
              <Download className="w-5 h-5" /> Baixar arquivo
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
