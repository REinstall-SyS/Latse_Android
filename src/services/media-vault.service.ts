/** IndexedDB holds media and document metadata in the same durable transaction. */
const DATABASE = "latse_media_v1";
const MEDIA = "media",
  DOCUMENTS = "documents";
export interface MediaWrite {
  id: string;
  dataUrl: string;
}
export class MediaVault {
  private opening?: Promise<IDBDatabase | null>;
  private cache = new Map<string, string>();
  private durable = new Set<string>();
  private factory: () => IDBFactory | undefined;
  constructor(
    factory = () => (typeof indexedDB === "undefined" ? undefined : indexedDB),
  ) {
    this.factory = factory;
  }
  private open(): Promise<IDBDatabase | null> {
    if (this.opening) return this.opening;
    this.opening = new Promise((resolve) => {
      let factory: IDBFactory | undefined;
      try {
        factory = this.factory();
      } catch {
        resolve(null);
        return;
      }
      if (!factory) {
        resolve(null);
        return;
      }
      let settled = false;
      const finish = (db: IDBDatabase | null) => {
        if (settled) {
          db?.close();
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(db);
      };
      const timer = setTimeout(() => finish(null), 2500);
      try {
        const request = factory.open(DATABASE, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(MEDIA)) db.createObjectStore(MEDIA);
          if (!db.objectStoreNames.contains(DOCUMENTS))
            db.createObjectStore(DOCUMENTS);
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            this.opening = undefined;
          };
          finish(db);
        };
        request.onerror = () => finish(null);
        request.onblocked = () => finish(null);
      } catch {
        finish(null);
      }
    });
    return this.opening;
  }
  get(id: string): string | undefined {
    return this.cache.get(id);
  }
  stage(entries: MediaWrite[]): void {
    for (const entry of entries) {
      if (this.get(entry.id) !== entry.dataUrl) this.durable.delete(entry.id);
      this.cache.set(entry.id, entry.dataUrl);
    }
  }
  async load(id: string): Promise<string | undefined> {
    const cached = this.get(id);
    if (cached) return cached;
    const db = await this.open();
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const request = db
          .transaction(MEDIA, "readonly")
          .objectStore(MEDIA)
          .get(id);
        request.onsuccess = () => {
          const value =
            typeof request.result === "string" ? request.result : undefined;
          if (value) {
            this.cache.set(id, value);
            this.durable.add(id);
          }
          resolve(value);
        };
        request.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  }
  async read<T>(key: string): Promise<T | undefined> {
    const db = await this.open();
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const request = db
          .transaction(DOCUMENTS, "readonly")
          .objectStore(DOCUMENTS)
          .get(key);
        request.onsuccess = () => resolve(request.result as T | undefined);
        request.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  }
  async commit(
    key: string,
    value: unknown,
    entries: MediaWrite[],
    retained: Set<string>,
  ): Promise<boolean> {
    const changed = entries.filter(
      (entry) =>
        this.get(entry.id) !== entry.dataUrl || !this.durable.has(entry.id),
    );
    this.stage(entries);
    const db = await this.open();
    if (!db) return false;
    return new Promise((resolve) => {
      let transaction: IDBTransaction | undefined;
      try {
        transaction = db.transaction([MEDIA, DOCUMENTS], "readwrite");
        const media = transaction.objectStore(MEDIA);
        for (const entry of changed) media.put(entry.dataUrl, entry.id);
        transaction.objectStore(DOCUMENTS).put(value, key);
        // Only prune media owned by this document, never another hike library/draft.
        const cursor = media.openCursor();
        cursor.onsuccess = () => {
          const item = cursor.result;
          if (!item) return;
          if (
            typeof item.key === "string" &&
            item.key.startsWith(`${key}/`) &&
            !retained.has(item.key)
          )
            item.delete();
          item.continue();
        };
        transaction.oncomplete = () => {
          for (const entry of changed)
            if (this.get(entry.id) === entry.dataUrl)
              this.durable.add(entry.id);
          for (const id of this.cache.keys())
            if (id.startsWith(`${key}/`) && !retained.has(id)) {
              this.cache.delete(id);
              this.durable.delete(id);
            }
          resolve(true);
        };
        transaction.onerror = () => resolve(false);
        transaction.onabort = () => resolve(false);
      } catch {
        try {
          transaction?.abort();
        } catch {
          /* The transaction may already have aborted. */
        }
        resolve(false);
      }
    });
  }
  async remove(key: string): Promise<void> {
    const db = await this.open();
    if (db)
      await new Promise<void>((resolve, reject) => {
        try {
          const tx = db.transaction([DOCUMENTS, MEDIA], "readwrite");
          tx.objectStore(DOCUMENTS).delete(key);
          const cursor = tx.objectStore(MEDIA).openCursor();
          cursor.onsuccess = () => {
            const item = cursor.result;
            if (!item) return;
            if (String(item.key).startsWith(`${key}/`)) item.delete();
            item.continue();
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () =>
            reject(new Error("Could not remove the saved draft."));
          tx.onabort = () =>
            reject(new Error("Draft removal was interrupted."));
        } catch (e) {
          reject(e);
        }
      });
    for (const id of this.cache.keys())
      if (id.startsWith(`${key}/`)) {
        this.cache.delete(id);
        this.durable.delete(id);
      }
  }
}
export const mediaVault = new MediaVault();
