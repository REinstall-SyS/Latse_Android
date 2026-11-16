import { afterEach, describe, expect, it, vi } from "vitest";
const cache = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../storage.service", () => ({
  safeGetItem: (key: string, fallback: unknown) => cache.get(key) ?? fallback,
  safeSetItem: (key: string, value: unknown) => cache.set(key, value),
}));
import { fetchWeather } from "../weather.service";
afterEach(() => {
  cache.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("bounded weather loading", () => {
  it("aborts at six seconds and falls back to the offline forecast", async () => {
    vi.useFakeTimers();
    const entry = { data: { weather: [] }, fetchedAt: Date.now() - 60000 };
    cache.set("latse_weather_trail", entry);
    let signal: AbortSignal;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            signal = init.signal;
            signal.addEventListener("abort", () =>
              reject(new DOMException("Timed out", "AbortError")),
            );
          }),
      ),
    );
    const response = fetchWeather(0, 0, "trail");
    await vi.advanceTimersByTimeAsync(6000);
    expect(signal!.aborted).toBe(true);
    expect(await response).toMatchObject({
      data: entry.data,
      fromCache: true,
      error: false,
    });
  });
  it("rejects HTTP errors before attempting to parse the response", async () => {
    const json = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, json }),
    );
    expect(await fetchWeather(0, 0, "trail")).toMatchObject({
      data: null,
      error: true,
    });
    expect(json).not.toHaveBeenCalled();
  });
  it("caches a valid forecast and clears its abort timer", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ weather: [] }) }),
    );
    expect(await fetchWeather(0, 0, "trail")).toMatchObject({
      fromCache: false,
      error: false,
    });
    expect(cache.has("latse_weather_trail")).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
