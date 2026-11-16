/** Register fresh workers without HTTP-cache reuse and reload when an update takes control. */
export async function registerAppWorker(): Promise<() => void> {
  if (!("serviceWorker" in navigator)) return () => {};
  const workers = navigator.serviceWorker;
  let controlled = !!workers.controller,
    reloading = false;
  const changed = () => {
    if (!controlled) {
      controlled = true;
      return;
    }
    if (!reloading) {
      reloading = true;
      window.location.reload();
    }
  };
  workers.addEventListener("controllerchange", changed);
  try {
    const registration = await workers.register("/sw.js", {
      updateViaCache: "none",
    });
    if (!registration) {
      workers.removeEventListener("controllerchange", changed);
      return () => {};
    }
    const activate = () =>
      registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    const found = () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed") activate();
      });
    };
    registration.addEventListener("updatefound", found);
    activate();
    const check = () => {
      if (document.visibilityState === "visible")
        void registration.update().catch(() => undefined);
    };
    check();
    const timer = setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      workers.removeEventListener("controllerchange", changed);
      registration.removeEventListener("updatefound", found);
    };
  } catch (error) {
    workers.removeEventListener("controllerchange", changed);
    console.warn("Service Worker registration skipped or failed:", error);
    return () => {};
  }
}
