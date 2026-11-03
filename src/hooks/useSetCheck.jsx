import { useRef, useState } from "react";
import SetCheckDialog from "../components/SetCheckDialog";
import { checkSetLines } from "../lib/productSets";

/* ─────────────────────────────────────────────────────────────────────────────
   TUMBA SET CHECK
   Before tumbas / rakovinas leave a warehouse for a branch:
   - a rakovina alone beyond the free part: stopped, with how many are free
   - tumbas with no rakovina in any warehouse: asked once, then they come
     "(без раковины)"
   const { setCheckDialog, confirmSetLines } = useSetCheck();
   if (!(await confirmSetLines(lines, toLocationId))) return;
───────────────────────────────────────────────────────────────────────────── */
export default function useSetCheck() {
  const [check, setCheck] = useState(null); // { blocked, without } | null
  const answer = useRef(null);

  const confirmSetLines = async (lines, toLocationId) => {
    const result = await checkSetLines(lines, toLocationId);
    if (result.blocked.length === 0 && result.without.length === 0) return true;
    setCheck(result);
    return new Promise((resolve) => {
      answer.current = resolve;
    });
  };

  const close = (yes) => {
    setCheck(null);
    answer.current?.(yes);
    answer.current = null;
  };

  const setCheckDialog = check ? (
    <SetCheckDialog check={check} onYes={() => close(true)} onClose={() => close(false)} />
  ) : null;

  return { setCheckDialog, confirmSetLines };
}

