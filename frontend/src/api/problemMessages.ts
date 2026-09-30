import { ApiError } from './client';

/** What a screen can show for one failed request. */
export interface ProblemMessages {
  /** One line for the whole action; empty only when every message was placed at a field. */
  banner: string;
  /** Messages keyed by the requested field names, and only those. */
  fields: Record<string, string>;
  /** The Problem list (`problems`) of a `backup-invalid` or `invalid-plan` Problem, else empty. */
  problemList: string[];
  /** The Problem type without its `/errors/` prefix, or null when the failure was not a Problem. */
  slug: string | null;
}

export interface ProblemMessagesOptions {
  /** Request field names (as on the wire) the screen shows a message under. */
  fields?: readonly string[];
  /** Prefix the banner with the status and type: "409 category-name-taken — …". */
  withCode?: boolean;
}

const FALLBACK = 'Something went wrong — is the backend running?';

/**
 * Pseudo-fields a form can trigger, mapped to the real field they concern. A cross-field rule
 * is an `@AssertTrue` method on the backend, so its violation carries the method's name
 * (docs/API.md "Validation failures"). Any other name passes through untouched.
 */
const PSEUDO_FIELDS: Record<string, string> = {
  occurredOnNotInFuture: 'occurredOn',
  passwordWithinBcryptLimit: 'password',
  periodValid: 'periodEnd',
};

/**
 * Turns whatever a failed request threw into what a screen shows. The one place where a
 * failure becomes text: screens say which fields they show and where the banner goes.
 *
 * Rules, in order:
 * 1. Not an `ApiError` (a network failure, a non-JSON success body, anything thrown): the
 *    banner is the fallback sentence "Something went wrong — is the backend running?".
 * 2. An `ApiError` whose body is not a Problem (no `type`): the backend did not answer. At 500
 *    and above (in production, the proxy's bad gateway) the fallback sentence; below 500 the
 *    error's own "Request failed with status N.". No slug.
 * 3. A Problem with field violations: a pseudo-field is first translated to its real field; a
 *    field listed in `fields` gets the message (several joined with " · "); every other
 *    violation becomes a banner line "field: message", lines joined with " · ". The Problem's
 *    "N invalid field(s)" detail is never shown.
 * 4. Any other Problem: the banner is its `detail`, the server's human-readable sentence.
 * 5. `withCode` and a non-empty banner from a Problem: "status slug — banner".
 * 6. `problemList` is the Problem's `problems` member (strings only), for any Problem.
 *
 * It never throws, and no message from the server is dropped.
 *
 * There is no global fallback: every mutation call handles its own failure with this
 * function, and shows the result next to the control that triggered it, or it fails silently.
 * Screens may branch on `slug` — docs/API.md makes the Problem type the stable part a client
 * switches on; the `detail` is prose.
 */
export function problemMessages(
  failure: unknown,
  { fields = [], withCode = false }: ProblemMessagesOptions = {},
): ProblemMessages {
  const result: ProblemMessages = { banner: '', fields: {}, problemList: [], slug: null };

  if (!(failure instanceof ApiError)) {
    result.banner = FALLBACK;
    return result;
  }

  if (typeof failure.extra.type !== 'string') {
    result.banner = failure.status >= 500 ? FALLBACK : failure.detail;
    return result;
  }

  result.slug = failure.type.replace(/^\/errors\//, '');

  if (failure.errors && failure.errors.length > 0) {
    const bannerLines: string[] = [];
    for (const violation of failure.errors) {
      const field = PSEUDO_FIELDS[violation.field] ?? violation.field;
      if (fields.includes(field)) {
        const placed = result.fields[field];
        result.fields[field] = placed ? `${placed} · ${violation.message}` : violation.message;
      } else {
        bannerLines.push(`${field}: ${violation.message}`);
      }
    }
    result.banner = bannerLines.join(' · ');
  } else {
    result.banner = failure.detail;
  }

  if (withCode && result.banner) {
    result.banner = `${failure.status} ${result.slug} — ${result.banner}`;
  }

  const problems = failure.extra.problems;
  if (Array.isArray(problems)) {
    result.problemList = problems.filter((p): p is string => typeof p === 'string');
  }

  return result;
}
