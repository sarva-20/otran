# Otran frontend

React 18 + Vite + TS (strict) + Tailwind + TanStack Query + React Router.

```bash
npm install
npm run gen:api   # regenerate src/api/schema.d.ts from ../contracts/openapi.yaml
npm run dev       # http://localhost:5173
npm run typecheck
```

Expected layout: `otran/frontend` next to `otran/contracts` (openapi.yaml, samples.json).

## Mock vs real API
Copy `.env.example` to `.env`.
- `VITE_USE_MOCK=true` (default): serves `samples.json`, 2 s start delay, SSE simulated at ~700 ms/event.
- `VITE_USE_MOCK=false`: calls `VITE_API_BASE_URL` (default `http://127.0.0.1:8000`).

All data access goes through `src/api/client.ts`.
