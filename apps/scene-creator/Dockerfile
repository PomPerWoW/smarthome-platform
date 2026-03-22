FROM node:21-alpine AS builder

WORKDIR /app

COPY package.json bun.lock* package-lock.json* yarn.lock* pnpm-lock.yaml* ./
COPY tsconfig*.json ./
RUN npm install

COPY . .

RUN npm run build

FROM nginx:stable-alpine

# Copy built app
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8081

CMD ["nginx", "-g", "daemon off;"]
