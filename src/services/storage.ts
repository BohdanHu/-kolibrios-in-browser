/**
 * IndexedDB persistence layer for v86 KolibriOS Emulator.
 * Stores virtual machine memory, device states, and persistent virtual hard drive changes.
 */

const DB_NAME = 'kolibri_v86_db';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';
const KEY_SESSION = 'active_session';
const KEY_PREFS = 'user_preferences';

export interface StorageMetadata {
  id: string;
  timestamp: number;
  sizeBytes: number;
  label?: string;
  osName: string;
}

export interface SessionRecord extends StorageMetadata {
  state: ArrayBuffer;
}

export interface UserPreferences {
  autoSaveEnabled: boolean;
  autoSaveIntervalSec: number;
  displayScale: 'fit' | '1x' | '1.5x' | '2x';
  soundEnabled: boolean;
  bootMedia: 'iso' | 'img';
  customIsoUrl?: string;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  autoSaveEnabled: true,
  autoSaveIntervalSec: 60,
  displayScale: 'fit',
  soundEnabled: true,
  bootMedia: 'iso',
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

/**
 * Persists the entire v86 state snapshot and virtual hard drive to IndexedDB.
 */
export async function saveSessionToIndexedDB(
  stateBuffer: ArrayBuffer,
  label: string = 'Auto / Manual Snapshot'
): Promise<StorageMetadata> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const record: SessionRecord = {
        id: KEY_SESSION,
        state: stateBuffer,
        timestamp: Date.now(),
        sizeBytes: stateBuffer.byteLength,
        label,
        osName: 'KolibriOS',
      };

      const request = store.put(record);

      request.onsuccess = () => {
        resolve({
          id: record.id,
          timestamp: record.timestamp,
          sizeBytes: record.sizeBytes,
          label: record.label,
          osName: record.osName,
        });
      };

      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Loads the saved v86 state snapshot from IndexedDB.
 */
export async function loadSessionFromIndexedDB(): Promise<SessionRecord | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(KEY_SESSION);

      request.onsuccess = () => {
        const result = request.result as SessionRecord | undefined;
        resolve(result || null);
      };

      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Checks storage stats without reading the large ArrayBuffer into memory if possible.
 */
export async function getStorageStats(): Promise<{
  connected: boolean;
  hasSavedSession: boolean;
  sizeBytes: number;
  timestamp: number | null;
  label?: string;
}> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(KEY_SESSION);

      request.onsuccess = () => {
        const res = request.result as SessionRecord | undefined;
        if (res && res.state) {
          resolve({
            connected: true,
            hasSavedSession: true,
            sizeBytes: res.sizeBytes || res.state.byteLength,
            timestamp: res.timestamp || null,
            label: res.label,
          });
        } else {
          resolve({
            connected: true,
            hasSavedSession: false,
            sizeBytes: 0,
            timestamp: null,
          });
        }
      };

      request.onerror = () => {
        resolve({
          connected: false,
          hasSavedSession: false,
          sizeBytes: 0,
          timestamp: null,
        });
      };
    });
  } catch {
    return {
      connected: false,
      hasSavedSession: false,
      sizeBytes: 0,
      timestamp: null,
    };
  }
}

/**
 * Clears the persisted state from IndexedDB to prepare for a fresh cold boot.
 */
export async function clearIndexedDBStorage(): Promise<boolean> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(KEY_SESSION);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Loads user preferences.
 */
export async function loadUserPreferences(): Promise<UserPreferences> {
  try {
    const raw = localStorage.getItem(KEY_PREFS);
    if (raw) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('Failed to parse user preferences:', e);
  }
  return DEFAULT_PREFERENCES;
}

/**
 * Saves user preferences.
 */
export function saveUserPreferences(prefs: UserPreferences): void {
  try {
    localStorage.setItem(KEY_PREFS, JSON.stringify(prefs));
  } catch (e) {
    console.warn('Failed to save user preferences:', e);
  }
}

/**
 * Formats byte counts into human-readable strings (MB, KB).
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
