import React, { useEffect, useRef, useState } from "react";
import { formatDistance, formatElevation } from "@/domain/units";
import { useUnits } from "@/hooks/useUnits";
export function PocketLock({
  distanceKm,
  elevation,
  onUnlock,
}: {
  distanceKm: number;
  elevation: number | null;
  onUnlock: () => void;
}) {
  const { units } = useUnits();
  const [now, setNow] = useState(new Date()),
    [holding, setHolding] = useState(false),
    [slide, setSlide] = useState(0);
  const overlay = useRef<HTMLDivElement>(null),
    unlock = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(),
    startX = useRef<number>(),
    unlocked = useRef(false);
  const callback = useRef(onUnlock);
  callback.current = onUnlock;
  const finish = () => {
    if (unlocked.current) return;
    unlocked.current = true;
    clearTimeout(timer.current);
    callback.current();
  };
  const cancel = () => {
    clearTimeout(timer.current);
    startX.current = undefined;
    setHolding(false);
    setSlide(0);
  };
  const begin = () => {
    clearTimeout(timer.current);
    setHolding(true);
    timer.current = setTimeout(finish, 1500);
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    unlock.current?.focus();
    const tick = setInterval(() => setNow(new Date()), 30000);
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        event.preventDefault();
        unlock.current?.focus();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const focus = (event: FocusEvent) => {
      if (!overlay.current?.contains(event.target as Node))
        unlock.current?.focus();
    };
    const back = (event: Event) => event.preventDefault();
    document.addEventListener("keydown", trap, true);
    document.addEventListener("focusin", focus);
    document.addEventListener("latse:back", back);
    return () => {
      clearInterval(tick);
      clearTimeout(timer.current);
      document.removeEventListener("keydown", trap, true);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("latse:back", back);
      previous?.focus();
    };
  }, []);
  return (
    <div
      ref={overlay}
      className="pocket-lock"
      role="dialog"
      aria-modal="true"
      aria-label="Pocket Lock"
    >
      <p className="eyebrow">POCKET LOCK · RECORDING</p>
      <time>
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </time>
      <p>
        {formatDistance(distanceKm, units)} ·{" "}
        {elevation === null
          ? "Elevation unavailable"
          : formatElevation(elevation, units)}
      </p>
      <button
        ref={unlock}
        className={holding ? "pocket-unlock holding" : "pocket-unlock"}
        aria-label="Slide right or hold 1.5s to Unlock"
        style={{ "--unlock-progress": `${slide}px` } as React.CSSProperties}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          startX.current = event.clientX;
          begin();
        }}
        onPointerMove={(event) => {
          if (
            startX.current === undefined ||
            !event.currentTarget.hasPointerCapture(event.pointerId)
          )
            return;
          const distance = Math.max(0, event.clientX - startX.current);
          setSlide(Math.min(120, distance));
          if (distance >= 120) finish();
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onKeyDown={(event) => {
          if ((event.key === " " || event.key === "Enter") && !event.repeat) {
            event.preventDefault();
            begin();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === " " || event.key === "Enter") cancel();
        }}
        onBlur={cancel}
      >
        <span className="pocket-slide-thumb" aria-hidden="true">
          →
        </span>
        <span>Slide right / Hold 1.5s to Unlock</span>
      </button>
      <small>Keep Latse open. Screen Wake Lock depends on your device.</small>
    </div>
  );
}
