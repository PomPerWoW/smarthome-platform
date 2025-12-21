# ---- base image ----
FROM python:3.13-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    unzip \
    git \
    gdal-bin \
    libproj-dev \
    libgdal-dev \
    libgeos-dev \
    proj-bin \
    proj-data \
    python3-gdal \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1
ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal
ENV GDAL_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu/libgdal.so

RUN pip install poetry

RUN poetry config virtualenvs.create false

# Increase timeout for downloading packages
RUN poetry config installer.max-workers 10
ENV PIP_DEFAULT_TIMEOUT=100

COPY pyproject.toml poetry.lock ./

RUN poetry install --no-interaction --no-ansi --no-root

COPY . /app

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5500

ENTRYPOINT ["/entrypoint.sh"]

CMD ["gunicorn", "app.asgi:application", "-k", "uvicorn.workers.UvicornWorker", "-b", "0.0.0.0:5500", "-w", "2"]
