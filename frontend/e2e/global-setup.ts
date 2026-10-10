import { request } from '@playwright/test';
import { deleteAllProfiles } from './support';

const BACKEND = 'http://localhost:8080';

// Runs once before the suite. The specs delete every profile of the instance they run against
// (support.ts), so the suite only starts on an instance that has none: any profile already there
// is somebody's data, not the suite's.
//
// The clean-up after the suite is the function this returns, on purpose. Playwright runs a
// separate `globalTeardown` even when the set-up threw, and a teardown that deletes every
// profile would then wipe exactly the instance this guard has just refused to touch.
export default async function globalSetup() {
  const backend = await request.newContext({ baseURL: BACKEND });
  try {
    const answer = await backend.get('/api/profiles');
    if (!answer.ok()) {
      throw new Error(
        `The backend on ${BACKEND} answered ${answer.status()} to GET /api/profiles.`,
      );
    }
    const profiles = (await answer.json()) as { name: string }[];
    if (profiles.length > 0) {
      throw new Error(
        `The instance on ${BACKEND} already has ${profiles.length} profile(s) ` +
          `(${profiles.map((profile) => profile.name).join(', ')}). The end-to-end suite deletes ` +
          'every profile of the instance it runs against, so it only starts on an empty one. ' +
          'Start a throwaway instance for it (README.md, "Running the end-to-end tests").',
      );
    }
  } finally {
    await backend.dispose();
  }

  // The instance was empty, so whatever is there after the run is the suite's own.
  return async () => {
    const afterwards = await request.newContext({ baseURL: BACKEND });
    try {
      await deleteAllProfiles(afterwards);
    } finally {
      await afterwards.dispose();
    }
  };
}
