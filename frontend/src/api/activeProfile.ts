// The remembered Active profile: the id of the Profile this browser is working in, kept in
// localStorage so the app reopens in it (ARCHITECTURE.md §4). Two modules touch it and no
// others: the client module, which names it on every request, and the profile hooks, which
// expose it to React. A lint rule keeps it that way.

const STORAGE_KEY = 'my-finance:active-profile-id';

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** The remembered Profile's id, or null when none is remembered or what is stored is not an id. */
export function rememberedProfileId(): number | null {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === null || !/^[1-9]\d*$/.test(stored)) return null;
  const id = Number(stored);
  return Number.isSafeInteger(id) ? id : null;
}

export function rememberProfile(id: number): void {
  window.localStorage.setItem(STORAGE_KEY, String(id));
  notify();
}

export function forgetProfile(): void {
  window.localStorage.removeItem(STORAGE_KEY);
  notify();
}

/**
 * For `useSyncExternalStore`. A change made in this tab reaches the listener through
 * `rememberProfile` / `forgetProfile`; one made in another tab arrives as a `storage` event,
 * so two tabs of one browser agree on the Active profile.
 */
export function subscribe(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    // key is null when the whole storage was cleared.
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  listeners.add(listener);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}
