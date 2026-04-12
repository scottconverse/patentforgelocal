FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Derive PostgreSQL schema from the canonical SQLite schema.
# schema.prisma is the single source of truth — the model definitions are
# provider-agnostic. Only the provider line differs between SQLite and PostgreSQL.
# This eliminates the schema drift bug that occurred when a separate
# schema.postgres.prisma had to be maintained by hand.
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma

RUN npx prisma generate
RUN npm run build
EXPOSE 3000

# db push syncs the schema directly on startup.
# This is the documented pre-v1.0 strategy — consistent across local dev, CI,
# and Docker. When the project stabilizes for production releases, this will
# migrate to `prisma migrate deploy` with PostgreSQL-native migration files.
# --accept-data-loss is intentionally NOT used: if schema changes would drop
# columns or tables, the push will fail and require explicit action.
CMD ["sh", "-c", "npx prisma db push && node --enable-source-maps dist/main"]
