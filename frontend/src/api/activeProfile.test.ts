import { expect, test, vi } from 'vitest';
import { forgetProfile, rememberedProfileId, rememberProfile, subscribe } from './activeProfile';

// The key is part of what the browser keeps between visits: renaming it would make every
// browser forget its Active profile once.
const STORAGE_KEY = 'my-finance:active-profile-id';

test('a remembered Profile is kept in localStorage, so it is still there after a reload', () => {
  rememberProfile(7);

  expect(window.localStorage.getItem(STORAGE_KEY)).toBe('7');
  expect(rememberedProfileId()).toBe(7);
});

test('a forgotten Profile leaves nothing behind', () => {
  rememberProfile(7);

  forgetProfile();

  expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  expect(rememberedProfileId()).toBeNull();
});

test.each(['', 'abc', '0', '-3', '1.5', '07', ' 7', '7 ', '99999999999999999999'])(
  'a stored value %j is not a profile id and reads as none',
  (stored) => {
    window.localStorage.setItem(STORAGE_KEY, stored);

    expect(rememberedProfileId()).toBeNull();
  },
);

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

test('a listener hears a change made in another tab', () => {
  const listener = vi.fn();
  const unsubscribe = subscribe(listener);
  try {
    // What the browser does in every other tab of the origin when one tab writes.
    window.localStorage.setItem(STORAGE_KEY, '9');
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: '9' }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(rememberedProfileId()).toBe(9);

    window.dispatchEvent(new StorageEvent('storage', { key: 'something-else', newValue: 'x' }));
    expect(listener).toHaveBeenCalledTimes(1);

    // key is null when the other tab cleared the whole storage.
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(listener).toHaveBeenCalledTimes(2);
  } finally {
    unsubscribe();
  }
});
