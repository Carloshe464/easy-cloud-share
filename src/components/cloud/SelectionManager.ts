import { useCallback, useRef, useState } from "react";
import type { SelectionKey } from "./types";

export type SelectionAPI = {
  selected: Set<SelectionKey>;
  count: number;
  isSelected: (k: SelectionKey) => boolean;
  clear: () => void;
  selectAll: (keys: SelectionKey[]) => void;
  toggle: (k: SelectionKey) => void;
  handleClick: (e: React.MouseEvent, k: SelectionKey, ordered: SelectionKey[]) => void;
};

export function useSelection(): SelectionAPI {
  const [selected, setSelected] = useState<Set<SelectionKey>>(new Set());
  const anchorRef = useRef<SelectionKey | null>(null);

  const isSelected = useCallback((k: SelectionKey) => selected.has(k), [selected]);
  const clear = useCallback(() => {
    anchorRef.current = null;
    setSelected(new Set());
  }, []);
  const selectAll = useCallback((keys: SelectionKey[]) => setSelected(new Set(keys)), []);
  const toggle = useCallback((k: SelectionKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent, k: SelectionKey, ordered: SelectionKey[]) => {
      const shift = e.shiftKey;
      if (shift && anchorRef.current) {
        const a = ordered.indexOf(anchorRef.current);
        const b = ordered.indexOf(k);
        if (a !== -1 && b !== -1) {
          const [start, end] = a < b ? [a, b] : [b, a];
          const range = ordered.slice(start, end + 1);
          setSelected((prev) => {
            const next = new Set(prev);
            range.forEach((x) => next.add(x));
            return next;
          });
          return;
        }
      }
      // Once any item is selected, additional clicks toggle (add/remove) without modifier.
      setSelected((prev) => {
        anchorRef.current = k;
        if (prev.size === 0) return new Set([k]);
        const next = new Set(prev);
        if (next.has(k)) next.delete(k);
        else next.add(k);
        return next;
      });
    },
    []
  );

  return { selected, count: selected.size, isSelected, clear, selectAll, toggle, handleClick };
}
