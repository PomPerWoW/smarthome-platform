FROM node:22-alpine AS builder

WORKDIR /app

COPY apps/scene-creator/package.json apps/scene-creator/bun.lock* apps/scene-creator/package-lock.json* apps/scene-creator/yarn.lock* apps/scene-creator/pnpm-lock.yaml* ./
COPY apps/scene-creator/tsconfig*.json ./
RUN npm install

COPY apps/scene-creator/ .

# Copy shared model assets (local symlink becomes dangling in Docker)
RUN rm -f /app/public/models
COPY packages/assets/models/ /app/public/models/

RUN npm run build

FROM nginx:stable-alpine

# Copy built app into base path
RUN mkdir -p /usr/share/nginx/html/smarthome/xr
COPY --from=builder /app/dist/ /usr/share/nginx/html/smarthome/xr/

# Copy custom nginx configuration
COPY apps/scene-creator/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8081

CMD ["nginx", "-g", "daemon off;"]
