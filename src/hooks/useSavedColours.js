// The catalog's saved colours (owner "Catalog" page), shared by every window that
// edits variant colours. find(label) = the saved colour with that name, or null.
import { useCallback, useEffect, useMemo, useState } from "react";
import { loadColours, onColoursChange } from "../lib/catalog";

export const colourKey = (name) => String(name || "").trim().toLowerCase();

export default function useSavedColours() {
  const [state, setState] = useState({ colours: [], missing: false });

  useEffect(() => {
    let alive = true;
    loadColours().then((s) => { if (alive) setState(s); });
    const off = onColoursChange((s) => { if (alive) setState(s); });
    return () => { alive = false; off(); };
  }, []);

  const byName = useMemo(() => new Map(state.colours.map((c) => [colourKey(c.name), c])), [state.colours]);
  const find = useCallback((label) => byName.get(colourKey(label)) || null, [byName]);

  return { ...state, find };
}
