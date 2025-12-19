#!/usr/bin/env bash
set -e

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
