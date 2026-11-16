import { useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import type { HikeTrack, ViewId } from "@/types/trek.types";
import { parseTrailInput } from "@/services/route-import.service";
/** Native URL intents and web route links share the same validated import path. */
export function useRouteLinks(
  onSave: (track: HikeTrack) => Promise<void>,
  onNavigate: (view: ViewId) => void,
) {
  const [message, setMessage] = useState("");
  const latest = useRef({ onSave, onNavigate });
  latest.current = { onSave, onNavigate };
  const imported = useRef(new Set<string>());
  const inFlight = useRef(new Map<string, Promise<HikeTrack>>());
  useEffect(() => {
    let cancelled = false,
      stop: (() => void) | undefined;
    const receive = async (url: string) => {
      if (!url || imported.current.has(url)) return;
      let job = inFlight.current.get(url);
      if (!job) {
        job = (async () => {
          const track = parseTrailInput(url);
          await latest.current.onSave(track);
          return track;
        })();
        inFlight.current.set(url, job);
      }
      try {
        const track = await job;
        if (!cancelled) {
          imported.current.add(url);
          latest.current.onNavigate("map");
          if (!Capacitor.isNativePlatform() && url === window.location.href) {
            const consumed = new URL(url);
            consumed.searchParams.delete("data");
            window.history.replaceState(window.history.state, "", consumed);
          }
          setMessage(
            `Opened ${track.name}. Photos stay on the sender's device.`,
          );
        }
      } catch (e) {
        if (!cancelled) setMessage((e as Error).message);
        imported.current.delete(url);
      } finally {
        if (inFlight.current.get(url) === job) inFlight.current.delete(url);
      }
    };
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener("appUrlOpen", (event) => {
        void receive(event.url);
      })
        .then((handle) => {
          if (cancelled) void handle.remove();
          else
            stop = () => {
              void handle.remove();
            };
        })
        .catch(() => undefined);
      CapacitorApp.getLaunchUrl()
        .then((result) => {
          if (!cancelled && result?.url) void receive(result.url);
        })
        .catch(() => undefined);
    } else if (new URL(window.location.href).searchParams.has("data"))
      void receive(window.location.href);
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
  return { message, dismiss: () => setMessage("") };
}
