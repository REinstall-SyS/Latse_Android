const SCHEMA_VERSION = 2;
const SCHEMA_KEY = "latse_schema_version";

function checkSchema(): void {
  const stored = localStorage.getItem(SCHEMA_KEY);
  if (stored !== String(SCHEMA_VERSION)) {
    try {
      localStorage.setItem(SCHEMA_KEY, String(SCHEMA_VERSION));
    } catch {
      /* A full index must not prevent reading existing records. */
    }
  }
}

export function safeGetItem<T>(key: string, fallback: T): T {
  try {
    checkSchema();
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function safeSetItem<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    return false;
  }
}

export {
  loadMediaDocument,
  persistMediaDocument,
  removeMediaDocument,
  MediaPersistenceError,
} from "./hike-persistence.service";

export function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

/**
 * Get today's date key in YYYY-MM-DD format.
 */
export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Get a date-scoped key (e.g., latse_breadcrumbs_2024-01-15).
 */
export function dateKey(prefix: string): string {
  return `${prefix}_${todayKey()}`;
}
