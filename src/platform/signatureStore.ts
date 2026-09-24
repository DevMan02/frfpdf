/**
 * "Ricorda la mia firma su questo dispositivo": the signature is kept in the
 * browser's IndexedDB, on this device only. Browser/PWA implementation; a
 * desktop build would store it in the app's data folder instead.
 * Every function fails quietly (private windows may block storage).
 */
export interface StoredSignature {
  png: Uint8Array;
  aspect: number;
  source: 'drawn' | 'image' | 'typed';
}

const DB_NAME = 'frfpdf';
const STORE = 'signature';
const KEY = 'saved';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function loadSavedSignature(): Promise<StoredSignature | null> {
  try {
    const value = (await run('readonly', (store) => store.get(KEY))) as StoredSignature | undefined;
    return value && value.png instanceof Uint8Array ? value : null;
  } catch {
    return null;
  }
}

export async function saveSignature(signature: StoredSignature): Promise<boolean> {
  try {
    await run('readwrite', (store) => store.put(signature, KEY));
    return true;
  } catch {
    return false;
  }
}

export async function deleteSavedSignature(): Promise<boolean> {
  try {
    await run('readwrite', (store) => store.delete(KEY));
    return true;
  } catch {
    return false;
  }
}
