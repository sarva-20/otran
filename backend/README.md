# Otran backend

## Setup

From the repository root:

```bash
make install
cp backend/.env.example backend/.env
```

Set `GEMINI_API_KEY` in `backend/.env` when using Gemini. Ollama is used as the
fallback provider after Gemini rate-limit or quota errors.

## Run

```bash
make run
```

The API is available at <http://127.0.0.1:8000/health>.

## Demo runbook

1. Set `OFFLINE_DEMO=true` to disable network and use fictional seed pages.
2. Run `make demo-seed` to create a completed two-run analysis.
3. Run `make demo` to start the API with the seed data.
4. Ask: “Who undercut our Pro price?” to see a cited pricing answer.
5. Ask: “What changed recently?” to see Rivalo’s price and release changes.
6. Ask: “What do we know about Nimbus release cadence?” to see insufficient evidence.
7. The Matrix tab shows Nimbus’s contradicted pricing and missing cadence.
8. The Changes tab shows Rivalo’s high-severity price cut and new feature.
9. The Report tab contains only verified claims with inline citations.
10. No Gemini key or network access is required for the offline demo.
