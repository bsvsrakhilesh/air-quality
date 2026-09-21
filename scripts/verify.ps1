$ErrorActionPreference = "Stop"

python -m ruff check backend
python -m pytest -q
npm --prefix frontend run lint
npm --prefix frontend run build
docker compose config --quiet

Write-Host "Axiom verification passed." -ForegroundColor Green
