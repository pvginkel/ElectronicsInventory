# Basic Repository Setup - Technical Plan

## Brief Description

Set up the basic Flask backend repository structure with Core dependencies as specified in the technical design. This includes Python 3.12, Flask 3.x, SQLAlchemy 2.x with Alembic, psycopg 3, Pydantic v2 with pydantic-settings, Spectree for OpenAPI, flask-cors, Poetry for dependency management, and development tooling (ruff, mypy, pytest).

## Files to Create

### Project Configuration
- `pyproject.toml` - Poetry configuration with core dependencies and development tools
- `alembic.ini` - Alembic configuration for database migrations
- `alembic/` directory structure with initial migration scripts
- `.env.example` - Template for environment variables
- `mypy.ini` or `pyproject.toml` mypy configuration - Strict mypy configuration
- `.gitignore` - Python/Flask specific gitignore

### Application Structure
- `app/` - Main application package
- `app/__init__.py` - Flask application factory
- `app/config.py` - Pydantic settings configuration
- `app/models/` - SQLAlchemy models package
- `app/models/__init__.py` - Models package init
- `app/schemas/` - Pydantic request/response schemas package  
- `app/schemas/__init__.py` - Schemas package init
- `app/api/` - API blueprints package
- `app/api/__init__.py` - API package init
- `app/database.py` - Database connection and session management
- `app/extensions.py` - Flask extensions initialization

### Entry Points
- `main.py` or `wsgi.py` - Application entry point for production
- `run.py` - Development server entry point

### Testing Structure
- `tests/` - Test package
- `tests/__init__.py` - Tests package init
- `tests/conftest.py` - Pytest configuration and fixtures
- `tests/test_config.py` - Basic configuration tests

## Dependencies to Include

### Core Runtime Dependencies
- `flask` (3.x) - Web framework
- `sqlalchemy` (2.x) - ORM with typed annotations support
- `alembic` - Database migrations
- `psycopg` (3.x) - PostgreSQL driver  
- `pydantic` (v2) - Data validation and settings
- `pydantic-settings` - Settings management
- `spectree` - OpenAPI documentation generation
- `flask-cors` - CORS handling
- `waitress` - WSGI server for production

### Development Dependencies
- `ruff` - Linting, formatting, import sorting
- `mypy` - Static type checking
- `sqlalchemy2-stubs` - SQLAlchemy type stubs for mypy
- `pytest` - Testing framework
- `pytest-cov` - Coverage reporting
- `types-flask` - Flask type stubs

## Implementation Steps

### 1. Poetry Project Initialization
- Initialize Poetry project with `pyproject.toml`
- Configure project metadata, dependencies, and build system
- Set up development dependencies and tool configurations for ruff, mypy, pytest

### 2. Application Factory Setup
- Create Flask application factory in `app/__init__.py`
- Configure Spectree for OpenAPI documentation
- Set up CORS with flask-cors
- Initialize database connection

### 3. Configuration Management
- Create Pydantic settings class in `app/config.py`
- Support for environment-based configuration
- Database URL, debug mode, CORS origins configuration

### 4. Database Setup
- Configure SQLAlchemy 2.x with typed annotations
- Set up Alembic for migrations
- Create database session management
- Configure connection pooling and engine settings

### 5. Project Structure
- Create all package directories with proper `__init__.py` files
- Set up import structure for models, schemas, and API blueprints
- Organize code following Flask best practices with blueprints

### 6. Development Tooling Configuration
- Configure ruff for linting, formatting, and import sorting
- Set up mypy with strict mode and SQLAlchemy plugin
- Configure pytest with coverage reporting
- Create basic test structure and fixtures

### 7. Basic Health Check
- Implement `/healthz` endpoint for container health checks
- Basic application startup verification

## Environment Variables Required
- `DATABASE_URL` - PostgreSQL connection string
- `FLASK_ENV` - Environment (development/production)
- `DEBUG` - Debug mode flag
- `CORS_ORIGINS` - Allowed CORS origins

## Validation Steps
- Poetry install completes successfully
- Flask application starts without errors
- Mypy passes with no errors in strict mode
- Ruff linting and formatting passes
- Basic pytest runs successfully
- Database connection can be established
- OpenAPI docs are accessible at `/docs`
- Health check endpoint responds correctly