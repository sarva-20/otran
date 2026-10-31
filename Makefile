install:
	python3 -m venv .venv
	. .venv/bin/activate && python -m pip install -r backend/requirements.txt

run:
	. .venv/bin/activate && uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload

test:
	. .venv/bin/activate && pytest backend/tests -q

lint:
	. .venv/bin/activate && ruff check backend

demo:
	@echo "Starting Otran demo server..."
	@echo "curl -X POST http://127.0.0.1:8000/api/analyses -H 'content-type: application/json' -d '{\"our_product\":{\"name\":\"Our product\",\"url\":\"https://example.com\"},\"competitors\":[{\"name\":\"Competitor\",\"url\":\"https://example.org\"}]}'"
	. .venv/bin/activate && OFFLINE_DEMO=true uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
