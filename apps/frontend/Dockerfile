# Multi-stage build for frontend production
# Stage 1: Build the application
FROM node:22-alpine AS builder

WORKDIR /app

# Build-time env vars (Vite bakes VITE_* into the bundle)
ARG VITE_BACKEND_URL
ARG VITE_SCENE_CREATOR_URL
ARG VITE_HOST_IP

ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
ENV VITE_SCENE_CREATOR_URL=$VITE_SCENE_CREATOR_URL
ENV VITE_HOST_IP=$VITE_HOST_IP

# Copy package files (context is repo root)
COPY apps/frontend/package.json apps/frontend/package-lock.json* ./

# Install dependencies
RUN npm install

# Copy frontend source code
COPY apps/frontend/ .

# Copy shared model assets from packages/assets/models into public/models
RUN rm -f /app/public/models
COPY packages/assets/models/ /app/public/models/

# Build the application
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:stable-alpine

# Install curl for healthchecks
RUN apk add --no-cache curl

# Copy built files from builder into base path
RUN mkdir -p /usr/share/nginx/html/smarthome/home
COPY --from=builder /app/dist/ /usr/share/nginx/html/smarthome/home/

# Copy nginx configuration
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
