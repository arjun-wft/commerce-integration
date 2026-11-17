FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/package.json
RUN npm ci

COPY apps/backend ./apps/backend

EXPOSE 9000

CMD ["npm", "run", "dev", "--workspace=@dtc/backend"]
