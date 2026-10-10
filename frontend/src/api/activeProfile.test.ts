import { expect, test, vi } from 'vitest';
import { forgetProfile, rememberedProfileId, rememberProfile, subscribe } from './activeProfile';

// The key is part of what the browser keeps between visits: renaming it would make every
// browser forget its Active profile once.
const STORAGE_KEY = 'my-finance:active-profile-id';

/** The store as a page that has just loaded sees it: the module evaluated afresh. */
async function afterAPageLoad() {
  vi.resetModules();
  return import('./activeProfile');
}

test("a remembered Profile is this tab's Active profile, and is kept in localStorage for the next page load", () => {
  rememberProfile(7);

  expect(rememberedProfileId()).toBe(7);
  expect(window.localStorage.getItem(STORAGE_KEY)).toBe('7');
});

test('a page load starts in the Profile the browser remembered last', async () => {
  rememberProfile(7);

  const loaded = await afterAPageLoad();

  expect(loaded.rememberedProfileId()).toBe(7);
});

test('a page load with nothing remembered starts with no Active profile', async () => {
  window.localStorage.removeItem(STORAGE_KEY);

  const loaded = await afterAPageLoad();

  expect(loaded.rememberedProfileId()).toBeNull();
});

test.each(['', 'abc', '0', '-3', '1.5', '07', ' 7', '7 ', '99999999999999999999'])(
  'a stored value %j is not a profile id: the page load starts with no Active profile',
  async (stored) => {
    window.localStorage.setItem(STORAGE_KEY, stored);

    const loaded = await afterAPageLoad();

    expect(loaded.rememberedProfileId()).toBeNull();
  },
);

test('a forgotten Profile leaves nothing behind', () => {
  rememberProfile(7);

  forgetProfile();

  expect(rememberedProfileId()).toBeNull();
  expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
});

// Each tab has its own Active profile. localStorage is shared by every tab of the browser, but
// it is only read when a page loads.

test("what another tab chooses does not change this tab's Active profile", () => {
  rememberProfile(7);
  const listener = vi.fn();
  const unsubscribe = subscribe(listener);
  try {
    // What this tab sees when another tab of the browser chooses Profile 9.
    window.localStorage.setItem(STORAGE_KEY, '9');
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: '9' }));

    expect(rememberedProfileId()).toBe(7);
    expect(listener).not.toHaveBeenCalled();
  } finally {
    unsubscribe();
  }
});

test("forgetting this tab's Profile leaves a newer choice of another tab remembered", () => {
  rememberProfile(7);
  window.localStorage.setItem(STORAGE_KEY, '9');

  forgetProfile();

  expect(rememberedProfileId()).toBeNull();
  expect(window.localStorage.getItem(STORAGE_KEY)).toBe('9');
});

test('a listener hears every change made in this tab, until it unsubscribes', () => {
  const listener = vi.fn();
  const unsubscribe = subscribe(listener);

  rememberProfile(7);
  forgetProfile();
  expect(listener).toHaveBeenCalledTimes(2);

  unsubscribe();
  rememberProfile(8);
  expect(listener).toHaveBeenCalledTimes(2);
});
