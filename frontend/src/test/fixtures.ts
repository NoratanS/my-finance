// Wire fixtures: typed builders for the objects the backend sends, each returning a fresh
// object with wire-format defaults. A test overrides only the fields it is about. A builder
// enters this module when a second test file needs the same wire object (the rule of two);
// until then the one test that needs it declares the object locally, typed against api/types.
// See ARCHITECTURE.md §4, "Why unit tests fake the network, not the hooks".

import type { ProfileSummary, SessionResponse } from '../api/types';

export function profileSummary(overrides: Partial<ProfileSummary> = {}): ProfileSummary {
  return { id: 1, name: 'Household', defaultCurrency: 'PLN', ...overrides };
}

/** A signed-in User in password Sign-in mode, with the "Household" Profile active. */
export function session(overrides: Partial<SessionResponse> = {}): SessionResponse {
  return {
    user: { id: 1, email: 'owner@example.com', displayName: 'Owner' },
    profiles: [profileSummary()],
    activeProfileId: 1,
    authMode: 'PASSWORD',
    ...overrides,
  };
}
