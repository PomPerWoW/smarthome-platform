# SmartHome Platform

A polyglot monorepo for smart home management.

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh/)
- [Python](https://www.python.org/)
- [Poetry](https://python-poetry.org/)
- [PostgreSQL/PostGIS](https://postgis.net/)

### Installation

```bash
# Clone the repository
git clone https://github.com/PomPerWoW/smarthome-platform.git
cd smarthome-platform

# Install dependencies
bun install

# Copy environment files
cp apps/frontend/.env.example apps/frontend/.env
cp apps/landing-page/.env.example apps/landing-page/.env
cp apps/scene-creator/.env.example apps/scene-creator/.env
cp apps/backend/.env.example apps/backend/.env

# Start database (Docker)
cd apps/backend && docker compose up --build -d && cd ../..

# Clear database and build fresh
docker compose down -v && docker compose up --build -d

# Run all apps
bun run dev
```

## 📋 Available Commands

| Command                | Description                            |
| ---------------------- | -------------------------------------- |
| `bun run dev`          | Run all apps in parallel               |
| `bun run dev:frontend` | Run frontend only                      |
| `bun run dev:backend`  | Run backend (installs deps + migrates) |
| `bun run build`        | Build all apps                         |
| `bun run lint`         | Lint all apps                          |

### Backend-Specific Commands

```bash
bun run migrate --filter=@smarthome/backend
bun run makemigrations --filter=@smarthome/backend
```

## 🌐 Default Ports

| App           | Port | URL                    |
| ------------- | ---- | ---------------------- |
| Frontend      | 5173 | http://localhost:5173  |
| Landing Page  | 5174 | http://localhost:5174  |
| Scene Creator | 8081 | https://localhost:8081 |
| Backend       | 5500 | http://localhost:5500  |
| PostgreSQL    | 5432 | -                      |

## 🐳 Docker

```bash
# Development
docker compose up -d

# Production
docker compose -f docker-compose.production.yaml up -d
```
