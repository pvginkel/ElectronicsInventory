# Electronics Inventory Backend

Flask backend for hobby electronics parts inventory management system.

## Quick Start

1. Install dependencies:
```bash
poetry install
```

2. Copy environment configuration:
```bash
cp .env.example .env
```

3. Run development server:
```bash
python run.py
```

## Commands

- **Development server**: `python run.py`
- **Run tests**: `poetry run pytest`
- **Code formatting**: `poetry run ruff format .`
- **Linting**: `poetry run ruff check .`
- **Type checking**: `poetry run mypy .`
- **Database migrations**: `poetry run alembic upgrade head`

## API Documentation

OpenAPI documentation is available at `/docs` when the server is running.