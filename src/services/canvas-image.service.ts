const cache = new Map<string, Promise<HTMLImageElement>>();

/** Reuse decoded images while editing; a failed image may be retried. */
export function loadCanvasImage(url: string): Promise<HTMLImageElement> {
  const existing = cache.get(url);
  if (existing) return existing;
  const request = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => {
      image.onload = image.onerror = null;
      reject(new Error("The photo could not be opened. Try another image."));
    }, 12000);
    image.crossOrigin = "anonymous";
    image.onload = () => {
      clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(
        new Error(
          "This photo format could not be opened. Try a JPEG, PNG, or WebP image.",
        ),
      );
    };
    image.src = url;
  });
  cache.set(url, request);
  request.catch(() => {
    if (cache.get(url) === request) cache.delete(url);
  });
  while (cache.size > 16) cache.delete(cache.keys().next().value!);
  return request;
}
