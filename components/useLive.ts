"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase/browser";

const POLL_MS = 20_000;

/**
 * Keeps a snapshot fresh.
 *  1. Listens on the restaurant's Supabase Realtime channel for "change" pings.
 *  2. On each ping, reloads the snapshot from our own API (the ping has no data).
 *  3. Also reloads every 20 seconds and when the phone wakes up, in case a ping was missed.
 * `gone` turns true when the API answers 401/404 (logged out, or ticket no longer exists).
 */
export function useLive<T extends { serverNow: number; channel: string }>(snapshotUrl: string, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [connected, setConnected] = useState(true);
  const [gone, setGone] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bumped by patch(): an answer that left before a local change is out of date, so it's dropped.
  const stamp = useRef(0);

  const refresh = useCallback(async () => {
    const started = stamp.current;
    try {
      const res = await fetch(snapshotUrl, { cache: "no-store" });
      if (res.status === 401 || res.status === 404) {
        setGone(true);
        return;
      }
      if (!res.ok) return;
      const next = (await res.json()) as T;
      if (stamp.current !== started) return;
      setClockOffset(next.serverNow - Date.now());
      setData(next);
    } catch {
      setConnected(false);
    }
  }, [snapshotUrl]);

  // Several pings in a row (e.g. two quick taps) cause one reload, and pings never cause more
  // than one reload a second, so a flood of fake pings can't hammer the server.
  const lastRun = useRef(0);
  const scheduleRefresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const wait = Math.max(150, lastRun.current + 1000 - Date.now());
    timer.current = setTimeout(() => {
      lastRun.current = Date.now();
      void refresh();
    }, wait);
  }, [refresh]);

  useEffect(() => {
    const supabase = browserClient();
    const channel = supabase
      ?.channel(initial.channel)
      .on("broadcast", { event: "change" }, scheduleRefresh)
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
        // Catch up on anything missed while disconnected.
        if (status === "SUBSCRIBED") scheduleRefresh();
      });

    const poll = setInterval(scheduleRefresh, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && scheduleRefresh();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [initial.channel, scheduleRefresh]);

  /** Show a change at once, before the server confirms it. The next refresh brings the real state. */
  const patch = useCallback((fn: (d: T) => T) => {
    stamp.current += 1;
    setData(fn);
  }, []);

  return { data, connected, gone, clockOffset, refresh, patch };
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
