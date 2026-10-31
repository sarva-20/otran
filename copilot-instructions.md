# Otran - Copilot Agent Instructions (backend)

Otran is an agentic competitive-intelligence system. Given our product and 1-4 competitors, agents collect public pages (product, pricing, docs, release notes), extract structured claims, verify each claim against saved evidence, diff against earlier snapshots, and produce a comparison matrix, change feed, report, and cited Q&A.

You build ONLY `backend/`. The frontend is built separately in another IDE. Never edit `frontend/`.

## Source of truth
- `contracts/openapi.yaml` defines every endpoint and schema. Implement it exactly (paths, field names, enums, status codes).
- `contracts/samples.json` holds sample payloads. Use them for tests and for the demo seed.
- If the contract seems wrong or incomplete, STOP and tell me what to change. Do not silently deviate.

## Stack
- Python 3.11+, FastAPI, Pydantic v2, Uvicorn
- SQLAlchemy 2.x + SQLite (file: `backend/data/otran.db`)
- httpx for fetching; selectolax or trafilatura for text cleaning; Playwright only as a fallback for JS-heavy pages
- LLM: provider abstraction (see below)
- tenacity for retries, pytest + pytest-asyncio for tests, ruff for lint
- SSE via `sse-starlette` (or a plain StreamingResponse)

## Folder layout
```
backend/
  app/
    main.py            # FastAPI app, CORS (http://localhost:5173), routers
    config.py          # pydantic-settings, reads .env
    db.py              # engine/session
    models/            # SQLAlchemy tables + Pydantic schemas (match contract)
    llm/               # base.py, gemini.py, ollama.py, router.py
    agents/            # orchestrator, discovery, collector, extractor, verifier, diff, analyst, qa
    services/          # event_bus, snapshot_store, report_builder
    api/               # routers: analyses, evidence, system
  tests/
  data/                # sqlite + cached snapshots (gitignored except seed)
  requirements.txt
  .env.example
```

## LLM provider rules
- One interface: `LLMClient.generate_json(prompt, schema: type[BaseModel], system: str | None) -> BaseModel`.
- Primary: Gemini via Google AI Studio free tier (`google-genai` SDK, JSON mode with response schema). Model comes from env `GEMINI_MODEL` (default `gemini-2.5-flash`; free-tier model availability changes, so check the current AI Studio docs).
- Fallback: local Ollama at `http://127.0.0.1:11434` (use 127.0.0.1, NOT localhost; localhost fails on this Mac due to IPv6). Model from env `OLLAMA_MODEL` (default `qwen2.5:7b-instruct`). Use Ollama's `format` field with the JSON schema.
- `router.py` tries Gemini first. On HTTP 429 / quota errors, retry with exponential backoff once or twice, then switch to Ollama for the rest of that run and emit a `warning` AgentEvent. `/health` reports the active provider.
- Every LLM output is validated with Pydantic. On validation failure, retry once with the error message appended, then fail that step gracefully (do not crash the run).
- Keep prompts small. Free tier has low request limits: batch per page (one extraction call per page, not per claim), and cache LLM results keyed by (content_hash, prompt_version).

## Non-negotiable invariants
1. **Evidence-first.** A Claim cannot exist without at least one Evidence containing an exact `quote` copied from a stored Snapshot, plus `char_start`/`char_end`.
2. **Verifier is deterministic first.** Check the quote exists in the snapshot text (whitespace-normalised, case-insensitive). If not found, mark `unverified` or drop it. Use the LLM only for semantic checks (does the quote actually support the statement; contradiction across sources).
3. **Never invent facts.** If a dimension has no data, matrix cell is `missing`. Never fill gaps with guesses.
4. **Q&A answers only from verified claims** and always cites claim ids. If evidence is insufficient, return `insufficient_evidence: true`.
5. **Snapshots are immutable.** Store cleaned text + SHA-256 hash + timestamp. Diffs compare latest vs previous snapshot per URL.
6. **Be a polite crawler.** Respect robots.txt, set a clear User-Agent, rate-limit per domain (>= 1 s), timeout 15 s, max 2 retries. Public pages only; no login, no paywall bypass.
7. **Everything the agents do emits an AgentEvent** (agent, step, level, message, optional product_id and data) to the event bus, which feeds the SSE endpoint. Late subscribers get history first.
8. **Demo safety.** If live fetching fails, fall back to cached snapshots in `backend/data/seed/`. Add env `OFFLINE_DEMO=true` to force this.

## Coding conventions
- Type hints everywhere, async for I/O, small functions, no global mutable state except the event bus and config.
- Agents are plain classes/functions with a single `run(...)` entry point and typed inputs/outputs, so they can be tested without the API.
- Errors in one product/source must not kill the whole analysis; record the failure as an event and continue.
- Config via env only. Never hardcode keys. Provide `.env.example`.
- Each module ships with tests (use `samples.json` and recorded HTML fixtures; no live network in tests).

## Workflow
We build module by module: M0 scaffold, M1 schemas, M2 discovery+collector, M3 extractor, M4 verifier, M5 diff, M6 analyst/report, M7 orchestrator+API+SSE, M8 Q&A, M9 demo seed.
For each module: (1) state a short plan, (2) implement, (3) add tests, (4) run tests and lint, (5) show a brief summary of what changed and how to run it. Do not start the next module until asked.

