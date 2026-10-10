// The Active profile of this tab: the id of the Profile it is working in (ARCHITECTURE.md §4).
// It lives in memory, so every tab has its own, and localStorage keeps the last choice so the
// next page load starts in it. Two modules touch it and no others: the client module, which
// names it on every request, and the profile hooks, which expose it to React. A lint rule
// keeps it that way.

const STORAGE_KEY = 'my-finance:active-profile-id';

const listeners = new Set<() => void>();

/** What the browser remembered last, or null when nothing is stored or it is not an id. */
function lastRememberedProfileId(): number | null {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === null || !/^[1-9]\d*$/.test(stored)) return null;
  const id = Number(stored);
  return Number.isSafeInteger(id) ? id : null;
}

// Read once, when the page loads. From then on this tab follows only its own choices: what
// another tab chooses or forgets reaches localStorage, never this variable.
let activeProfileId: number | null = lastRememberedProfileId();

function setActiveProfileId(id: number | null) {
  activeProfileId = id;
  for (const listener of listeners) listener();
}

/** This tab's Active profile: the id it remembered, or null when it has none. */
export function rememberedProfileId(): number | null {
  return activeProfileId;
}

/** Makes `id` this tab's Active profile, and the one the next page load starts in. */
export function rememberProfile(id: number): void {
  window.localStorage.setItem(STORAGE_KEY, String(id));
  setActiveProfileId(id);
}

/**
 * Leaves this tab without an Active profile. The browser stops remembering the Profile too,
 * unless another tab has chosen one since: that newer choice is not this tab's to erase.
 */
export function forgetProfile(): void {
  if (lastRememberedProfileId() === activeProfileId) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  setActiveProfileId(null);
}

/** For `useSyncExternalStore`: the listener hears every change this tab makes. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
