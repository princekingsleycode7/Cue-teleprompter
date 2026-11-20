import { DEFAULT_PROMPTER_SETTINGS, DEFAULT_SCRIPTS } from '../data/defaultScripts';
import { PrompterSettings, ReviewNote, Script, TakeRecording } from '../types/teleprompter';

const SCRIPTS_STORAGE_KEY = 'cuestage_scripts_v1';
const SETTINGS_STORAGE_KEY = 'cuestage_settings_v1';
const ACTIVE_SCRIPT_KEY = 'cuestage_active_script_v1';

const DB_NAME = 'CueStageDB';
const DB_VERSION = 1;
const TAKES_STORE = 'takes';

export function loadScripts(): Script[] {
  try {
    const raw = localStorage.getItem(SCRIPTS_STORAGE_KEY);
    if (!raw) return DEFAULT_SCRIPTS;
    const parsed = JSON.parse(raw) as Script[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_SCRIPTS;
    return parsed.map((s) => ({
      ...s,
      format: s.format === 'plain' ? 'plain' : 'markdown',
    }));
  } catch {
    return DEFAULT_SCRIPTS;
  }
}

export function saveScripts(scripts: Script[]): void {
  try {
    localStorage.setItem(SCRIPTS_STORAGE_KEY, JSON.stringify(scripts));
  } catch {
    // ignore quota issues
  }
}

export function loadActiveScriptId(scripts: Script[]): string {
  try {
    const saved = localStorage.getItem(ACTIVE_SCRIPT_KEY);
    if (saved && scripts.some((s) => s.id === saved)) {
      return saved;
    }
  } catch {
    // ignore
  }
  return scripts[0]?.id ?? '';
}

export function saveActiveScriptId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_SCRIPT_KEY, id);
  } catch {
    // ignore
  }
}

export function loadSettings(): PrompterSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_PROMPTER_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<PrompterSettings>;
    return { ...DEFAULT_PROMPTER_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_PROMPTER_SETTINGS;
  }
}

export function saveSettings(settings: PrompterSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TAKES_STORE)) {
        const store = db.createObjectStore(TAKES_STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open CueStageDB.'));
  });
}

export async function getAllTakes(): Promise<TakeRecording[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TAKES_STORE, 'readonly');
    const store = tx.objectStore(TAKES_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const items = (req.result as TakeRecording[]) || [];
      items.sort((a, b) => b.createdAt - a.createdAt);
      resolve(items);
    };
    req.onerror = () => reject(req.error ?? new Error('Failed to load takes.'));
  });
}

export async function saveTake(take: TakeRecording): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TAKES_STORE, 'readwrite');
    const store = tx.objectStore(TAKES_STORE);
    const req = store.put(take);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('Failed to save take.'));
  });
}

export async function updateTakeNotes(takeId: string, notes: ReviewNote[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TAKES_STORE, 'readwrite');
    const store = tx.objectStore(TAKES_STORE);
    const getReq = store.get(takeId);
    getReq.onsuccess = () => {
      const existing = getReq.result as TakeRecording | undefined;
      if (!existing) {
        resolve();
        return;
      }
      const updated: TakeRecording = { ...existing, notes };
      const putReq = store.put(updated);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error ?? new Error('Failed to update notes.'));
    };
    getReq.onerror = () => reject(getReq.error ?? new Error('Failed to read take.'));
  });
}

export async function deleteTake(takeId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TAKES_STORE, 'readwrite');
    const store = tx.objectStore(TAKES_STORE);
    const req = store.delete(takeId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('Failed to delete take.'));
  });
}
