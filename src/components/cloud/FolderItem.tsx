import { Folder, Loader2 } from "lucide-react";
import type { FolderRow } from "./types";

type Props = {
  folder: FolderRow;
  selected: boolean;
  dropActive: boolean;
  busy?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
};

export function FolderItem({
  folder, selected, dropActive, busy,
  onClick, onDoubleClick, onDragStart, onDragOver, onDragLeave, onDrop,
}: Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      aria-selected={selected}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onDoubleClick();
      }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={[
        "nflx-tile group select-none cursor-pointer rounded-md p-4 ring-1 flex items-center gap-3",
        "bg-card",
        selected ? "ring-2 ring-primary" : "ring-border/60",
        dropActive ? "ring-2 ring-primary scale-[1.03] shadow-lg shadow-primary/30" : "",
      ].join(" ")}
    >
      <Folder
        className={`w-8 h-8 shrink-0 transition-colors ${dropActive ? "text-accent" : "text-accent/80"}`}
        strokeWidth={1.5}
      />
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{folder.name}</div>
        <div className="text-xs text-muted-foreground">
          {dropActive ? "Soltar para mover aqui" : "Pasta"}
        </div>
      </div>
      {busy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
    </div>
  );
}
