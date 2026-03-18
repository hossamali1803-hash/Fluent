// Store rendered slide images in IndexedDB — survives page navigation on iOS Safari
const DB_NAME = "fluent-pdf";
const SLIDES_STORE = "slides";
const META_STORE = "meta";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SLIDES_STORE)) db.createObjectStore(SLIDES_STORE);
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSlideImages(blobs: Blob[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([SLIDES_STORE, META_STORE], "readwrite");
    tx.objectStore(SLIDES_STORE).clear();
    blobs.forEach((b, i) => tx.objectStore(SLIDES_STORE).put(b, i));
    tx.objectStore(META_STORE).put(blobs.length, "count");
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getSlideCount(): Promise<number> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const req = db.transaction(META_STORE).objectStore(META_STORE).get("count");
      req.onsuccess = () => { db.close(); resolve(req.result ?? 0); };
      req.onerror = () => { db.close(); resolve(0); };
    });
  } catch { return 0; }
}

export async function getSlideImage(index: number): Promise<string | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const req = db.transaction(SLIDES_STORE).objectStore(SLIDES_STORE).get(index);
      req.onsuccess = () => {
        db.close();
        if (req.result) resolve(URL.createObjectURL(req.result));
        else resolve(null);
      };
      req.onerror = () => { db.close(); resolve(null); };
    });
  } catch { return null; }
}

export async function getAllSlideUrls(): Promise<string[]> {
  try {
    const count = await getSlideCount();
    const urls: string[] = [];
    for (let i = 0; i < count; i++) {
      const url = await getSlideImage(i);
      if (url) urls.push(url);
    }
    return urls;
  } catch { return []; }
}

export async function clearSlides(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction([SLIDES_STORE, META_STORE], "readwrite");
      tx.objectStore(SLIDES_STORE).clear();
      tx.objectStore(META_STORE).clear();
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch {}
}
