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
