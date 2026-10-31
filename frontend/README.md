# Otran Frontend

Continuous competitive intelligence web application built with React 18, TypeScript (strict), Vite, Tailwind CSS, TanStack Query, and React Router.

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- (Optional) Python 3.10+ with FastAPI backend running for real-API mode

### Installation & Run

```bash
cd frontend
npm install

# Start development server on http://localhost:5173
npm run dev
```

### Verification Scripts

```bash
# Typecheck with strict TypeScript
npm run typecheck

# Production build
npm run build

# Regenerate TypeScript schemas from OpenAPI spec
npm run gen:api
```

## Environment Flags

Configuration is read from `frontend/.env` (or environment variables):

| Variable | Default | Description |
|---|---|---|
| `VITE_USE_MOCK` | `true` | When `true`, uses mock fixtures and simulated SSE streaming. Set to `false` for live backend. |
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000` | Base URL for FastAPI backend endpoints and SSE stream. |

To switch to the live backend:
```bash
# Copy example configuration
cp .env.example .env

# Set VITE_USE_MOCK=false
echo "VITE_USE_MOCK=false\nVITE_API_BASE_URL=http://127.0.0.1:8000" > .env
```

## Project Structure

```
frontend/
├── src/
│   ├── api/                  # API layer
│   │   ├── client.ts         # Unified client interface (`api`)
│   │   ├── real.ts           # Fetch implementation for real backend
│   │   ├── mock.ts           # Deterministic fixture synthesizer & mock SSE
│   │   ├── sse.ts            # Native EventSource wrapper with auto-reconnect
│   │   ├── types.ts          # Schema aliases and UI type definitions
│   │   └── schema.d.ts       # Generated OpenAPI TypeScript definitions
│   ├── components/           # UI and domain components
│   │   ├── ui/               # Base primitives (button, badge, card, input, skeleton)
│   │   ├── ProductForm.tsx   # Setup & validation form with "+ extra URLs"
│   │   ├── AnalysisList.tsx  # Past analyses list with status chips & metrics
│   │   ├── AgentTrace.tsx    # Live pipeline trace feed (SSE)
│   │   ├── EventRow.tsx      # Individual agent log item
│   │   ├── ProgressHeader.tsx# Analysis status, agent badge, animated stats
│   │   ├── MatrixTable.tsx   # Competitive comparison matrix with sticky dimensions
│   │   ├── MatrixCell.tsx    # Interactive cell with advantage marker & status
│   │   ├── EvidenceDrawer.tsx# Global slide-over drawer with focus trap & Esc
│   │   ├── SnapshotViewer.tsx# Verbatim quote highlight with offset fallback
│   │   ├── ChangeTimeline.tsx# Newest-first change timeline with filter chips
│   │   ├── DiffBlock.tsx     # Mono inline word diff with gutter markers (+/-)
│   │   ├── ReportView.tsx    # Executive summary, gaps, battlecards & markdown
│   │   ├── CitationChip.tsx  # Interactive pill opening evidence drawer
│   │   ├── ChatPanel.tsx     # Cited chat thread with auto-scroll & suggested prompts
│   │   ├── ChatMessage.tsx   # User & assistant bubbles with cited sources
│   │   ├── InsufficientEvidence.tsx # Non-error fallback card
│   │   ├── ThemeToggle.tsx   # Dark/light theme switcher (persisted)
│   │   └── Layout.tsx        # Shell with header, skip link, and health pill
│   ├── hooks/                # Query and stream hooks
│   │   ├── useAnalyses.ts    # List & single analysis query hooks
│   │   ├── useCreateAnalysis.ts # Mutation starting analysis runs
│   │   ├── useEventStream.ts # SSE hook with deduplication and polling fallback
│   │   ├── useMatrix.ts      # Comparison matrix query
│   │   ├── useChanges.ts     # Filterable detected changes query
│   │   ├── useReport.ts      # Analyst report query
│   │   ├── useChat.ts        # Chat mutation with 10-turn history tracking
│   │   ├── useRerun.ts       # Analysis rerun mutation
│   │   └── useEvidenceDrawer.ts # URL search param sync (`?claim=...`)
│   ├── lib/                  # Utilities, formatters, and constants
│   │   ├── colors.ts         # Agent palette & badge configurations
│   │   ├── format.ts         # Relative dates, dimension humanization
│   │   ├── citations.ts      # Citation token parser (`[claim:c_xxx]`)
│   │   └── demo.ts           # Demo seed data (Acme Notes vs Rivalo & Nimbus)
│   ├── pages/
│   │   ├── Home.tsx          # Hero, ProductForm, and AnalysisList
│   │   └── Analysis.tsx      # Tabbed shell: Live, Matrix, Changes, Report, Chat
│   ├── App.tsx               # Route declarations & 404 handler
│   ├── main.tsx              # Application mount & QueryClient provider
│   └── index.css             # Tailwind tokens & dark mode theme values
```

## Mock vs Real API

### Mock Mode (`VITE_USE_MOCK=true`)
- Uses deterministic synthetic data backed by `contracts/samples.json`.
- Dynamic synthesis in `src/api/mock.ts` guarantees that every claim ID (`c_001` through `c_008`) and snapshot ID (`s_101` through `s_108`) resolves cleanly.
- Simulates realistic multi-agent execution order (`discovery` → `collector` → `extractor` → `verifier` → `analyst` → `qa`) with ~700 ms event pacing.
- Simulates reruns with incremented `run_number` and incremental change detection.

### Real API Mode (`VITE_USE_MOCK=false`)
- Directly issues standard HTTP requests to FastAPI endpoints.
- Event stream connects via native `EventSource` to `/api/analyses/{id}/events`.
- Reconnects automatically on connection interruptions; falls back to 3-second polling if disconnected.
- If backend is unreachable, gracefully presents non-crashing error banners with `Retry` across all views.

## Known Contract Mismatches

Comparison between `contracts/openapi.yaml` and the FastAPI backend (`backend/app`):

1. **`GET /health` required fields**:
   - Contract defines `required: [status, llm_provider, llm_model, uptime_seconds, version]`.
   - Backend returns `{ status, llm_provider, llm_model }` (omits `uptime_seconds` and `version`).
   - *Frontend solution*: Uses optional chaining (`data?.llm_provider`, `data?.llm_model`) without crashing.

2. **`Snapshot.source_type` type**:
   - Contract defines `source_type` as enum `SourceType` (`product_page`, `pricing`, `docs`, `release_notes`, `other`).
   - Backend allows arbitrary `string | null`.
   - *Frontend solution*: Defensive string fallbacks in `SnapshotViewer`.

3. **`Analysis.run_number` and `Analysis.stats` nullability**:
   - Contract defines `run_number` as integer and `stats` as an object.
   - Backend models declare both as optional (`int | None`, `AnalysisStats | None`).
   - *Frontend solution*: Defaults to `analysis.run_number ?? 1` and `analysis.stats ?? {}`.

4. **Nullable arrays in `Change`, `Battlecard`, and `Gap`**:
   - Contract specifies non-null string arrays for `claim_ids`, `strengths`, `weaknesses`, and `counter_points`.
   - Backend schema defines `list[str] | None = None`.
   - *Frontend solution*: All components coalesce nullable arrays with `?? []`.

5. **CORS default configuration**:
   - Backend `config.py` defaults `CORS_ORIGINS` to `http://localhost:5173`.
   - Accessing the frontend via `http://127.0.0.1:5173` will be blocked by CORS unless accessed as `localhost` or backend configuration is updated.

6. **Markdown report media type**:
   - `GET /api/analyses/{id}/report?format=md` returns `PlainTextResponse(..., media_type="text/markdown")`.
   - *Frontend solution*: API client parses with `parse: 'text'` for markdown downloads and copy actions.
