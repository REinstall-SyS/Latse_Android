import { useCallback, useEffect, useRef, useState } from "react";
import type { HikeTrack } from "@/types/trek.types";
import { createRoam } from "@/domain/free-roam";
import { isStoredHike } from "@/services/track-validation";
import {
  loadMediaDocument,
  persistMediaDocument,
  removeMediaDocument,
} from "@/services/hike-persistence.service";

const KEY = "latse_roam_draft_v1";
export function useFreeRoam() {
  const [track, setTrack] = useState<HikeTrack>();
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const latest = useRef(track);
  const clearing = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef<ReturnType<typeof setTimeout>>();
  const restore = useRef<Promise<unknown>>();
  useEffect(() => {
    let alive = true;
    restore.current ??= loadMediaDocument(KEY, null);
    restore.current
      .then((value) => {
        if (!alive) return;
        if (isStoredHike(value)) {
          latest.current = value;
          setTrack(value);
        }
        setLoading(false);
      })
      .catch((e) => {
        if (alive) {
          setError((e as Error).message);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
      clearTimeout(pending.current);
    };
  }, []);
  const persist = useCallback((value: HikeTrack) => {
    const task = queue.current.then(() => persistMediaDocument(KEY, value));
    queue.current = task.then(
      () => setError(""),
      (e) => setError((e as Error).message),
    );
    return task;
  }, []);
  const update = useCallback(
    (value: HikeTrack, immediately = false) => {
      if (clearing.current) return Promise.resolve();
      latest.current = value;
      setTrack(value);
      clearTimeout(pending.current);
      if (immediately) return persist(value);
      pending.current = setTimeout(() => {
        void persist(value).catch(() => undefined);
      }, 600);
      return Promise.resolve();
    },
    [persist],
  );
  const flush = useCallback(async () => {
    clearTimeout(pending.current);
    await queue.current;
    if (latest.current) await persist(latest.current);
  }, [persist]);
  useEffect(() => {
    const leaving = () => {
      void flush().catch(() => undefined);
    };
    window.addEventListener("pagehide", leaving);
    return () => window.removeEventListener("pagehide", leaving);
  }, [flush]);
  return {
    track,
    active,
    loading,
    error,
    update,
    flush,
    enter: () => {
      if (loading) return;
      if (!latest.current) void update(createRoam());
      setActive(true);
    },
    leave: () => {
      void flush().catch(() => undefined);
      setActive(false);
    },
    clear: async () => {
      clearing.current = true;
      clearTimeout(pending.current);
      try {
        await queue.current;
        await removeMediaDocument(KEY);
        latest.current = undefined;
        setTrack(undefined);
        setActive(false);
        setError("");
      } finally {
        clearing.current = false;
      }
    },
  };
}
