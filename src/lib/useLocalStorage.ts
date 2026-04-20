import { useEffect, useState } from "react";

/**
 * Persistent state backed by localStorage. `parse` must validate the raw
 * string and return a value of type T or null (null = "use the initial").
 * Writes happen in a post-commit effect so they never block render.
 */
export function useLocalStorage<T>(
  key: string,
  initial: T,
  parse: (raw: string) => T | null,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    const raw = window.localStorage.getItem(key);
    if (raw === null) return initial;
    const parsed = parse(raw);
    return parsed === null ? initial : parsed;
  });

  useEffect(() => {
    window.localStorage.setItem(key, String(value));
  }, [key, value]);

  return [value, setValue];
}
