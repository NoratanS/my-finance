import createClient from 'openapi-fetch'
import type { paths } from '@/api/schema'

// Same origin everywhere (Vite proxy in dev, Vercel rewrite in prod); absolute so Node's fetch parses it in tests.
export const api = createClient<paths>({ baseUrl: window.location.origin })
