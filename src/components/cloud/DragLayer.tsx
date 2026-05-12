import { Upload } from "lucide-react";

export function DragLayer({ active, count, label }: { active: boolean; count?: number; label?: string }) {
  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-primary/10 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-card/90 ring-2 ring-primary border-dashed rounded-2xl px-8 py-6 text-center shadow-2xl">
        <Upload className="w-10 h-10 text-primary mx-auto mb-2" strokeWidth={1.5} />
        <div className="font-display text-lg font-bold">{label ?? "Solte para enviar"}</div>
        {count != null && count > 0 && (
          <div className="text-sm text-muted-foreground">{count} {count === 1 ? "arquivo" : "arquivos"}</div>
        )}
      </div>
    </div>
  );
}
