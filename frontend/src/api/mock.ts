// Mock API: serves ../contracts/samples.json and simulates the pipeline (2 s start, SSE at ~700 ms/event).
// State is in-memory only (resets on page refresh). Same ApiClient interface as realApi.
import samplesJson from '@contracts/samples.json'
import { ApiError } from './errors'
import type {
  AgentEvent, Analysis, AnalysisCreate, AnalysisStats, ApiClient, Change, ChangesQuery, ChatResponse,
  Claim, Evidence, Health, Matrix, MatrixCell, Product, Report, Snapshot, StreamDoneStatus, StreamHandlers,
} from './types'

interface Samples {
  health: Health
  analysis: Analysis
  events: AgentEvent[]
  matrix: Matrix
  claim: Claim
  snapshot: Snapshot
  changes: Change[]
  report: Report
  chat_response: ChatResponse
}
const S = samplesJson as unknown as Samples

const START_DELAY_MS = 2000
const EVENT_INTERVAL_MS = 700
// Product ids used by the sample matrix/claims, assigned by position so mock data lines up.
const COMPETITOR_IDS = ['p_riv', 'p_nim', 'p_c3', 'p_c4'] as const

const delay = (ms = 200): Promise<void> => new Promise((r) => setTimeout(r, ms))
const clone = <T,>(v: T): T => structuredClone(v)
const nowIso = (): string => new Date().toISOString()

interface Run {
  analysis: Analysis
  emitted: AgentEvent[]
  listeners: Set<StreamHandlers>
  timer: ReturnType<typeof setInterval> | null
  finished: StreamDoneStatus | null
}

const runs = new Map<string, Run>()

// Seed: the completed sample analysis, so the "past analyses" list is never empty.
runs.set(S.analysis.id, {
  analysis: clone(S.analysis),
  emitted: clone(S.events),
  listeners: new Set(),
  timer: null,
  finished: 'completed',
})

function scaledStats(fraction: number): AnalysisStats {
  const full = S.analysis.stats ?? {}
  const scale = (n: number | undefined): number => Math.round((n ?? 0) * fraction)
  return {
    sources_collected: scale(full.sources_collected),
    claims_total: scale(full.claims_total),
    claims_verified: scale(full.claims_verified),
    claims_contradicted: scale(full.claims_contradicted),
    changes_detected: scale(full.changes_detected),
  }
}

function startRun(run: Run): void {
  if (run.timer) clearInterval(run.timer)
  run.emitted = []
  run.finished = null
  run.analysis = { ...run.analysis, status: 'running', completed_at: null, stats: scaledStats(0) }

  run.timer = setInterval(() => {
    const next = S.events[run.emitted.length]
    if (!next) return
    const event: AgentEvent = { ...clone(next), ts: nowIso() }
    run.emitted.push(event)
    run.analysis = { ...run.analysis, stats: scaledStats(run.emitted.length / S.events.length) }
    run.listeners.forEach((h) => h.onEvent(event))

    if (run.emitted.length >= S.events.length) {
      if (run.timer) clearInterval(run.timer)
      run.timer = null
      run.finished = 'completed'
      run.analysis = {
        ...run.analysis,
        status: 'completed',
        completed_at: nowIso(),
        stats: clone(S.analysis.stats ?? {}),
      }
      run.listeners.forEach((h) => h.onDone('completed'))
      run.listeners.clear()
    }
  }, EVENT_INTERVAL_MS)
}

function getRun(id: string): Run {
  const run = runs.get(id)
  if (!run) throw new ApiError(404, `Analysis ${id} not found`)
  return run
}

function missingCell(product_id: string, dimension: string): MatrixCell {
  return {
    product_id, dimension, value: 'No public data found',
    verification_status: 'missing', confidence: 0, claim_ids: [], advantage: 'unknown',
  }
}

// -----------------------------------------------------------------------------
// Mock-only fixtures for claims and snapshots (F3)
// Guarantees all claim IDs from matrix, changes, report and chat citations resolve.
// -----------------------------------------------------------------------------
const mockSnapshots = new Map<string, Snapshot>()
const mockClaims = new Map<string, Claim>()

function registerMockSnapshot(
  id: string,
  url: string,
  sourceType: string,
  quote: string,
  prefix = 'Documentation and page overview.\n',
  suffix = '\nAdditional terms and metadata apply.',
): { snapshotId: string; char_start: number; char_end: number } {
  const fullText = `${prefix}${quote}${suffix}`
  const char_start = prefix.length
  const char_end = char_start + quote.length
  const snapshot: Snapshot = {
    id,
    url,
    source_type: sourceType,
    captured_at: '2026-10-31T10:00:15Z',
    content_hash: `sha256:${id}e3b0c44`,
    text: fullText,
  }
  mockSnapshots.set(id, snapshot)
  return { snapshotId: id, char_start, char_end }
}

function initMockFixtures(): void {
  // c_001: Acme Notes pricing ($10/mo)
  const snap001 = registerMockSnapshot(
    's_001',
    'https://acmenotes.example.com/pricing',
    'pricing',
    'Pro Plan: $10 per user / month, unlimited notes & collaboration',
    'Acme Notes Pricing Tiers\nFree - Basic note taking\n',
    '\nEnterprise - Custom volume pricing with dedicated SLA',
  )
  mockClaims.set('c_001', {
    id: 'c_001',
    product_id: 'p_our',
    dimension: 'pricing',
    statement: 'Acme Notes Pro plan costs $10 per user per month billed monthly.',
    data: { tier: 'Pro', price: 10, currency: 'USD', billing: 'monthly' },
    evidence: [
      {
        id: 'e_001a',
        quote: 'Pro Plan: $10 per user / month, unlimited notes & collaboration',
        source_url: 'https://acmenotes.example.com/pricing',
        source_type: 'pricing',
        snapshot_id: snap001.snapshotId,
        char_start: snap001.char_start,
        char_end: snap001.char_end,
        captured_at: '2026-10-31T10:00:10Z',
      },
    ],
    verification: {
      status: 'verified',
      confidence: 0.95,
      reason: 'Quote found verbatim on live pricing page.',
    },
    first_seen_at: '2026-10-20T08:00:00Z',
    last_seen_at: '2026-10-31T10:00:10Z',
  })

  // c_003: Acme Notes features (offline mode, AI search, SSO)
  const snap003 = registerMockSnapshot(
    's_003',
    'https://acmenotes.example.com/features',
    'product_page',
    'Offline mode with local sync, semantic AI search across notebooks, and enterprise SSO.',
    'Acme Notes Core Features Overview\n',
    '\nBuilt with end-to-end encryption and compliance standards.',
  )
  mockClaims.set('c_003', {
    id: 'c_003',
    product_id: 'p_our',
    dimension: 'features',
    statement: 'Acme Notes supports offline mode, semantic AI search, and enterprise SSO.',
    data: { offline_mode: true, ai_search: true, sso: true },
    evidence: [
      {
        id: 'e_003a',
        quote: 'Offline mode with local sync, semantic AI search across notebooks, and enterprise SSO.',
        source_url: 'https://acmenotes.example.com/features',
        source_type: 'product_page',
        snapshot_id: snap003.snapshotId,
        char_start: snap003.char_start,
        char_end: snap003.char_end,
        captured_at: '2026-10-31T10:00:10Z',
      },
    ],
    verification: {
      status: 'verified',
      confidence: 0.9,
      reason: 'Verified verbatim in technical feature specifications.',
    },
    first_seen_at: '2026-10-20T08:00:00Z',
    last_seen_at: '2026-10-31T10:00:10Z',
  })

  // c_004: Rivalo features (AI search, SSO)
  const snap004 = registerMockSnapshot(
    's_004',
    'https://rivalo.example.com/product',
    'product_page',
    'AI workspace search and enterprise SAML SSO included on Pro tiers.',
    'Rivalo Platform Capabilities\n',
    '\nDesigned for distributed teams.',
  )
  mockClaims.set('c_004', {
    id: 'c_004',
    product_id: 'p_riv',
    dimension: 'features',
    statement: 'Rivalo includes AI search and enterprise SSO on its Pro plans.',
    data: { ai_search: true, sso: true },
    evidence: [
      {
        id: 'e_004a',
        quote: 'AI workspace search and enterprise SAML SSO included on Pro tiers.',
        source_url: 'https://rivalo.example.com/product',
        source_type: 'product_page',
        snapshot_id: snap004.snapshotId,
        char_start: snap004.char_start,
        char_end: snap004.char_end,
        captured_at: '2026-10-31T10:00:12Z',
      },
    ],
    verification: {
      status: 'verified',
      confidence: 0.88,
      reason: 'Confirmed in product documentation and enterprise feature matrix.',
    },
    first_seen_at: '2026-10-24T09:00:00Z',
    last_seen_at: '2026-10-31T10:00:12Z',
  })

  // c_005: Acme Notes release cadence (Monthly)
  const snap005 = registerMockSnapshot(
    's_005',
    'https://acmenotes.example.com/changelog',
    'release_notes',
    'Platform updates are deployed on the first Tuesday of each month.',
    'Acme Notes Release Schedule\n',
    '\nSee release archive for full changelog details.',
  )
  mockClaims.set('c_005', {
    id: 'c_005',
    product_id: 'p_our',
    dimension: 'release_cadence',
    statement: 'Acme Notes deploys platform updates on a monthly cadence.',
    data: { cadence: 'monthly' },
    evidence: [
      {
        id: 'e_005a',
        quote: 'Platform updates are deployed on the first Tuesday of each month.',
        source_url: 'https://acmenotes.example.com/changelog',
        source_type: 'release_notes',
        snapshot_id: snap005.snapshotId,
        char_start: snap005.char_start,
        char_end: snap005.char_end,
        captured_at: '2026-10-31T10:00:10Z',
      },
    ],
    verification: {
      status: 'verified',
      confidence: 0.9,
      reason: 'Confirmed by analyzing the last 12 changelog entries.',
    },
    first_seen_at: '2026-10-20T08:00:00Z',
    last_seen_at: '2026-10-31T10:00:10Z',
  })

  // c_006: Rivalo release cadence (Biweekly)
  const snap006 = registerMockSnapshot(
    's_006',
    'https://rivalo.example.com/changelog',
    'release_notes',
    'Biweekly Releases: updates shipped every alternating Wednesday.',
    'Rivalo Changelog & Version History\n',
    '\nRecent performance optimizations and bug fixes.',
  )
  mockClaims.set('c_006', {
    id: 'c_006',
    product_id: 'p_riv',
    dimension: 'release_cadence',
    statement: 'Rivalo ships product releases on a biweekly schedule.',
    data: { cadence: 'biweekly' },
    evidence: [
      {
        id: 'e_006a',
        quote: 'Biweekly Releases: updates shipped every alternating Wednesday.',
        source_url: 'https://rivalo.example.com/changelog',
        source_type: 'release_notes',
        snapshot_id: snap006.snapshotId,
        char_start: snap006.char_start,
        char_end: snap006.char_end,
        captured_at: '2026-10-31T10:00:12Z',
      },
    ],
    verification: {
      status: 'verified',
      confidence: 0.9,
      reason: 'Confirmed from changelog cadence and commit release notes.',
    },
    first_seen_at: '2026-10-24T09:00:00Z',
    last_seen_at: '2026-10-31T10:00:12Z',
  })

  // c_007: Nimbus Docs pricing (CONTRADICTED: $9 vs $14)
  const snap007a = registerMockSnapshot(
    's_007a',
    'https://nimbusdocs.example.com/pricing',
    'pricing',
    'Team Plan: $9 per user / month billed monthly',
    'Nimbus Docs Pricing\nFree - 3 active notebooks\n',
    '\nIncludes collaborative workspace tools.',
  )
  const snap007b = registerMockSnapshot(
    's_007b',
    'https://nimbusdocs.example.com/terms',
    'docs',
    'Team tier subscriptions are billed at $14 per user / month on standard contracts',
    'Nimbus Docs Subscription Terms & Conditions\nSection 4: Pricing Schedule\n',
    '\nMinimum annual volume commitment applies.',
  )
  mockClaims.set('c_007', {
    id: 'c_007',
    product_id: 'p_nim',
    dimension: 'pricing',
    statement: 'Nimbus Docs Team tier pricing is $9 per user per month.',
    data: { tier: 'Team', price: 9, currency: 'USD', conflicting_price: 14 },
    evidence: [
      {
        id: 'e_007a',
        quote: 'Team Plan: $9 per user / month billed monthly',
        source_url: 'https://nimbusdocs.example.com/pricing',
        source_type: 'pricing',
        snapshot_id: snap007a.snapshotId,
        char_start: snap007a.char_start,
        char_end: snap007a.char_end,
        captured_at: '2026-10-31T10:00:14Z',
      },
      {
        id: 'e_007b',
        quote: 'Team tier subscriptions are billed at $14 per user / month on standard contracts',
        source_url: 'https://nimbusdocs.example.com/terms',
        source_type: 'docs',
        snapshot_id: snap007b.snapshotId,
        char_start: snap007b.char_start,
        char_end: snap007b.char_end,
        captured_at: '2026-10-31T10:00:14Z',
      },
    ],
    verification: {
      status: 'contradicted',
      confidence: 0.4,
      reason: 'Public marketing page states $9/user/mo, but current master subscription terms state $14/user/mo.',
    },
    first_seen_at: '2026-10-25T11:00:00Z',
    last_seen_at: '2026-10-31T10:00:14Z',
  })

  // c_008: Nimbus Docs features (UNVERIFIED: single source)
  const snap008a = registerMockSnapshot(
    's_008a',
    'https://nimbusdocs.example.com/preview',
    'product_page',
    'Experience next-generation real-time collaboration and AI search inside Nimbus Docs.',
    'Nimbus Docs 2.0 Coming Soon\n',
    '\nSign up for early beta access.',
  )
  mockClaims.set('c_008', {
    id: 'c_008',
    product_id: 'p_nim',
    dimension: 'features',
    statement: 'Nimbus Docs includes real-time collaboration and AI search features.',
    data: { real_time_collab: true, ai_search: true },
    evidence: [
      {
        id: 'e_008a',
        quote: 'Experience next-generation real-time collaboration and AI search inside Nimbus Docs.',
        source_url: 'https://nimbusdocs.example.com/preview',
        source_type: 'product_page',
        snapshot_id: snap008a.snapshotId,
        char_start: snap008a.char_start,
        char_end: snap008a.char_end,
        captured_at: '2026-10-31T10:00:14Z',
      },
    ],
    verification: {
      status: 'unverified',
      confidence: 0.6,
      reason: 'Single source marketing preview; unverified in official documentation or release notes.',
    },
    first_seen_at: '2026-10-25T11:00:00Z',
    last_seen_at: '2026-10-31T10:00:14Z',
  })
}

initMockFixtures()

function getSynthesizedClaim(claimId: string): Claim | null {
  if (mockClaims.has(claimId)) {
    return mockClaims.get(claimId)!
  }

  // Fallback synthesis for any dynamically added claim ID
  const cell = S.matrix.cells.find((c) => c.claim_ids.includes(claimId))
  if (!cell) return null

  const product = S.analysis.products.find((p) => p.id === cell.product_id)
  const productName = product?.name ?? 'Product'
  const productUrl = product?.url ?? 'https://example.com'
  const snapId = `s_syn_${claimId}`
  const quote = `${productName} ${cell.dimension}: ${cell.value}`
  const snap = registerMockSnapshot(snapId, `${productUrl}/overview`, 'product_page', quote)

  const isContradicted = cell.verification_status === 'contradicted'
  const isUnverified = cell.verification_status === 'unverified'

  const evidence: Evidence[] = [
    {
      id: `e_${claimId}_a`,
      quote,
      source_url: `${productUrl}/overview`,
      source_type: 'product_page',
      snapshot_id: snap.snapshotId,
      char_start: snap.char_start,
      char_end: snap.char_end,
      captured_at: nowIso(),
    },
  ]

  if (isContradicted) {
    const snapContr = registerMockSnapshot(
      `s_syn_${claimId}_contr`,
      `${productUrl}/terms`,
      'docs',
      `Alternative specifications contradict: ${cell.value}`,
    )
    evidence.push({
      id: `e_${claimId}_b`,
      quote: `Alternative specifications contradict: ${cell.value}`,
      source_url: `${productUrl}/terms`,
      source_type: 'docs',
      snapshot_id: snapContr.snapshotId,
      char_start: snapContr.char_start,
      char_end: snapContr.char_end,
      captured_at: nowIso(),
    })
  }

  const claim: Claim = {
    id: claimId,
    product_id: cell.product_id,
    dimension: cell.dimension,
    statement: `${productName} ${cell.dimension} statement based on ${cell.value}.`,
    evidence,
    verification: {
      status: cell.verification_status === 'missing' ? 'unverified' : cell.verification_status,
      confidence: cell.confidence,
      reason: isContradicted
        ? 'Multiple sources disagree on pricing/terms.'
        : isUnverified
          ? 'Single source mention; lacks corroborating documentation.'
          : 'Quote found verbatim in live snapshot.',
    },
    first_seen_at: nowIso(),
    last_seen_at: nowIso(),
  }

  mockClaims.set(claimId, claim)
  return claim
}

const EXTENDED_MOCK_REPORT_MARKDOWN = `# Competitive Intelligence Report

## Summary
Rivalo cut Pro pricing to $8 [claim:c_002]. We lead on offline mode [claim:c_003]. Nimbus Docs pricing data shows significant internal contradictions [claim:c_007].

## Pricing Analysis
Acme Notes is positioned at $10 per user per month on the Pro plan [claim:c_001]. Rivalo recently reduced their Pro pricing from $12 to $8 per user per month [claim:c_002], establishing a $2/user/mo price disadvantage for us. Nimbus Docs claims a Team tier at $9/user/month on their marketing page, but standard contract terms cite $14/user/month [claim:c_007].

## Features & Differentiators
Acme Notes retains a crucial technical differentiator with local offline mode and encrypted workspace sync [claim:c_003]. Rivalo offers parity on enterprise SAML SSO and AI search [claim:c_004]. Meanwhile, Nimbus Docs advertises real-time collaboration and AI search [claim:c_008], though this capability currently lacks validation in public documentation.

## Release Cadence
Acme Notes ships updates on a monthly release cycle [claim:c_005]. Rivalo maintains an accelerated biweekly shipping cadence [claim:c_006], publishing updates every alternating Wednesday.

## Data Gaps & Recommendations
Nimbus Docs lacks a public changelog, preventing cadence verification. We recommend leading commercial conversations with our offline security architecture and continuing weekly monitoring of Rivalo's pricing moves.`

export const mockApi: ApiClient = {
  async health() {
    await delay(150)
    return clone(S.health)
  },

  async listAnalyses() {
    await delay(300)
    return [...runs.values()]
      .map((r) => clone(r.analysis))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  },

  async createAnalysis(body: AnalysisCreate) {
    await delay(START_DELAY_MS)
    const products: Product[] = [
      { id: 'p_our', name: body.our_product.name, role: 'ours', url: body.our_product.url },
      ...body.competitors.slice(0, COMPETITOR_IDS.length).map((c, i): Product => ({
        id: COMPETITOR_IDS[i] ?? `p_c${i + 3}`, name: c.name, role: 'competitor', url: c.url,
      })),
    ]
    const analysis: Analysis = {
      id: `an_${Date.now().toString(36)}`,
      status: 'queued',
      run_number: 1,
      created_at: nowIso(),
      completed_at: null,
      products,
      dimensions: body.dimensions?.length ? body.dimensions : ['pricing', 'features', 'integrations', 'limits', 'release_cadence'],
      stats: scaledStats(0),
    }
    const run: Run = { analysis, emitted: [], listeners: new Set(), timer: null, finished: null }
    runs.set(analysis.id, run)
    setTimeout(() => startRun(run), 500) // queued -> running shortly after the 202
    return clone(analysis)
  },

  async getAnalysis(id) {
    await delay(120)
    return clone(getRun(id).analysis)
  },

  async rerunAnalysis(id) {
    await delay(400)
    const run = getRun(id)
    run.analysis = { ...run.analysis, status: 'queued', run_number: (run.analysis.run_number ?? 1) + 1 }
    setTimeout(() => startRun(run), 500)
    return clone(run.analysis)
  },

  async getMatrix(id): Promise<Matrix> {
    await delay(350)
    const { analysis, finished } = getRun(id)
    const cells: MatrixCell[] = []
    if (finished) {
      for (const p of analysis.products) {
        for (const d of analysis.dimensions) {
          const hit = S.matrix.cells.find((c) => c.product_id === p.id && c.dimension === d)
          cells.push(hit ? clone(hit) : missingCell(p.id, d))
        }
      }
    }
    return { analysis_id: id, products: clone(analysis.products), dimensions: [...analysis.dimensions], cells }
  },

  async getChanges(id, query: ChangesQuery = {}) {
    await delay(300)
    const { analysis, finished } = getRun(id)
    if (!finished || !analysis.products.some((p) => p.id === 'p_riv')) return []
    return clone(S.changes)
      .filter((c) => (!query.product_id || c.product_id === query.product_id) && (!query.severity || c.severity === query.severity))
      .sort((a, b) => b.detected_at.localeCompare(a.detected_at))
  },

  async getReport(id) {
    await delay(400)
    if (!getRun(id).finished) throw new ApiError(404, 'Report not ready yet')
    return { ...clone(S.report), analysis_id: id, markdown: EXTENDED_MOCK_REPORT_MARKDOWN }
  },

  async getReportMarkdown(id) {
    await delay(200)
    if (!getRun(id).finished) throw new ApiError(404, 'Report not ready yet')
    return EXTENDED_MOCK_REPORT_MARKDOWN
  },

  async chat(id, body) {
    await delay(900)
    getRun(id)

    // Forced error simulation for testing retry
    if (/force_error|trigger_error/i.test(body.question)) {
      throw new ApiError(500, 'Simulated model inference failure')
    }

    // 1. Pricing / undercut / cheap
    if (/pric|undercut|cheap|cost|\$/i.test(body.question)) {
      return clone(S.chat_response)
    }

    // 2. Release cadence / ships fastest
    if (/cadence|fastest|ship|release/i.test(body.question)) {
      return {
        answer: 'Rivalo ships fastest with a biweekly release cycle [claim:c_006], whereas Acme Notes deploys platform updates on a monthly schedule [claim:c_005].',
        citations: [
          {
            claim_id: 'c_006',
            quote: 'Biweekly Releases: updates shipped every alternating Wednesday.',
            source_url: 'https://rivalo.example.com/changelog',
          },
          {
            claim_id: 'c_005',
            quote: 'Platform updates are deployed on the first Tuesday of each month.',
            source_url: 'https://acmenotes.example.com/changelog',
          },
        ],
        insufficient_evidence: false,
      }
    }

    // 3. Offline / lead / strength
    if (/offline|lead|strength|moat|advantage/i.test(body.question)) {
      return {
        answer: 'We lead on offline mode with encrypted local sync [claim:c_003], which is absent in competitor offerings. Rivalo matches us on AI workspace search and SAML SSO [claim:c_004].',
        citations: [
          {
            claim_id: 'c_003',
            quote: 'Offline mode with local sync, semantic AI search across notebooks, and enterprise SSO.',
            source_url: 'https://acmenotes.example.com/features',
          },
          {
            claim_id: 'c_004',
            quote: 'AI workspace search and enterprise SAML SSO included on Pro tiers.',
            source_url: 'https://rivalo.example.com/product',
          },
        ],
        insufficient_evidence: false,
      }
    }

    // 4. Contradictions / disagree / Nimbus
    if (/contradict|disagree|conflict|nimbus/i.test(body.question)) {
      return {
        answer: 'Nimbus Docs has conflicting pricing evidence [claim:c_007]. Their public marketing page lists $9/user/month, but contract terms specify $14/user/month.',
        citations: [
          {
            claim_id: 'c_007',
            quote: 'Team Plan: $9 per user / month billed monthly',
            source_url: 'https://nimbusdocs.example.com/pricing',
          },
        ],
        insufficient_evidence: false,
      }
    }

    // 5. Insufficient evidence fallback
    return {
      answer: 'I could not find verified claims that answer this question based on collected snapshots.',
      citations: [],
      insufficient_evidence: true,
    }
  },

  // =============================================================================
  // F3 Mock-only synthesized fixtures:
  // Every claim in the matrix, changes, report and chat citations resolves with
  // valid Claim and Snapshot models containing matching evidence quotes and offsets.
  // =============================================================================
  async getClaim(claimId) {
    await delay(250)
    if (claimId === S.claim.id) return clone(S.claim)
    const synthesized = getSynthesizedClaim(claimId)
    if (synthesized) return clone(synthesized)
    throw new ApiError(404, `Claim ${claimId} not found in mock data`)
  },

  async getSnapshot(snapshotId) {
    await delay(250)
    if (snapshotId === S.snapshot.id) return clone(S.snapshot)
    const snapshot = mockSnapshots.get(snapshotId)
    if (snapshot) return clone(snapshot)
    throw new ApiError(404, `Snapshot ${snapshotId} not found in mock data`)
  },

  openEventStream(analysisId, handlers) {
    const run = runs.get(analysisId)
    if (!run) {
      queueMicrotask(() => handlers.onError?.(false))
      return () => undefined
    }
    // Late subscribers receive full history first, then live events (matches the real contract).
    const history = [...run.emitted]
    queueMicrotask(() => {
      history.forEach((e) => handlers.onEvent(e))
      if (run.finished) handlers.onDone(run.finished)
      else run.listeners.add(handlers)
    })
    return () => run.listeners.delete(handlers)
  },
}
