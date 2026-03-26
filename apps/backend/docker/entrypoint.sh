#!/usr/bin/env bash
set -e

export GDAL_LIBRARY_PATH=$(find /usr/lib -name "libgdal.so" | grep -v "ogdi" | head -n 1)
export GEOS_LIBRARY_PATH=$(find /usr/lib -name "libgeos_c.so" | head -n 1)

# Wait for Postgres
echo "Waiting for postgres..."
while ! pg_isready -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER"; do
  sleep 1
done
echo "PostgreSQL started"

# Run migrations
echo "Running migrations…"
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput --clear

exec "$@"
