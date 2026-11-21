"use client";

import { useEffect, useState } from "react";

/**
 * Subscribes to a Server-Sent Events stream. The browser reconnects by itself
 * if the connection drops; `connected` lets the UI show a "Reconnecting" hint.
 * `clockOffset` corrects countdowns when the phone's clock is wrong.
 */
export function useLive<T extends { serverNow: number }>(url: string, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [connected, setConnected] = useState(true);
  const [gone, setGone] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);

  useEffect(() => {
    const es = new EventSource(url);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      const next = JSON.parse(ev.data) as T;
      setClockOffset(next.serverNow - Date.now());
      setConnected(true);
      setData(next);
    };
    es.addEventListener("gone", () => {
      setGone(true);
      es.close();
    });
    return () => es.close();
  }, [url]);

  return { data, connected, gone, clockOffset };
}

/** Re-renders every second, for timers. Returns server-adjusted now. */
export function useNow(offset: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now + offset;
}
