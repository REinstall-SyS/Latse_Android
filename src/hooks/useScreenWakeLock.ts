import { useEffect, useState } from "react";
/** Screen Wake Lock is best effort and is released by the OS when hidden. */
export function useScreenWakeLock(running: boolean) {
  const [status, setStatus] = useState<"held" | "unavailable" | "released">(
    "released",
  );
  useEffect(() => {
    if (!running) {
      setStatus("released");
      return;
    }
    let cancelled = false,
      lock: WakeLockSentinel | undefined,
      requesting = false;
    const acquire = async () => {
      if (
        document.visibilityState !== "visible" ||
        requesting ||
        (lock && !lock.released)
      )
        return;
      if (!navigator.wakeLock) {
        setStatus("unavailable");
        return;
      }
      requesting = true;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await next.release();
          return;
        }
        lock = next;
        setStatus("held");
        next.addEventListener("release", () => {
          if (!cancelled) setStatus("released");
        });
      } catch {
        if (!cancelled) setStatus("unavailable");
      } finally {
        requesting = false;
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release().catch(() => undefined);
    };
  }, [running]);
  return status;
}
