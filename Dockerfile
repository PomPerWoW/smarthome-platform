# ---- base image ----
FROM python:3.13-slim

# Fast fail & no pyc; install to system site-packages (no venv inside container)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    POETRY_VIRTUALENVS_CREATE=false \
    PIP_NO_CACHE_DIR=1 \
    PATH="/root/.local/bin:$PATH"

WORKDIR /app

# System deps (psycopg2 needs build tools + libpq)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl git && \
    rm -rf /var/lib/apt/lists/*

# ---- install Poetry ----
RUN curl -sSL https://install.python-poetry.org | python3 - \
    && poetry --version

# ---- copy dep files first (better layer caching) ----
COPY pyproject.toml poetry.lock* /app/

# ---- install deps (no dev) ----
RUN poetry install --no-interaction --no-ansi --only main --no-root

# ---- copy project ----
COPY . /app

# ---- expose & entrypoint ----
EXPOSE 8000
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
