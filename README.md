# SmartHome Platform

A polyglot monorepo for smart home management.

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v20.19.0+)
- [npm](https://www.npmjs.com/)
- [Python](https://www.python.org/)
- [Poetry](https://python-poetry.org/)
- [PostgreSQL/PostGIS](https://postgis.net/)

### Installation

```bash
# Clone the repository
git clone https://github.com/PomPerWoW/smarthome-platform.git
cd smarthome-platform

# Install dependencies
npm install
npm install -g turbo (if npm run dev is not working)

# Copy environment files
cp apps/frontend/.env.example apps/frontend/.env
cp apps/landing-page/.env.example apps/landing-page/.env
cp apps/scene-creator/.env.example apps/scene-creator/.env
cp apps/backend/.env.example apps/backend/.env

# Start database (Docker)
cd apps/backend && docker compose up --build -d && cd ../..

# Run all apps
npm run dev
```

## 📋 Available Commands

| Command                | Description                            |
| ---------------------- | -------------------------------------- |
| `npm run dev`          | Run all apps in parallel               |
| `npm run dev:frontend` | Run frontend only                      |
| `npm run dev:backend`  | Run backend (installs deps + migrates) |
| `npm run build`        | Build all apps                         |
| `npm run lint`         | Lint all apps                          |

### Backend-Specific Commands

```bash
npm run migrate --filter=@smarthome/backend
npm run makemigrations --filter=@smarthome/backend
```

## 🌐 Default Ports

| App           | Port | URL                    |
| ------------- | ---- | ---------------------- |
| Frontend      | 5173 | http://localhost:5173  |
| Landing Page  | 5174 | http://localhost:5174  |
| Scene Creator | 8081 | https://localhost:8081 |
| Backend       | 5500 | http://localhost:5500  |
| PostgreSQL    | 5432 | -                      |

## ⚡ Turborepo

This monorepo uses [Turborepo](https://turborepo.com/) for task orchestration.

### Direct Turbo Commands

```bash
# Make sure to install turbo first
npm install -g turbo

# Run all dev servers
turbo dev

# Run specific app
turbo dev --filter=@smarthome/frontend

# Run multiple apps
turbo dev --filter=@smarthome/frontend --filter=@smarthome/landing-page

# Exclude an app
turbo dev --filter='!@smarthome/backend'

# Build all
turbo build
```

### Task Dependencies

```
@smarthome/backend:
  install → migrate → dev

@smarthome/frontend, landing-page, scene-creator:
  install → dev
```

## 🐳 Docker

```bash
# Development
docker compose up -d

# Production
docker compose -f docker-compose.production.yaml up -d
```
