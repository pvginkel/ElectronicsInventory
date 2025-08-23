"""Flask extensions initialization."""

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import sessionmaker

# Initialize extensions
db = SQLAlchemy()

# SessionLocal for per-request sessions
SessionLocal: sessionmaker | None = None
