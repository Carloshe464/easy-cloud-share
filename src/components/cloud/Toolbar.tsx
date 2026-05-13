import { Download, FolderMinus, Link2, Pencil, Share2, Trash2, X } from "lucide-react";

type Props = {
  count: number;
  canRename: boolean;
  canRemoveFromFolder?: boolean;
  onClear: () => void;
  onDownload: () => void;
  onShare: () => void;
  onCopyLink: () => void;
  onRename: () => void;
  onRemoveFromFolder?: () => void;
  onDelete: () => void;
};

export function Toolbar({
  count, canRename, canRemoveFromFolder, onClear, onDownload, onShare, onCopyLink,
  onRename, onRemoveFromFolder, onDelete,
}: Props) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-2rem)] max-w-2xl animate-in slide-in-from-bottom-4 fade-in duration-200">
      <div className="bg-card/90 backdrop-blur-xl ring-1 ring-border shadow-2xl shadow-black/30 rounded-2xl px-3 py-2 flex items-center gap-1">
        <button
          onClick={onClear}
          aria-label="Limpar seleção"
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="text-sm font-medium px-2 whitespace-nowrap">
          {count} {count === 1 ? "item" : "itens"}
        </div>
        <div className="h-6 w-px bg-border mx-1" />
        <div className="flex-1 flex items-center justify-end gap-1 flex-wrap">
          <Action icon={Download} label="Baixar" onClick={onDownload} />
          <Action icon={Share2} label="Compartilhar" onClick={onShare} />
          <Action icon={Link2} label="Link público" onClick={onCopyLink} />
          {canRename && <Action icon={Pencil} label="Renomear" onClick={onRename} />}
          <Action icon={Trash2} label="Excluir" onClick={onDelete} danger />
        </div>
      </div>
    </div>
  );
}

function Action({ icon: Icon, label, onClick, danger }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={[
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition",
        danger
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-secondary",
      ].join(" ")}
    >
      <Icon className="w-4 h-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
