// The ONLY module the UI imports for data. Flip VITE_USE_MOCK to switch backends.
import { USE_MOCK } from '@/lib/env'
import { mockApi } from './mock'
import { realApi } from './real'
import type { ApiClient } from './types'

export const api: ApiClient = USE_MOCK ? mockApi : realApi
export { ApiError } from './errors'
export { USE_MOCK }
