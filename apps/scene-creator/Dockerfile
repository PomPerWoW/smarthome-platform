FROM node:22-alpine AS builder

WORKDIR /app

ARG VITE_BACKEND_URL
ARG VITE_FRONTEND_URL
ARG VITE_DASHBOARD_URL
ARG VITE_HOST_IP

ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
ENV VITE_FRONTEND_URL=$VITE_FRONTEND_URL
ENV VITE_DASHBOARD_URL=$VITE_DASHBOARD_URL
ENV VITE_HOST_IP=$VITE_HOST_IP

COPY apps/scene-creator/package.json apps/scene-creator/bun.lock* apps/scene-creator/package-lock.json* apps/scene-creator/yarn.lock* apps/scene-creator/pnpm-lock.yaml* ./
COPY apps/scene-creator/tsconfig*.json ./
RUN npm install

COPY apps/scene-creator/ .

# Copy shared model assets (local symlink becomes dangling in Docker)
RUN rm -f /app/public/models
COPY packages/assets/models/ /app/public/models/

RUN chmod -R a+rX /app/public/models

RUN npm run build

RUN chmod -R a+rX /app/dist/models || true

FROM nginx:stable-alpine

RUN apk add --no-cache curl

# Copy built app into base path
RUN mkdir -p /usr/share/nginx/html/smarthome/xr
COPY --from=builder /app/dist/ /usr/share/nginx/html/smarthome/xr/

# Copy custom nginx configuration
COPY apps/scene-creator/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3003

CMD ["nginx", "-g", "daemon off;"]
