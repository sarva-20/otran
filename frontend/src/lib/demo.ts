import type { ProductInput } from '@/api/types'

export const DEFAULT_DIMENSIONS: readonly string[] = [
  'pricing',
  'features',
  'integrations',
  'limits',
  'release_cadence',
] as const

export const DEMO_OUR_PRODUCT: ProductInput = {
  name: 'Acme Notes',
  url: 'https://acmenotes.example.com',
}

export const DEMO_COMPETITORS: readonly ProductInput[] = [
  {
    name: 'Rivalo',
    url: 'https://rivalo.example.com',
  },
  {
    name: 'Nimbus Docs',
    url: 'https://nimbusdocs.example.com',
  },
] as const

export const DEMO_DIMENSIONS: readonly string[] = [
  'pricing',
  'features',
  'release_cadence',
] as const
