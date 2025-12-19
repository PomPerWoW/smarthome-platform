FROM node:20-alpine

WORKDIR /app

ARG VITE_REFLEX_URL=http://localhost:3000

ENV VITE_REFLEX_URL=$VITE_REFLEX_URL

COPY package.json bun.lock* package-lock.json* yarn.lock* pnpm-lock.yaml* ./

RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]