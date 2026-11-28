"use client";

import { useEffect, useRef } from "react";

/**
 * While a full-screen sheet (menu, trivia) is open, the phone's Back button closes the sheet
 * instead of leaving the page. Opening adds one history step; closing by button removes it.
 */
export function useBackClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ tpSheet: true }, "");
    const here = window.location.href;
    let poppedByBack = false;
    const onPop = () => {
      poppedByBack = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed with the sheet's own button: take back the history step we added.
      // (Not if the page itself moved on, e.g. the guest was just sent to their table.)
      if (!poppedByBack && window.location.href === here && (window.history.state as { tpSheet?: boolean } | null)?.tpSheet) {
        window.history.back();
      }
    };
  }, [open]);
}
