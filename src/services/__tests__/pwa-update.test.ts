import { afterEach, expect, it, vi } from "vitest";
import { registerAppWorker } from "../pwa-update.service";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function fixture(controlled = true) {
  const waiting = { postMessage: vi.fn() };
  const installing = Object.assign(new EventTarget(), { state: "installing" });
  const registration = Object.assign(new EventTarget(), {
    waiting,
    installing,
    update: vi.fn().mockResolvedValue(undefined),
  });
  const workers = Object.assign(new EventTarget(), {
    controller: controlled ? {} : null,
    register: vi.fn().mockResolvedValue(registration),
  });
  const document = Object.assign(new EventTarget(), {
    visibilityState: "visible",
  });
  const reload = vi.fn();
  vi.stubGlobal("navigator", { serviceWorker: workers });
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", { location: { reload } });
  return { registration, workers, waiting, installing, document, reload };
}
it("bypasses stale worker HTTP caches, activates waiting updates, and refreshes a controlled page once", async () => {
  vi.useFakeTimers();
  const f = fixture(),
    dispose = await registerAppWorker();
  expect(f.workers.register).toHaveBeenCalledWith("/sw.js", {
    updateViaCache: "none",
  });
  expect(f.waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  expect(f.registration.update).toHaveBeenCalledTimes(1);
  f.workers.dispatchEvent(new Event("controllerchange"));
  f.workers.dispatchEvent(new Event("controllerchange"));
  expect(f.reload).toHaveBeenCalledTimes(1);
  dispose();
});
it("does not reload on the initial install claim and checks again on foreground return", async () => {
  vi.useFakeTimers();
  const f = fixture(false),
    dispose = await registerAppWorker();
  f.workers.dispatchEvent(new Event("controllerchange"));
  expect(f.reload).not.toHaveBeenCalled();
  f.document.visibilityState = "hidden";
  await vi.advanceTimersByTimeAsync(60000);
  expect(f.registration.update).toHaveBeenCalledTimes(1);
  f.document.visibilityState = "visible";
  f.document.dispatchEvent(new Event("visibilitychange"));
  expect(f.registration.update).toHaveBeenCalledTimes(2);
  f.workers.dispatchEvent(new Event("controllerchange"));
  expect(f.reload).toHaveBeenCalledOnce();
  dispose();
});
it("activates a worker installed after registration rather than leaving it waiting", async () => {
  vi.useFakeTimers();
  const f = fixture(),
    dispose = await registerAppWorker();
  f.waiting.postMessage.mockClear();
  f.registration.dispatchEvent(new Event("updatefound"));
  f.installing.state = "installed";
  f.installing.dispatchEvent(new Event("statechange"));
  expect(f.waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  dispose();
});
