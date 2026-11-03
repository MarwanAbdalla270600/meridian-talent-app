/**
 * Browser-side autosave of unsaved form drafts (localStorage). Drafts are removed
 * after a successful save and on logout.
 */
const PREFIX = 'mt-draft:';

export interface Draft<T> {
  savedAt: string;
  baseVersion: number | null;
  value: T;
}

export function saveDraft<T>(key: string, value: T, baseVersion: number | null) {
  try {
    localStorage.setItem(
      PREFIX + key,
      JSON.stringify({ savedAt: new Date().toISOString(), baseVersion, value }),
    );
  } catch {
    /* quota or disabled storage */
  }
}

export function loadDraft<T>(key: string): Draft<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Draft<T>) : null;
  } catch {
    return null;
  }
}

export function removeDraft(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export function clearDrafts() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
