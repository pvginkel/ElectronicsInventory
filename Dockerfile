FROM pypy:slim AS build

ENV POETRY_HOME=/opt/poetry
ENV POETRY_VIRTUALENVS_IN_PROJECT=1
ENV POETRY_VIRTUALENVS_CREATE=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# system deps only if you need to compile wheels; many projects don't
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      curl \
      ca-certificates \
      build-essential \
      libffi-dev libssl-dev pkg-config \
      patch \
      zlib1g-dev libjpeg-dev libpng-dev \
      libpq-dev libwebp-dev \
   && rm -rf /var/lib/apt/lists/*

RUN pip install poetry

WORKDIR /app

# --- Reproduce the environment ---
COPY pyproject.toml poetry.lock /app/
COPY patches /app/patches

# Remove jiter from lock file - it has no PyPy wheels, but openai only uses
# from_json which pydantic_core also provides.
# See: https://github.com/openai/openai-python/issues/1616
RUN sed -i '/^name = "jiter"/,/^\[\[package\]\]/d' poetry.lock && \
    sed -i '/^jiter = /d' poetry.lock

# Install project deps into .venv using PyPy
RUN poetry install --no-root --no-interaction --no-ansi

# Patch openai to use pydantic_core.from_json instead of jiter.from_json
RUN patch -p1 -d /app/.venv/lib/pypy3.11/site-packages/openai < patches/openai-replace-jiter.patch

# copy your source (no re-resolution needed)
COPY *.py /app
COPY alembic.ini /app
COPY app /app/app
COPY alembic /app/alembic

# Now let's build the runtime image from the builder.
#   We'll just copy the env and the PATH reference.
FROM pypy:slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends tini netcat-openbsd libmagic1 libpq5 libjpeg62-turbo libpng16-16t64 libwebp7 libwebpmux3 libwebpdemux2 && \
    rm -rf /var/lib/apt/lists/*

EXPOSE 5000

WORKDIR /app

COPY --from=build /app/.venv /app/.venv
COPY --from=build /app /app

ENV PATH="/app/.venv/bin:${PATH}" \
    DATA_PATH=/app/data \
    FLASK_ENV=production

ENTRYPOINT ["tini", "--"]

CMD ["python","run.py"]
