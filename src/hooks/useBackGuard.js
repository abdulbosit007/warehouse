// While `active`, the phone's Back (the Android back swipe, the browser's Back
// button) calls `onBack` instead of leaving the screen. `onBack` returns true to
// let the screen go (the caller then leaves it itself, e.g. back to a list).
//
// How: one extra history step with the same address is added; Back uses it up,
// we catch that and add it again. It carries React Router's own position (idx),
// so the router sees no movement.
import { useEffect, useRef } from "react";

export default function useBackGuard(active, onBack) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) return;
    const guard = () => window.history.pushState({ ...window.history.state, backGuard: true }, "");
    guard();

    const onPop = () => {
      if (onBackRef.current?.()) return; // let it go: the extra step is used up
      guard();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [active]);
}
