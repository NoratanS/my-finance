/// <reference types="node" />
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { rememberedProfileId } from '../api/activeProfile';
import type { ProfileResponse } from '../api/types';
import { server, takeUnansweredRequests } from './server';

// The safety invariant of src/test/server.ts: nothing a unit test does ever reaches a socket.
// A real listener on a free local port stands in for a running instance and counts the
// connections it receives.

let listener: Server;
let connections: number;
let listenerUrl: string;

beforeEach(async () => {
  connections = 0;
  listener = createServer((_request, response) => response.end('reached'));
  listener.on('connection', () => {
    connections += 1;
  });
  await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
  listenerUrl = `http://127.0.0.1:${(listener.address() as AddressInfo).port}/api/transactions`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => listener.close(() => resolve()));
});

test('unit tests run on a reserved .invalid origin, not localhost:3000', () => {
  expect(window.location.origin).toBe('http://my-finance.invalid');
});

test('a request nobody answered is recorded by method and URL, and the app sees a network error', async () => {
  await expect(fetch('/api/categories', { method: 'DELETE' })).rejects.toThrow();

  expect(takeUnansweredRequests()).toEqual(['DELETE http://my-finance.invalid/api/categories']);
});

test('a request nobody answered never reaches a socket', async () => {
  await expect(fetch(listenerUrl)).rejects.toThrow();

  expect(takeUnansweredRequests()).toEqual([`GET ${listenerUrl}`]);
  expect(connections).toBe(0);
});

test('a handler that returns nothing falls through to the catch-all, not to the network', async () => {
  server.use(http.get('*', () => undefined));

  await expect(fetch(listenerUrl)).rejects.toThrow();

  expect(takeUnansweredRequests()).toEqual([`GET ${listenerUrl}`]);
  expect(connections).toBe(0);
});

test('without the catch-all, the error strategy still never performs the request', async () => {
  const defaults = server.listHandlers();
  // The one place a test may replace the defaults: it proves the second line of defence.
  server.resetHandlers(http.get('/api/unrelated', () => HttpResponse.json<string[]>([])));
  try {
    await expect(fetch(listenerUrl)).rejects.toThrow();
    expect(connections).toBe(0);
  } finally {
    server.resetHandlers(...defaults);
  }
});

test('the default profile list is the one "Household" Profile', async () => {
  const response = await fetch('/api/profiles');
  const body = (await response.json()) as ProfileResponse[];

  expect(body).toEqual([
    { id: 1, name: 'Household', defaultCurrency: 'PLN', createdAt: '2026-09-01T10:00:00Z' },
  ]);
});

test('"Household" is the remembered Active profile when a test starts', () => {
  expect(rememberedProfileId()).toBe(1);
});
