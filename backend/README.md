# Electronics Inventory Backend

```
 ╔╗  ╦ ╦ ╦ ╦   ╔╦╗      ╦ ╦ ╦ ╔╦╗ ╦ ╦
 ╠╩╗ ║ ║ ║ ║    ║       ║║║ ║  ║  ╠═╣
 ╚═╝ ╚═╝ ╩ ╩═╝  ╩       ╚╩╝ ╩  ╩  ╩ ╩
 
  ██████╗ ██╗       █████╗  ██╗   ██╗ ██████╗  ███████╗
 ██╔════╝ ██║      ██╔══██╗ ██║   ██║ ██╔══██╗ ██╔════╝
 ██║      ██║      ███████║ ██║   ██║ ██║  ██║ █████╗  
 ██║      ██║      ██╔══██║ ██║   ██║ ██║  ██║ ██╔══╝  
 ╚██████╗ ███████╗ ██║  ██║ ╚██████╔╝ ██████╔╝ ███████╗
  ╚═════╝ ╚══════╝ ╚═╝  ╚═╝  ╚═════╝  ╚═════╝  ╚══════╝

  ██████╗  ██████╗  ██████╗  ███████╗
 ██╔════╝ ██╔═══██╗ ██╔══██╗ ██╔════╝
 ██║      ██║   ██║ ██║  ██║ █████╗  
 ██║      ██║   ██║ ██║  ██║ ██╔══╝  
 ╚██████╗ ╚██████╔╝ ██████╔╝ ███████╗
  ╚═════╝  ╚═════╝  ╚═════╝  ╚══════╝
```

🔧 **Built entirely using [Claude Code](https://claude.ai/code)** - Anthropic's AI-powered development environment

## Project Overview

A **hobby electronics parts inventory system** designed to help individual makers track what they have, where it lives, and how to get more. This Flask backend provides a comprehensive API for managing electronic components with smart organization features, AI-powered part analysis, and document management.

**Target Audience**: Individual hobbyists managing personal electronics collections  
**Key Benefits**: 
- 4-character unique part IDs for easy labeling
- Smart location suggestions and reorganization plans  
- AI-assisted part categorization and datasheet discovery
- Comprehensive document storage and management
- Real-time inventory tracking across multiple locations

## Features

See [docs/features.md](docs/features.md) for detailed implementation status across all system capabilities including:
- Core inventory management and part tracking
- Document attachment system with S3 storage
- AI integration for auto-tagging and analysis
- Background job processing with progress tracking
- Smart location suggestions and reorganization

## Architecture Overview

Modern Flask backend with layered architecture following clean separation of concerns:

```
app/
├── api/          # HTTP endpoints (Flask blueprints)
├── services/     # Business logic layer with dependency injection
├── models/       # SQLAlchemy database models
├── schemas/      # Pydantic request/response validation
└── utils/        # Shared utilities and error handling
```

**Design Principles**:
- Instance-based services with dependency injection
- Comprehensive error handling with typed exceptions
- API-first design with OpenAPI documentation
- Fail-fast philosophy for immediate error feedback

## Getting Started

### Prerequisites
- Python 3.12+
- PostgreSQL database
- Poetry for dependency management
- S3-compatible storage (Ceph/MinIO) for document storage

### Development Setup

1. **Install dependencies**:
```bash
poetry install
```

2. **Environment configuration**:
```bash
cp .env.example .env
# Edit .env with your database and S3 settings
```

3. **Database setup**:
```bash
# Initialize database and load type definitions
poetry run python -m app.cli upgrade-db

# Optional: Load realistic test data for development
poetry run python -m app.cli load-test-data --yes-i-am-sure
```

4. **Run development server**:
```bash
python run.py
```

The API will be available at `http://localhost:5000` with interactive documentation at `/docs`.

## API Documentation

**OpenAPI Documentation**: Available at `/docs` when server is running  
**Auto-generated**: Uses Spectree for comprehensive API documentation  
**Validation**: All requests/responses validated with Pydantic v2 schemas

Key API endpoints:
- `/api/parts` - Part management and inventory operations
- `/api/boxes` - Storage box configuration and location management  
- `/api/inventory` - Quantity tracking and location assignments
- `/api/documents` - File upload and document management
- `/api/ai/parts` - AI-powered part analysis and suggestions

## Technology Stack

**Core Framework**: Flask 3.0 with modern Python patterns  
**Database**: PostgreSQL with SQLAlchemy ORM  
**Validation**: Pydantic v2 for request/response schemas  
**Storage**: S3-compatible object storage for documents  
**AI Integration**: OpenAI API for part analysis and auto-tagging  
**Testing**: pytest with comprehensive service and API coverage  
**Code Quality**: Ruff for linting, MyPy for type checking

**Key Dependencies**:
- `dependency-injector` - Service container and dependency injection
- `alembic` - Database migrations
- `spectree` - OpenAPI documentation generation
- `boto3` - S3 storage operations
- `openai` - AI part analysis capabilities

## Development Workflow

### Code Quality Standards
```bash
poetry run ruff check .      # Linting
poetry run mypy .           # Type checking  
poetry run pytest          # Full test suite
```

### Database Operations
```bash
# Create new migration
poetry run alembic revision --autogenerate -m "Description"

# Apply migrations
poetry run python -m app.cli upgrade-db

# Load test data (development only)
poetry run python -m app.cli load-test-data --yes-i-am-sure
```

### Testing Requirements
**Definition of Done**: Every feature requires comprehensive tests covering:
- ✅ All service methods with success and error paths
- ✅ API endpoints with request/response validation
- ✅ Database constraints and relationships
- ✅ Edge cases and boundary conditions

## Contributing

This project follows strict code organization patterns and testing requirements as defined in [AGENTS.md](AGENTS.md).

**Pull Request Process**:
1. Fork the repository and create a feature branch
2. Follow established architecture patterns (API → Service → Model layers)
3. Write comprehensive tests for all new functionality
4. Ensure all code quality checks pass
5. Submit PR with clear description of changes

**Code Standards**:
- Use dependency injection for service dependencies
- Follow typed exception handling patterns
- Maintain API-first design with proper schema validation
- Include thorough error handling with context

## Research Project Notice

⚠️ **Experimental Software**: This is a research and development project for exploring modern electronics inventory management approaches. While functional and well-tested, it's designed for individual hobbyist use and may not be suitable for production enterprise environments.

**Focus Areas**:
- Single-user hobby electronics management patterns
- AI-assisted part organization and documentation
- Smart location suggestion algorithms  
- Modern Flask architecture with dependency injection

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**🚀 Developed with Claude Code** - Showcasing AI-assisted software development capabilities