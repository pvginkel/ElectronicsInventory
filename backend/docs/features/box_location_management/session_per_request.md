Let your services return ORM entities and convert them to response “schemas” at the API boundary. Use a per-request session, eager-load what you need, and have Pydantic (v2) turn ORM objects into JSON-safe DTOs.

Here’s the pattern that works well in Flask + SQLAlchemy:

### 1) Session lifecycle

Create one session per request and close it after the response. Don’t hand sessions around implicitly.

```python
# db.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

engine = create_engine(DB_URL, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)  # <- important
```

```python
# app.py
from flask import Flask, g
from db import SessionLocal

app = Flask(__name__)

@app.before_request
def open_session():
    g.db = SessionLocal()

@app.teardown_request
def close_session(exc):
    db = getattr(g, "db", None)
    if db:
        if exc: db.rollback()
        else:   db.commit()
        db.close()
```

* `expire_on_commit=False` prevents attributes from expiring when the transaction ends, so your ORM objects can still be read for serialization without “DetachedInstanceError”.
* Keep queries inside the request. Don’t keep ORM objects across requests.

### 2) Services return ORM objects (not ad-hoc DTOs)

Let repositories/services do the querying and return ORM models, with eager loading for relationships you know you’ll serialize.

```python
# services/user_service.py
from sqlalchemy import select
from sqlalchemy.orm import selectinload

def get_user(db, user_id: int):
    stmt = (
        select(User)
        .options(selectinload(User.roles))   # eager load if needed by the API
        .where(User.id == user_id)
    )
    return db.execute(stmt).scalar_one()
```

### 3) Convert to API DTOs at the boundary with Pydantic v2

Define “schema” models solely for I/O. Use `from_attributes=True` so Pydantic can read ORM attributes directly.

```python
# schemas.py (Pydantic v2)
from pydantic import BaseModel, ConfigDict

class RoleOut(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)

class UserOut(BaseModel):
    id: int
    email: str
    roles: list[RoleOut] = []
    model_config = ConfigDict(from_attributes=True)
```

```python
# routes.py
from flask import Blueprint, g, jsonify
from services.user_service import get_user
from schemas import UserOut

bp = Blueprint("users", __name__)

@bp.get("/users/<int:user_id>")
def read_user(user_id: int):
    user = get_user(g.db, user_id)
    return jsonify(UserOut.model_validate(user).model_dump())
```

This keeps:

* **ORM** for data access and relationships
* **Pydantic schemas** for HTTP I/O
* **Services** slim and focused on queries/business rules

### 4) For list pages or reports: project directly

When you don’t need full entities/relationships, query only the columns you need and return dicts; Pydantic can still help validate/shape.

```python
stmt = select(User.id, User.email, Role.name.label("role_name")).join(User.roles)
rows = g.db.execute(stmt).mappings().all()  # list[RowMapping]
```

Optionally validate with a lightweight schema:

```python
class UserRow(BaseModel):
    id: int
    email: str
    role_name: str
```

### 5) Alternatives (when you want stricter layering)

* **Domain entities + Repositories + Unit of Work**: map ORM → domain objects inside repositories; services return domain objects; API maps domain → DTO. Great for complex domains, but heavier than most Flask apps need.
* **SQLModel** (Pydantic+SQLA in one): nice for small/medium apps, but you still want schemas for I/O to decouple persistence from API.

### Common pitfalls to avoid

* Returning half-loaded ORM objects and closing the session → detached/expired attribute errors. Fix via eager loading and/or `expire_on_commit=False`.
* Building custom DTOs in services → duplication and drift. Centralize DTOs at the API layer.
* Leaking sessions into globals or long-lived background tasks.
\