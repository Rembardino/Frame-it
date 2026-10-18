import type { Clip } from './recorder';
import { TEST } from '../career/career';

export interface ArchivedClip { clip: Clip; seeds: number[] }
const database = TEST ? 'frameit.clips.test' : 'frameit.clips';
export const REPLAY_REQUEST = 'frameit.replay.request';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('clips');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Keep recordings outside the small localStorage career save. */
export async function saveClips(clips: { id: string; recording: ArchivedClip }[], retained: string[]) {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('clips', 'readwrite');
      const store = tx.objectStore('clips');
      for (const item of clips) store.put(item.recording, item.id);
      const keys = store.openKeyCursor();
      keys.onsuccess = () => {
        const cursor = keys.result;
        if (!cursor) return;
        if (!retained.includes(String(cursor.key))) store.delete(cursor.key);
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function loadClip(id: string): Promise<ArchivedClip | undefined> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('clips').objectStore('clips').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
