import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import type { ViewId } from "@/types/trek.types";
interface BackButtonConfig {
  currentView: ViewId;
  setView: (view: ViewId) => void;
  hasModalOpen: boolean;
  closeModal: () => void;
}
export function useAndroidBackButton(config: BackButtonConfig) {
  const latest = useRef(config);
  latest.current = config;
  useEffect(() => {
    const back = () => {
      // Let a nested camera/photo/route sheet consume Back before changing tabs.
      const modalBack = new Event("latse:back", { cancelable: true });
      document.dispatchEvent(modalBack);
      if (modalBack.defaultPrevented) return;
      const c = latest.current;
      if (c.hasModalOpen) c.closeModal();
      else if (c.currentView !== "explore") c.setView("explore");
      else if (Capacitor.isNativePlatform()) void App.minimizeApp();
    };
    const listener = Capacitor.isNativePlatform()
      ? App.addListener("backButton", back)
      : undefined;
    const pop = () => {
      back();
      window.history.pushState(null, "", window.location.href);
    };
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", pop);
    return () => {
      listener?.then((handle) => handle.remove());
      window.removeEventListener("popstate", pop);
    };
  }, []);
}
