# ---- base image ----
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    POETRY_VIRTUALENVS_CREATE=false \
    PIP_NO_CACHE_DIR=1 \
    PATH="/root/.local/bin:$PATH"

WORKDIR /app

# --- add GIS libs (GDAL/GEOS/PROJ) + postgres client ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl git \
    gdal-bin libgdal-dev libgeos-dev proj-bin proj-data postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Help Django find the shared libs (paths are correct on Debian slim)
ENV GDAL_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu/libgdal.so \
    GEOS_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu/libgeos_c.so \
    PROJ_LIB=/usr/share/proj

# ---- install Poetry ----
RUN curl -sSL https://install.python-poetry.org | python3 - && poetry --version

# ---- deps ----
COPY pyproject.toml poetry.lock* /app/
RUN poetry install --no-interaction --no-ansi --only main --no-root

# ---- app ----
COPY . /app

EXPOSE 8000
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
