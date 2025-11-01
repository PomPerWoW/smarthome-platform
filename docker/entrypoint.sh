#!/usr/bin/env bash
set -e

# Wait for Postgres
echo "Waiting for Postgres at ${DB_HOST}:${DB_PORT}..."
until python - <<'PY'
import os, socket
s=socket.socket()
host=os.environ.get("DB_HOST","localhost")
port=int(os.environ.get("DB_PORT","5432"))
try:
    s.settimeout(2)
    s.connect((host,port))
    print("DB reachable")
except Exception as e:
    print("DB not ready:", e)
    raise
finally:
    s.close()
PY
do
  echo "Postgres not ready yet…"; sleep 2
done

# Run migrations
echo "Running migrations…"
python manage.py migrate --noinput

# Optionally create a superuser (idempotent)
if [ "${DJANGO_CREATE_SUPERUSER:-true}" = "true" ]; then
  echo "Ensuring admin superuser exists…"
  python - <<'PY'
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "app.settings")  # <-- load settings
import django
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()
u = os.environ.get("DJANGO_SUPERUSER_USERNAME","admin")
p = os.environ.get("DJANGO_SUPERUSER_PASSWORD","admin123")
e = os.environ.get("DJANGO_SUPERUSER_EMAIL","admin@smarthome.com")

if not User.objects.filter(username=u).exists():
    User.objects.create_superuser(u, e, p)
    print(f"Created superuser {u}")
else:
    print("Superuser already exists")
PY
fi

# Run the CMD from docker-compose (runserver in dev)
exec "$@"
