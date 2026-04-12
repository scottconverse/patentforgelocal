import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    await this.ensureSchema();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Auto-create database tables on first run (SEA/installer mode).
   *
   * In development, `prisma db push` handles schema sync. In Docker,
   * the CMD runs `prisma db push` before starting. But in a Node SEA
   * binary (installer), there's no Prisma CLI available. This method
   * checks whether the schema exists and creates it if missing.
   *
   * The SQL is generated from `prisma migrate diff --from-empty --to-schema-datamodel`.
   * It must be regenerated whenever schema.prisma changes.
   */
  private async ensureSchema(): Promise<void> {
    try {
      // Quick check — if AppSettings table exists, schema is initialized
      await this.$queryRawUnsafe('SELECT 1 FROM "AppSettings" LIMIT 1');
      return; // Schema exists
    } catch {
      // Table doesn't exist — initialize schema
    }

    console.log('[Prisma] Database schema not found — initializing...');

    const statements = SCHEMA_SQL.split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      try {
        await this.$executeRawUnsafe(stmt);
      } catch (err) {
        // Ignore "already exists" errors in case of partial init
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('already exists')) {
          console.error(`[Prisma] Schema init error: ${msg}`);
          throw err;
        }
      }
    }

    console.log('[Prisma] Database schema initialized successfully.');
  }
}

/**
 * Full schema SQL for SQLite — generated from prisma/schema.prisma.
 * Regenerate with: npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
 */
const SCHEMA_SQL = `
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INTAKE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "InventionInput" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "problemSolved" TEXT NOT NULL DEFAULT '',
    "howItWorks" TEXT NOT NULL DEFAULT '',
    "aiComponents" TEXT NOT NULL DEFAULT '',
    "threeDPrintComponents" TEXT NOT NULL DEFAULT '',
    "whatIsNovel" TEXT NOT NULL DEFAULT '',
    "currentAlternatives" TEXT NOT NULL DEFAULT '',
    "whatIsBuilt" TEXT NOT NULL DEFAULT '',
    "whatToProtect" TEXT NOT NULL DEFAULT '',
    "additionalNotes" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "InventionInput_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "FeasibilityRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "finalReport" TEXT,
    CONSTRAINT "FeasibilityRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "FeasibilityStage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "feasibilityRunId" TEXT NOT NULL,
    "stageNumber" INTEGER NOT NULL,
    "stageName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "outputText" TEXT,
    "model" TEXT,
    "webSearchUsed" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "errorMessage" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCostUsd" REAL,
    CONSTRAINT "FeasibilityStage_feasibilityRunId_fkey" FOREIGN KEY ("feasibilityRunId") REFERENCES "FeasibilityRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "PriorArtSearch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "query" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "feasibilityRunId" TEXT,
    CONSTRAINT "PriorArtSearch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "PriorArtResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "searchId" TEXT NOT NULL,
    "patentNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "abstract" TEXT,
    "relevanceScore" REAL NOT NULL,
    "snippet" TEXT,
    "claimMapping" TEXT,
    "source" TEXT NOT NULL DEFAULT 'PatentsView',
    CONSTRAINT "PriorArtResult_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "PriorArtSearch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "ClaimDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "specLanguage" TEXT,
    "plannerStrategy" TEXT,
    "examinerFeedback" TEXT,
    "revisionNotes" TEXT,
    "estimatedCostUsd" REAL,
    CONSTRAINT "ClaimDraft_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "claimNumber" INTEGER NOT NULL,
    "claimType" TEXT NOT NULL,
    "scopeLevel" TEXT,
    "statutoryType" TEXT,
    "parentClaimNumber" INTEGER,
    "text" TEXT NOT NULL,
    "examinerNotes" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Claim_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ClaimDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "ComplianceCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "draftVersion" INTEGER NOT NULL,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "overallPass" BOOLEAN NOT NULL DEFAULT false,
    "estimatedCostUsd" REAL,
    CONSTRAINT "ComplianceCheck_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "ComplianceResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checkId" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "claimNumber" INTEGER,
    "detail" TEXT NOT NULL,
    "citation" TEXT,
    "suggestion" TEXT,
    CONSTRAINT "ComplianceResult_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "ComplianceCheck" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "PatentApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "title" TEXT,
    "abstract" TEXT,
    "background" TEXT,
    "summary" TEXT,
    "detailedDescription" TEXT,
    "claims" TEXT,
    "figureDescriptions" TEXT,
    "crossReferences" TEXT,
    "idsTable" TEXT,
    "estimatedCostUsd" REAL,
    "completedAt" DATETIME,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatentApplication_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "ProsecutionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventDate" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "documentUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProsecutionEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "PatentDetail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patentNumber" TEXT NOT NULL,
    "title" TEXT,
    "abstract" TEXT,
    "filingDate" TEXT,
    "grantDate" TEXT,
    "assignee" TEXT,
    "inventors" TEXT,
    "cpcClassifications" TEXT,
    "claimsText" TEXT,
    "claimCount" INTEGER,
    "patentType" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PatentFamily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patentNumber" TEXT NOT NULL,
    "members" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "OdpApiUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "queriesAttempted" INTEGER NOT NULL,
    "resultsFound" INTEGER NOT NULL,
    "hadRateLimit" BOOLEAN NOT NULL DEFAULT false,
    "hadError" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "calledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OdpApiUsage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "anthropicApiKey" TEXT NOT NULL DEFAULT '',
    "defaultModel" TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
    "researchModel" TEXT NOT NULL DEFAULT '',
    "maxTokens" INTEGER NOT NULL DEFAULT 32000,
    "interStageDelaySeconds" INTEGER NOT NULL DEFAULT 5,
    "exportPath" TEXT NOT NULL DEFAULT '',
    "autoExport" BOOLEAN NOT NULL DEFAULT true,
    "costCapUsd" REAL NOT NULL DEFAULT 5.00,
    "usptoApiKey" TEXT NOT NULL DEFAULT '',
    "encryptionSalt" TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX "InventionInput_projectId_key" ON "InventionInput"("projectId");
CREATE UNIQUE INDEX "PatentDetail_patentNumber_key" ON "PatentDetail"("patentNumber");
CREATE UNIQUE INDEX "PatentFamily_patentNumber_key" ON "PatentFamily"("patentNumber");
CREATE INDEX "OdpApiUsage_calledAt_idx" ON "OdpApiUsage"("calledAt");
`;
