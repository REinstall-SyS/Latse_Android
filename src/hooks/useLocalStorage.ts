import { useState, useCallback } from "react";

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        // Read freshest value directly from storage to avoid stale closures
        const current = (() => {
          try {
            const raw = window.localStorage.getItem(key);
            return raw ? (JSON.parse(raw) as T) : initialValue;
          } catch {
            return initialValue;
          }
        })();
        const valueToStore = value instanceof Function ? value(current) : value;
        setStoredValue(valueToStore);
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      } catch (error) {
        console.error("Error setting localStorage", error);
      }
    },
    [key, initialValue],
  );

  return [storedValue, setValue];
}
