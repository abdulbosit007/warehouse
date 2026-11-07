import { useEffect, useState } from "react";
import { loadFreeSecondaries } from "../lib/productSets";

// Product set: free pair items in all warehouses, Map product_id → free (can be < 0).
// Only pair items are in it; loaded once when the screen opens.
export default function useFreeSecondaries() {
  const [free, setFree] = useState(() => new Map());
  useEffect(() => {
    let live = true;
    loadFreeSecondaries().then((map) => {
      if (live) setFree(map);
    });
    return () => {
      live = false;
    };
  }, []);
  return free;
}
