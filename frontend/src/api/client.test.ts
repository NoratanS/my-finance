import { http, HttpResponse } from 'msw';
import { describe, expect, test } from 'vitest';
import { categoryTree } from '../test/fixtures';
import { problem, server } from '../test/server';
import { forgetProfile, rememberedProfileId, rememberProfile } from './activeProfile';
import { api, ApiError, apiDownload, apiUpload, queryString } from './client';
import type { BackupRestoreResponse, CategoryNode } from './types';

const [food] = categoryTree([{ id: 3, name: 'Food' }]);

/** What the handler received, recorded for the wire properties nobody sees on a screen. */
function recordRequests(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) {
  const received: Request[] = [];
  server.use(
    http[method](path, ({ request }) => {
      received.push(request.clone());
      return HttpResponse.json<CategoryNode>(food);
    }),
  );
  return received;
}

/** The ApiError a request rejected with (fails the test if it resolved). */
async function rejectionOf(request: Promise<unknown>): Promise<ApiError> {
  return request.then(
    () => expect.unreachable('the request resolved'),
    (error: ApiError) => error,
  );
}

describe('api', () => {
  test('a read sends no JSON content type', async () => {
    const received = recordRequests('get', '/api/categories/3');

    await api<CategoryNode>('/api/categories/3');

    expect(received[0].headers.get('Content-Type')).toBeNull();
  });

  test.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)(
    'a %s sends a JSON body with its content type',
    async (method) => {
      const received = recordRequests(
        method.toLowerCase() as 'post' | 'put' | 'patch' | 'delete',
        '/api/categories/3',
      );

      await api<CategoryNode>('/api/categories/3', { method, body: { name: 'Food' } });

      expect(received[0].headers.get('Content-Type')).toBe('application/json');
      expect(await received[0].json()).toEqual({ name: 'Food' });
    },
  );

  test('a 2xx answer resolves to the parsed body', async () => {
    server.use(http.get('/api/categories', () => HttpResponse.json<CategoryNode[]>([food])));

    await expect(api<CategoryNode[]>('/api/categories')).resolves.toEqual([food]);
  });

  test('a 204 resolves without parsing a body', async () => {
    server.use(http.delete('/api/categories/3', () => new HttpResponse(null, { status: 204 })));

    await expect(api<void>('/api/categories/3', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  test('a Problem becomes an ApiError carrying status, type, title, detail, field errors and extension members', async () => {
    server.use(
      http.post('/api/categories', () =>
        problem(422, 'category-depth-exceeded', 'Categories nest at most 5 levels deep.', {
          title: 'Category depth limit exceeded',
          errors: [{ field: 'parentId', message: 'too deep' }],
          extensions: { maxDepth: 5 },
        }),
      ),
    );

    const error = await rejectionOf(api('/api/categories', { method: 'POST', body: {} }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      type: '/errors/category-depth-exceeded',
      title: 'Category depth limit exceeded',
      detail: 'Categories nest at most 5 levels deep.',
      message: 'Categories nest at most 5 levels deep.',
      errors: [{ field: 'parentId', message: 'too deep' }],
    });
    expect(error.extra.maxDepth).toBe(5);
  });

  test("a non-JSON error body, such as a proxy's HTML 502, gives the fallback detail and the unknown type", async () => {
    server.use(
      http.get('/api/categories', () =>
        HttpResponse.html('<html><body>Bad Gateway</body></html>', { status: 502 }),
      ),
    );

    const error = await rejectionOf(api('/api/categories'));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 502,
      type: '/errors/unknown',
      detail: 'Request failed with status 502.',
    });
  });

  test('a network failure rejects with an error that is not an ApiError', async () => {
    server.use(http.get('/api/categories', () => HttpResponse.error()));

    const error: unknown = await api('/api/categories').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ApiError);
  });
});

describe('the Active profile header', () => {
  const backupForm = () => {
    const form = new FormData();
    form.append('file', '{"formatVersion":1}');
    return form;
  };

  /** Sends one request of every kind the client makes and returns each one's X-Profile-Id. */
  async function profileHeaders(): Promise<Record<string, string | null>> {
    const sent: Record<string, string | null> = {};
    const record = (name: string) => (request: Request) => {
      sent[name] = request.headers.get('X-Profile-Id');
    };
    server.use(
      http.get('/api/categories', ({ request }) => {
        record('read')(request);
        return HttpResponse.json<CategoryNode[]>([food]);
      }),
      http.post('/api/categories', ({ request }) => {
        record('change')(request);
        return HttpResponse.json<CategoryNode>(food);
      }),
      http.delete('/api/categories/3', ({ request }) => {
        record('bodiless change')(request);
        return new HttpResponse(null, { status: 204 });
      }),
      http.post('/api/backup/export', ({ request }) => {
        record('download')(request);
        return new HttpResponse('{}');
      }),
      http.post('/api/backup/restore', ({ request }) => {
        record('upload')(request);
        return HttpResponse.json<BackupRestoreResponse>({ profiles: [] });
      }),
    );

    await api('/api/categories');
    await api('/api/categories', { method: 'POST', body: { name: 'Food' } });
    await api('/api/categories/3', { method: 'DELETE' });
    await apiDownload('/api/backup/export', { profileIds: [1] });
    await apiUpload('/api/backup/restore', backupForm());
    return sent;
  }

  test('every request names the remembered Profile', async () => {
    rememberProfile(7);

    expect(await profileHeaders()).toEqual({
      read: '7',
      change: '7',
      'bodiless change': '7',
      download: '7',
      upload: '7',
    });
  });

  test('with no Profile remembered, every request still carries the header, empty', async () => {
    forgetProfile();

    expect(await profileHeaders()).toEqual({
      read: '',
      change: '',
      'bodiless change': '',
      download: '',
      upload: '',
    });
  });

  test('no request carries a CSRF header, even with a CSRF cookie left in the browser', async () => {
    document.cookie = 'XSRF-TOKEN=left-over; path=/';
    const received: Request[] = [];
    server.use(
      http.post('/api/categories', ({ request }) => {
        received.push(request.clone());
        return HttpResponse.json<CategoryNode>(food);
      }),
      http.post('/api/backup/export', ({ request }) => {
        received.push(request.clone());
        return new HttpResponse('{}');
      }),
      http.post('/api/backup/restore', ({ request }) => {
        received.push(request.clone());
        return HttpResponse.json<BackupRestoreResponse>({ profiles: [] });
      }),
    );
    try {
      await api('/api/categories', { method: 'POST', body: { name: 'Food' } });
      await apiDownload('/api/backup/export', { profileIds: [1] });
      await apiUpload('/api/backup/restore', backupForm());
    } finally {
      document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    }

    expect(received).toHaveLength(3);
    for (const request of received) {
      expect(request.headers.get('X-XSRF-TOKEN')).toBeNull();
    }
  });

  test('a no-active-profile Problem forgets the remembered Profile', async () => {
    rememberProfile(7);
    server.use(
      http.get('/api/categories', () =>
        problem(409, 'no-active-profile', 'Name an existing profile in the X-Profile-Id header.'),
      ),
    );

    await expect(api('/api/categories')).rejects.toBeInstanceOf(ApiError);

    expect(rememberedProfileId()).toBeNull();
  });

  test('a 409 with any other type leaves the remembered Profile alone', async () => {
    rememberProfile(7);
    server.use(
      http.delete('/api/categories/3', () =>
        problem(409, 'category-in-use', 'Food still has transactions.'),
      ),
    );

    await expect(api('/api/categories/3', { method: 'DELETE' })).rejects.toBeInstanceOf(ApiError);

    expect(rememberedProfileId()).toBe(7);
  });

  test('a late no-active-profile answer to a request that named another Profile leaves the new choice alone', async () => {
    rememberProfile(7);
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.get('/api/categories', async () => {
        await held;
        return problem(409, 'no-active-profile', 'Name an existing profile.');
      }),
    );
    const sentForSeven = api('/api/categories');

    rememberProfile(8);
    release();
    await expect(sentForSeven).rejects.toBeInstanceOf(ApiError);

    expect(rememberedProfileId()).toBe(8);
  });
});

describe('backup download', () => {
  const backupJson = '{"formatVersion":1,"profiles":[]}';

  test('resolves to the file and the filename from Content-Disposition', async () => {
    server.use(
      http.post(
        '/api/backup/export',
        () =>
          new HttpResponse(backupJson, {
            headers: {
              'Content-Type': 'application/json',
              'Content-Disposition': 'attachment; filename="my-finance-backup-2026-09-30.json"',
            },
          }),
      ),
    );

    const file = await apiDownload('/api/backup/export', { profileIds: [1] });

    expect(file.filename).toBe('my-finance-backup-2026-09-30.json');
    expect(await file.blob.text()).toBe(backupJson);
  });

  test('falls back to a default filename without Content-Disposition', async () => {
    server.use(http.post('/api/backup/export', () => new HttpResponse(backupJson)));

    const file = await apiDownload('/api/backup/export', { profileIds: [1] });

    expect(file.filename).toBe('my-finance-backup.json');
  });

  test('sends the JSON body', async () => {
    const received: Request[] = [];
    server.use(
      http.post('/api/backup/export', ({ request }) => {
        received.push(request.clone());
        return new HttpResponse(backupJson);
      }),
    );

    await apiDownload('/api/backup/export', { profileIds: [1, 2] });

    expect(received[0].headers.get('Content-Type')).toBe('application/json');
    expect(await received[0].json()).toEqual({ profileIds: [1, 2] });
  });

  test('a Problem becomes an ApiError', async () => {
    server.use(
      http.post('/api/backup/export', () => problem(404, 'not-found', 'Profile 9 not found.')),
    );

    const error = await rejectionOf(apiDownload('/api/backup/export', { profileIds: [9] }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, type: '/errors/not-found' });
  });
});

describe('backup upload', () => {
  const restored: BackupRestoreResponse = {
    profiles: [
      { id: 7, name: 'Household', categories: 4, transactions: 12, budgets: 1, subscriptions: 2 },
    ],
  };

  // The part is a string, not a File: Vitest 5's jsdom bridge copies a File's bytes from
  // jsdom's private `_buffer`, which jsdom 30 renamed, so a File part reaches the handler empty
  // (and named "blob"). What the client owns (the FormData passed through untouched, as
  // multipart) is the same either way.
  function backupForm(content: string): FormData {
    const form = new FormData();
    form.append('file', content);
    return form;
  }

  test('sends a multipart body whose part named file carries the backup', async () => {
    const received: { contentType: string | null; part: unknown }[] = [];
    server.use(
      http.post('/api/backup/restore', async ({ request }) => {
        received.push({
          contentType: request.headers.get('Content-Type'),
          part: (await request.formData()).get('file'),
        });
        return HttpResponse.json<BackupRestoreResponse>(restored);
      }),
    );

    const result = await apiUpload<BackupRestoreResponse>(
      '/api/backup/restore',
      backupForm('{"formatVersion":1}'),
    );

    expect(result).toEqual(restored);
    // Not application/json: the multipart boundary comes from fetch, not the client.
    expect(received[0].contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(received[0].part).toBe('{"formatVersion":1}');
  });

  test("a 422 backup-invalid's problem list reaches the error's extension members", async () => {
    server.use(
      http.post('/api/backup/restore', () =>
        problem(422, 'backup-invalid', 'The backup has 2 problems.', {
          extensions: {
            problems: ['profiles[0].name: must not be blank', 'profiles[0].currency: unknown'],
          },
        }),
      ),
    );

    const error = await rejectionOf(apiUpload('/api/backup/restore', backupForm('{}')));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.extra.problems).toEqual([
      'profiles[0].name: must not be blank',
      'profiles[0].currency: unknown',
    ]);
  });
});

describe('queryString', () => {
  test('encodes the defined parameters and drops the undefined ones', () => {
    expect(
      queryString({ q: 'coffee & cake', page: 2, includeDescendants: true, to: undefined }),
    ).toBe('?q=coffee+%26+cake&page=2&includeDescendants=true');
  });

  test('is empty when no parameter is defined', () => {
    expect(queryString({ q: undefined })).toBe('');
  });
});
