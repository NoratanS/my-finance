import { request, type FullConfig } from '@playwright/test';
import { deleteTheSuitesProfiles, INSTANCE_WAS_EMPTY, listProfiles } from './support';

// Runs once before the suite. The specs delete every profile of the instance they run against
// (support.ts), so the suite only starts on an instance that has none: any profile already there
// is somebody's data, not the suite's.
//
// Two things keep that refusal from being for show:
// - It asks through the same address the tests use (baseURL: the Vite dev server and its proxy),
//   so the instance it looks at is the one the tests would empty.
// - Only a run that found the instance empty sets INSTANCE_WAS_EMPTY, and the deletion in
//   support.ts refuses without it. Playwright can run tests after a failed set-up (watch mode),
//   and it runs a separate `globalTeardown` even when the set-up threw; that is why the clean-up
//   after the suite is the function this returns and not a teardown file.
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL;
  const instance = await request.newContext({ baseURL });
  try {
    const profiles = await listProfiles(instance);
    if (profiles.length > 0) {
      throw new Error(
        `The instance behind ${baseURL} already has ${profiles.length} profile(s) ` +
          `(${profiles.map((profile) => profile.name).join(', ')}). The end-to-end suite deletes ` +
          'every profile of the instance it runs against, so it only starts on an empty one. ' +
          'Start a throwaway instance for it (README.md, "Running the end-to-end tests").',
      );
    }
  } finally {
    await instance.dispose();
  }
  process.env[INSTANCE_WAS_EMPTY] = '1';

  // The instance was empty, so whatever is there after the run is the suite's own.
  return async () => {
    const afterwards = await request.newContext({ baseURL });
    try {
      await deleteTheSuitesProfiles(afterwards);
    } finally {
      await afterwards.dispose();
    }
  };
}
