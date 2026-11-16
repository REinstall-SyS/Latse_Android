import { safeGetItem, safeSetItem } from "./storage.service";

export interface WeatherCacheEntry {
  data: WeatherData;
  fetchedAt: number;
}

export interface WeatherData {
  current_condition?: Array<{
    temp_C: string;
    FeelsLikeC: string;
    humidity: string;
    windspeedKmph: string;
    uvIndex: string;
    weatherDesc: Array<{ value: string }>;
  }>;
  weather?: Array<{
    date: string;
    maxtempC: string;
    mintempC: string;
    hourly: Array<{
      chanceofrain: string;
      weatherDesc: Array<{ value: string }>;
    }>;
  }>;
}

function cacheKey(trailId: string): string {
  return `latse_weather_${trailId}`;
}

/**
 * Get cached weather data, if any.
 */
export function getCachedWeather(trailId: string): WeatherCacheEntry | null {
  return safeGetItem<WeatherCacheEntry | null>(cacheKey(trailId), null);
}

/**
 * Compute staleness string from a fetchedAt timestamp.
 * Returns e.g. "Updated 2h 15m ago"
 */
export function formatStaleness(fetchedAt: number): string {
  const diffMs = Date.now() - fetchedAt;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Updated just now";
  if (diffMin < 60) return `Updated ${diffMin}m ago`;
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return `Updated ${hours}h ${mins}m ago`;
}

/**
 * Fetch weather from wttr.in and cache the result.
 * Returns { data, fromCache, staleness }.
 */
export async function fetchWeather(
  lat: number,
  lng: number,
  trailId: string,
): Promise<{
  data: WeatherData | null;
  fromCache: boolean;
  staleness: string | null;
  error: boolean;
}> {
  const cached = getCachedWeather(trailId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`https://wttr.in/${lat},${lng}?format=j1`, {
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`Weather request failed (${response.status}).`);
    const data = (await response.json()) as WeatherData;

    if (data && data.weather) {
      // Cache the fresh data
      const entry: WeatherCacheEntry = { data, fetchedAt: Date.now() };
      safeSetItem(cacheKey(trailId), entry);
      return { data, fromCache: false, staleness: null, error: false };
    }

    // Invalid response — fall back to cache
    if (cached) {
      return {
        data: cached.data,
        fromCache: true,
        staleness: formatStaleness(cached.fetchedAt),
        error: false,
      };
    }

    return { data: null, fromCache: false, staleness: null, error: true };
  } catch {
    // Network error — fall back to cache
    if (cached) {
      return {
        data: cached.data,
        fromCache: true,
        staleness: formatStaleness(cached.fetchedAt),
        error: false,
      };
    }

    return { data: null, fromCache: false, staleness: null, error: true };
  } finally {
    clearTimeout(timeout);
  }
}
