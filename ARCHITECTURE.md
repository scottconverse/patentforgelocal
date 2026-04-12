# PatentForge — Architecture & Design Document

**Version**: 1.0.0
**Last Updated**: 2026-04-08
**Status**: Stable

---

## 1. Vision

PatentForge is an open-source, full-lifecycle patent platform that takes an inventor from "I have an idea" to "here's a draft patent application with prior art citations, compliance checks, and a filing strategy" — then tracks the patent through prosecution. It is the only open-source tool that covers the entire patent lifecycle in one platform.

---

## 2. System Architecture

![System Architecture](diagrams/architecture.png)
*Figure 1: PatentForge System Architecture (v1.0.0)*

### 2.1 Federated Service Model

PatentForge uses a **federated architecture**: a central backend orchestrates independent specialized services that each own one capability. Services communicate over HTTP/JSON and can be developed, deployed, scaled, and replaced independently.

The current service topology as of v1.0.0:

```
                          ┌──────────────────────────┐
                          │      React Frontend       │
                          │    (Vite + TypeScript)    │
                          │                           │
                          │  • Invention intake form  │
                          │  • Pipeline dashboard     │
                          │  • Live SSE streaming     │
                          │  • Prior art explorer     │
                          │  • Claim editor + tree    │
                          │  • Compliance report      │
                          │  • Application preview    │
                          │  • Patent family lookup   │
                          │                           │
                          │  Port: 8080               │
                          └────────────┬──────────────┘
                                       │ HTTP + SSE
                          ┌────────────▼──────────────┐
                          │                           │
                          │     CENTRAL BACKEND       │
                          │                           │
                          │  NestJS + Prisma + SQLite │
                          │  (PostgreSQL via Docker)  │
                          │                           │
                          │  • Project state machine  │
                          │  • Pipeline routing       │
                          │  • SSE proxy to frontend  │
                          │  • Prior art search       │
                          │    (USPTO ODP API)        │
                          │  • Export engine          │
                          │  • Service adapters       │
                          │                           │
                          │  Port: 3000               │
                          └──┬────────┬───────┬───────┘
                             │        │       │
           ┌─────────────────┘        │       └──────────────────┐
           ▼                          ▼                          ▼
 ┌──────────────────┐    ┌──────────────────────┐   ┌────────────────────┐
 │ FEASIBILITY SVC  │    │  CLAIM DRAFTER SVC   │   │  COMPLIANCE SVC    │
 │                  │    │                      │   │                    │
 │ 6-stage patent   │    │ Multi-agent pipeline │   │ 35 USC 112(a/b),   │
 │ analysis via     │    │ Planner → Writer →   │   │ MPEP 608, 35 USC   │
 │ Anthropic API    │    │ Examiner             │   │ 101 (Alice/Mayo)   │
 │                  │    │                      │   │ via LangGraph +    │
 │ TypeScript       │    │ FastAPI/Python        │   │ Anthropic API      │
 │ Port: 3001       │    │ SSE + sync endpoints │   │                    │
 └──────────────────┘    │ Port: 3002           │   │ FastAPI/Python     │
                         └──────────────────────┘   │ SSE + sync         │
                                                     │ Port: 3004         │
                                    ┌────────────────┴────────────────┐
                                    │      APPLICATION GENERATOR      │
                                    │                                 │
                                    │  5-agent LangGraph pipeline     │
                                    │  assembles USPTO-formatted      │
                                    │  patent application (37 CFR     │
                                    │  1.52): background, summary,    │
                                    │  detailed description, abstract,│
                                    │  figure descriptions, IDS       │
                                    │                                 │
                                    │  FastAPI/Python                 │
                                    │  SSE + sync endpoints           │
                                    │  Port: 3003                     │
                                    └─────────────────────────────────┘
```

**Notes on current implementation:**
- Prior art search is integrated into the central backend (not a separate service). It calls the USPTO Open Data Portal API directly.
- The compliance checker uses LangGraph agents with Anthropic API calls — not FAISS/BM25 vector search.
- All Python services (claim-drafter, compliance-checker, application-generator) expose both SSE streaming endpoints and synchronous fallback endpoints. The backend proxies SSE events to the frontend.

### 2.2 Central Backend (AutoBE-Generated)

The central backend is generated by AutoBE from a natural language requirements specification. It provides:

**Project State Machine**
```
INTAKE → FEASIBILITY → PRIOR_ART → DRAFTING → COMPLIANCE → APPLICATION → FILED

Rules:
  - PRIOR_ART requires FEASIBILITY.complete OR user explicitly skips
  - DRAFTING requires PRIOR_ART.complete (needs prior art to draft around)
  - COMPLIANCE requires DRAFTING.complete (needs claims to check)
  - APPLICATION requires COMPLIANCE.pass (won't generate app with 112 failures)
  - Any stage can be re-run → downstream stages marked STALE
  - User can override any gate with explicit acknowledgment
```

**Service Adapters** (manually written, injected into generated backend)
```
src/adapters/
  ├── feasibility.adapter.ts    → calls feasibility service (port 3001)
  ├── prior-art.adapter.ts      → calls USPTO ODP (integrated in backend)
  ├── drafting.adapter.ts       → calls claim drafter (port 3003)
  ├── compliance.adapter.ts     → calls MPEP RAG checker (port 3004)
  └── uspto.adapter.ts          → calls USPTO wrapper (port 3005)
```

**Unified Event Bus** (SSE to frontend)
```
GET /projects/:id/events

All events share a common envelope:
{
  "service": "feasibility" | "prior_art" | "drafting" | "compliance" | "uspto",
  "type": "stage_start" | "token" | "result" | "error" | "complete",
  "data": { ... service-specific payload ... },
  "timestamp": "2026-03-30T14:22:01Z"
}
```

**Document Versioning**
```
Every artifact is versioned per project:

Project #42
  ├── feasibility/v1/  (stages 1-6, final report)
  ├── feasibility/v2/  (re-run after inventor added details)
  ├── prior_art/v1/    (USPTO ODP results, snippets, claim mappings)
  ├── drafts/v1/       (initial claims from multi-agent drafter)
  ├── drafts/v2/       (revised after compliance feedback)
  ├── compliance/v1/   (112a/112b/MPEP results against drafts/v1)
  ├── compliance/v2/   (re-check against drafts/v2)
  └── application/v1/  (full patent application document)

When stage N is re-run, a new version is created.
All downstream stages are marked STALE (not deleted).
User can view any historical version.
```

**Technology Stack**:
- NestJS (TypeScript)
- Prisma ORM + PostgreSQL (production) / SQLite (development)
- SSE via @Sse() decorator for real-time streaming
- Generated by AutoBE with 100% compilation guarantee
- Type-safe SDK generated for frontend consumption

### 2.3 Database Schema (Prisma)

![Database Schema](diagrams/database-schema.png)
*Figure 2: Database Entity-Relationship Diagram (16 tables)*

```prisma
model Project {
  id              String            @id @default(uuid())
  title           String
  status          ProjectStatus     @default(INTAKE)
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  invention       InventionInput?
  feasibility     FeasibilityRun[]
  priorArtSearches PriorArtSearch[]
  claimDrafts     ClaimDraft[]
  complianceChecks ComplianceCheck[]
  applications    PatentApplication[]
  prosecutionEvents ProsecutionEvent[]
}

model InventionInput {
  id                    String   @id @default(uuid())
  projectId             String   @unique
  project               Project  @relation(fields: [projectId], references: [id])
  title                 String
  description           String
  problemSolved         String   @default("")
  howItWorks            String   @default("")
  aiComponents          String   @default("")
  threeDPrintComponents String   @default("")
  whatIsNovel           String   @default("")
  currentAlternatives   String   @default("")
  whatIsBuilt           String   @default("")
  whatToProtect         String   @default("")
  additionalNotes       String   @default("")
}

model FeasibilityRun {
  id          String        @id @default(uuid())
  projectId   String
  project     Project       @relation(fields: [projectId], references: [id])
  version     Int
  status      RunStatus     @default(PENDING)
  startedAt   DateTime?
  completedAt DateTime?
  finalReport String?
  stages      FeasibilityStage[]
}

model FeasibilityStage {
  id              String          @id @default(uuid())
  feasibilityRunId String
  feasibilityRun  FeasibilityRun @relation(fields: [feasibilityRunId], references: [id])
  stageNumber     Int
  stageName       String
  status          RunStatus       @default(PENDING)
  outputText      String?
  model           String?
  webSearchUsed   Boolean         @default(false)
  startedAt       DateTime?
  completedAt     DateTime?
  errorMessage    String?
}

model PriorArtSearch {
  id          String          @id @default(uuid())
  projectId   String
  project     Project         @relation(fields: [projectId], references: [id])
  version     Int
  status      RunStatus       @default(PENDING)
  query       String?
  startedAt   DateTime?
  completedAt DateTime?
  results     PriorArtResult[]
}

model PriorArtResult {
  id              String         @id @default(uuid())
  searchId        String
  search          PriorArtSearch @relation(fields: [searchId], references: [id])
  patentNumber    String
  title           String
  abstract        String?
  relevanceScore  Float
  snippet         String?
  claimMapping    String?
  source          String         @default("ODP")
}

model ClaimDraft {
  id          String    @id @default(uuid())
  projectId   String
  project     Project   @relation(fields: [projectId], references: [id])
  version     Int
  status      RunStatus @default(PENDING)
  startedAt   DateTime?
  completedAt DateTime?
  claims      Claim[]
  specLanguage String?
}

model Claim {
  id          String     @id @default(uuid())
  draftId     String
  draft       ClaimDraft @relation(fields: [draftId], references: [id])
  claimNumber Int
  claimType   ClaimType
  parentClaimNumber Int?
  text        String
}

model ComplianceCheck {
  id          String              @id @default(uuid())
  projectId   String
  project     Project             @relation(fields: [projectId], references: [id])
  version     Int
  status      RunStatus           @default(PENDING)
  draftVersion Int
  startedAt   DateTime?
  completedAt DateTime?
  results     ComplianceResult[]
  overallPass Boolean             @default(false)
}

model ComplianceResult {
  id          String          @id @default(uuid())
  checkId     String
  check       ComplianceCheck @relation(fields: [checkId], references: [id])
  rule        String
  status      CheckStatus
  claimNumber Int?
  detail      String
  citation    String?
  suggestion  String?
}

model PatentApplication {
  id          String    @id @default(uuid())
  projectId   String
  project     Project   @relation(fields: [projectId], references: [id])
  version     Int
  status      RunStatus @default(PENDING)
  title       String?
  abstract    String?
  background  String?
  summary     String?
  detailedDescription String?
  claims      String?
  figureDescriptions  String?
  createdAt   DateTime  @default(now())
}

model ProsecutionEvent {
  id          String    @id @default(uuid())
  projectId   String
  project     Project   @relation(fields: [projectId], references: [id])
  eventType   String
  eventDate   DateTime
  description String
  documentUrl String?
  createdAt   DateTime  @default(now())
}

model AppSettings {
  id                    String @id @default("singleton")
  anthropicApiKey       String @default("")
  defaultModel          String @default("claude-sonnet-4-20250514")
  researchModel         String @default("")
  maxTokens             Int    @default(32000)
  interStageDelaySeconds Int   @default(5)
  usptoOdpApiKey        String @default("")
}

enum ProjectStatus {
  INTAKE
  FEASIBILITY
  PRIOR_ART
  DRAFTING
  COMPLIANCE
  APPLICATION
  FILED
  ABANDONED
}

enum RunStatus {
  PENDING
  RUNNING
  COMPLETE
  ERROR
  CANCELLED
  STALE
}

enum ClaimType {
  INDEPENDENT
  DEPENDENT
}

enum CheckStatus {
  PASS
  FAIL
  WARN
}
```

---

## 3. Service Specifications

### 3.1 Feasibility Service

**Source**: Ported from scottconverse/patent-analyzer-app (C#/.NET 8 → TypeScript)

**What it does**: Runs a 6-stage sequential AI analysis pipeline that evaluates whether an invention is patentable and provides a filing strategy.

| Stage | Name | Web Search | Purpose |
|-------|------|-----------|---------|
| 1 | Technical Intake & Restatement | No | Restates invention in precise technical/legal terms |
| 2 | Prior Art Research | Yes (20 uses) | LLM-powered prior art search via web |
| 3 | Patentability Analysis | Yes (5 uses) | §101 eligibility, §102 novelty, §103 obviousness, §112 enablement |
| 4 | Deep Dive Analysis | Yes (10 uses) | Specialized analysis of AI/ML and 3D printing elements |
| 5 | IP Strategy & Recommendations | No | Filing strategy, cost estimates, claim directions, timeline |
| 6 | Comprehensive Report | No | Assembles all findings into professional report |

**API**:
```
POST /analyze
Content-Type: application/json

Request:
{
  "inventionNarrative": "string (combined from all 11 InventionInput fields)",
  "settings": {
    "model": "claude-sonnet-4-20250514",
    "researchModel": "claude-haiku-4-5-20251001",
    "maxTokens": 32000,
    "interStageDelaySeconds": 5
  }
}

Response: SSE stream
  event: stage_start
  data: { "stage": 1, "name": "Technical Intake & Restatement" }

  event: token
  data: { "text": "Based on the..." }

  event: stage_complete
  data: { "stage": 1, "output": "...", "model": "claude-sonnet-4-20250514", "webSearchUsed": false }

  ... (stages 2-6) ...

  event: pipeline_complete
  data: { "finalReport": "...", "stages": [...] }
```

**Ported from**:
- `PatentAnalyzer/Services/PipelineRunner.cs` → `src/pipeline-runner.ts`
- `PatentAnalyzer/Services/AnthropicClient.cs` → `src/anthropic-client.ts`
- `PatentAnalyzer/Services/PromptTemplates.cs` → `src/prompts/stage-1.md` through `stage-6.md`
- `PatentAnalyzer/Models/AnalysisModels.cs` → `src/models.ts`

**Stack**: TypeScript, Express/Fastify, Anthropic SSE streaming (hand-rolled, no SDK)

### 3.2 Prior Art Service

**Source**: [USPTO Open Data Portal](https://developer.uspto.gov/) (public API, free with API key)

**What it does**: Keyword-based patent search via the USPTO Open Data Portal (ODP) API, with stop-word filtering, title-weighted relevance scoring, and lazy-loaded patent claims text from the USPTO Documents API.

**Search pipeline**:
1. Query construction — extracts key terms from the invention's technical restatement, strips common stop words
2. ODP search — queries `api.patentsview.org` and USPTO ODP endpoints for matching patents
3. Relevance scoring — title-weighted scoring with configurable thresholds
4. Result enrichment — lazy-loads actual patent claims text, continuity data, and CPC classifications from USPTO Documents API on demand
5. ODP usage tracking — per-project API call counting stored in `OdpApiUsage` model

**Integration**:
- Integrated directly into the NestJS backend (no separate service)
- Requires a free USPTO ODP API key (set in Settings UI)
- `backend/src/prior-art/` — search service, ODP client, PatentsView client
- `backend/src/patent-detail/` — enrichment services (claims, continuity, CPC data)

**API** (internal backend routes):
```
GET /api/projects/:id/prior-art/search?q=...&limit=20
POST /api/projects/:id/prior-art/search

Response:
{
  "results": [
    {
      "patentNumber": "US10234567B2",
      "title": "...",
      "abstract": "...",
      "relevanceScore": 0.94,
      "snippet": "...",
      "source": "ODP"
    }
  ]
}
```

### 3.3 Claim Drafting Service

**Source**: Architecture patterns from [AutoPatent](https://github.com/QiYao-Wang/AutoPatent) (MIT, 188 stars) and [M-Cube](https://github.com/yycyyv/M-Cube) (MIT, 117 stars)

**What it does**: Multi-agent system that generates patent claims and specification language informed by prior art search results and feasibility analysis.

**Agent Architecture** (adapted from AutoPatent's planner/writer/examiner pattern):
```
┌─────────┐     ┌─────────┐     ┌──────────┐
│ PLANNER │ ──▶ │ WRITER  │ ──▶ │ EXAMINER │ ──▶ Claims
│         │     │         │     │          │
│ Builds  │     │ Drafts  │     │ Reviews  │
│ claim   │     │ claim   │     │ for      │
│ tree    │     │ language │     │ quality  │
│ (PGTree)│     │ per node│     │ & gaps   │
└─────────┘     └─────────┘     └──────────┘
      ▲                               │
      └───── revision loop ───────────┘
```

**Inputs** (from upstream stages):
- Technical restatement (feasibility Stage 1)
- Prior art results with relevance scores (USPTO ODP)
- Patentability analysis with §102/§103 findings (feasibility Stage 3)
- Deep dive analysis (feasibility Stage 4)
- IP strategy with recommended claim directions (feasibility Stage 5)
- Original invention input (all 11 fields)

**Outputs**:
- Independent claims (broad, medium, narrow scope)
- Dependent claims (feature-specific)
- Specification language (detailed description supporting claims)
- Claim tree visualization (hierarchical dependency map)

**Key patterns borrowed**:
- From AutoPatent: PGTree hierarchical planning, RRAG (retrieval-augmented rewriting), IRR metric for repetition control
- From M-Cube: LangGraph orchestration, multi-verification loops, compliance pre-checks

**Stack**: Python, LangGraph, FastAPI, Anthropic/OpenAI

### 3.4 Compliance Service

**Source**: Extracted from [Claude-Patent-Creator](https://github.com/RobThePCGuy/Claude-Patent-Creator) (MIT, 51 stars)

**What it does**: Validates patent claims and specification against legal requirements.

> **v0.5 Implementation Note:** The v0.5 compliance checker uses an **LLM-native approach** — Claude with structured prompts and four specialized checker agents — rather than the RAG architecture originally planned below. This approach was chosen for faster iteration and because Claude's training data already includes substantial patent law knowledge (MPEP, 35 USC, 37 CFR). The RAG architecture (FAISS + BM25 hybrid retrieval over MPEP/USC/CFR corpus) remains a planned enhancement for a future version to improve citation precision and reduce LLM hallucination of MPEP section numbers.

**Checks performed**:

| Check | Statute | What It Catches |
|-------|---------|----------------|
| Written description adequacy | 35 USC 112(a) | Specification doesn't support the claims |
| Enablement | 35 USC 112(a) | Specification doesn't teach how to make/use |
| Definiteness | 35 USC 112(b) | Ambiguous claim language, missing antecedent basis |
| Formalities | MPEP 608 | Format, numbering, dependency chain errors |
| Abstract eligibility | 35 USC 101 | Alice/Mayo framework — abstract idea without "significantly more" |

**Originally Planned RAG Architecture** (deferred to future version):
```
Query (claim text + spec excerpt)
    │
    ├──▶ BM25 keyword search over MPEP/USC/CFR corpus
    │
    ├──▶ FAISS dense vector search (sentence-transformers)
    │
    └──▶ Hybrid merge + rerank
            │
            ▼
    Top-K relevant legal passages
            │
            ▼
    LLM evaluates claim against passages
            │
            ▼
    Structured compliance result (pass/fail/warn + citation)
```

**Adapter API**:
```
POST /check
{
  "claims": [
    { "number": 1, "type": "independent", "text": "A method comprising..." },
    { "number": 2, "type": "dependent", "parent": 1, "text": "The method of claim 1, wherein..." }
  ],
  "specification": "string (detailed description text)"
}

Response:
{
  "overallPass": false,
  "results": [
    {
      "rule": "112b_definiteness",
      "status": "fail",
      "claimNumber": 2,
      "detail": "'the processing unit' in claim 2 lacks antecedent basis in claim 1",
      "citation": "MPEP 2173.05(e)",
      "suggestion": "Add 'a processing unit' to claim 1 or rewrite claim 2 dependency"
    },
    {
      "rule": "112a_written_description",
      "status": "pass",
      "claimNumber": 1,
      "detail": "Claim 1 elements adequately supported in specification paragraphs [0023]-[0031]",
      "citation": "MPEP 2163"
    }
  ]
}
```

**Stack**: Python, FastAPI, FAISS, sentence-transformers, BM25 (rank_bm25)

### 3.5 USPTO Data Service

**Source**: [USPTO-CLI](https://github.com/smcronin/uspto-cli) (MIT, 31 stars) + [pyUSPTO](https://github.com/DunlapCoddingPC/pyUSPTO) (MIT)

**What it does**: Provides programmatic access to USPTO patent data for enriching prior art results, tracking prosecution history, and monitoring portfolio status.

**Capabilities**:
- Patent bibliographic data (title, abstract, claims, drawings)
- Patent family trees (continuations, divisionals, CIPs)
- Prosecution timeline (Office Actions, responses, allowances)
- PTAB proceedings (IPR, PGR, appeal decisions)
- Full-text search across granted patents and published applications
- Bulk data access via USPTO Open Data Portal

**Key endpoints**:
```
GET /patent/:number                    → bibliographic data
GET /patent/:number/claims             → claim text
GET /patent/:number/family             → patent family tree
GET /patent/:number/prosecution        → file wrapper timeline
GET /patent/:number/ptab              → PTAB proceedings
GET /search?q=...&dateRange=...        → full-text search
GET /patent/:number/office-actions     → Office Action text (via pyUSPTO)
```

**Data sources**:
- [USPTO Open Data Portal](https://data.uspto.gov/) — 38 API endpoints, free, rate-limited
- [PatentsView](https://patentsview.org/apis/purpose) — structured search, migrating to ODP in 2026
- [patent-dev/bulk-file-loader](https://github.com/patent-dev/bulk-file-loader) (MIT) — automated bulk data sync from USPTO/EPO

**Stack**: Go (USPTO-CLI) or Python (pyUSPTO), wrapped in thin HTTP server

---

## 4. User Journey & UX Design

![User Journey](diagrams/user-journey.png)
*Figure 5: User Journey from Invention to Attorney Meeting*

### 4.1 Application Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  PatentForge                                    [Settings] [?]  │
├────────────┬────────────────────────────────────────────────────┤
│            │                                                    │
│  PROJECTS  │              MAIN CONTENT AREA                     │
│            │                                                    │
│  + New     │  (changes based on selected project + stage)       │
│            │                                                    │
│  ▼ Active  │                                                    │
│    Proj 1  │                                                    │
│    Proj 2  │                                                    │
│  ▼ Complete│                                                    │
│    Proj 3  │                                                    │
│            │                                                    │
├────────────┤                                                    │
│            │                                                    │
│  PIPELINE  │                                                    │
│  STAGES    │                                                    │
│            │                                                    │
│  ● Intake  │                                                    │
│  ○ Feasib. │                                                    │
│  ○ Prior   │                                                    │
│  ○ Draft   │                                                    │
│  ○ Comply  │                                                    │
│  ○ App     │                                                    │
│  ○ File    │                                                    │
│            │                                                    │
│  ● = done  │                                                    │
│  ◐ = run   │                                                    │
│  ○ = pend  │                                                    │
│  ⊘ = stale │                                                    │
│            │                                                    │
└────────────┴────────────────────────────────────────────────────┘
```

### 4.2 Stage-by-Stage UX

**Stage 0: Intake**

The user fills out the invention disclosure form. All fields optional except Title and Description.

```
┌─────────────────────────────────────────────────┐
│  New Patent Project                             │
│                                                 │
│  Invention Title *                              │
│  ┌─────────────────────────────────────────┐    │
│  │                                         │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  Description *                                  │
│  ┌─────────────────────────────────────────┐    │
│  │                                         │    │
│  │                                         │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  ▸ Problem It Solves                            │
│  ▸ How It Works                                 │
│  ▸ AI/ML Components                             │
│  ▸ 3D Printing/Physical Design Components       │
│  ▸ What I Believe Is Novel                      │
│  ▸ Current Alternatives                         │
│  ▸ What Has Been Built So Far                   │
│  ▸ What I Want Protected                        │
│  ▸ Additional Notes                             │
│                                                 │
│  [Save Draft]              [Run Feasibility ▶]  │
└─────────────────────────────────────────────────┘
```

Expandable sections (▸) keep the form unintimidating. The minimum viable input is just a title and a paragraph.

**Stage 1: Feasibility Analysis**

Split-panel view: pipeline progress on left, streaming output on right.

```
┌──────────────────────┬──────────────────────────┐
│  Pipeline Progress   │  Stage 2: Prior Art      │
│                      │                          │
│  ✅ 1. Technical     │  Searching the web...    │
│       Intake         │                          │
│  ◐  2. Prior Art     │  Based on the technical  │
│       Research       │  restatement, I have     │
│  ○  3. Patentability │  identified the following│
│  ○  4. Deep Dive     │  prior art references... │
│  ○  5. IP Strategy   │                          │
│  ○  6. Final Report  │  ▌ (streaming cursor)    │
│                      │                          │
│  Model: claude-son.. │                          │
│  Tokens: 12,847      │                          │
│  Cost: ~$0.24        │                          │
│                      │                          │
│  [Cancel Pipeline]   │                          │
└──────────────────────┴──────────────────────────┘
```

When the pipeline completes, the final report renders as styled markdown with a toolbar:

```
[View Report] [Export .docx] [Export .pdf] [Re-run Pipeline] [→ Prior Art Search]
```

**Stage 2: Prior Art Search (USPTO ODP)**

Two-panel: search controls on left, ranked results on right.

```
┌──────────────────────┬──────────────────────────┐
│  Prior Art Search    │  Results (17 found)      │
│                      │                          │
│  Query (auto-filled  │  1. US10,234,567 B2      │
│  from Stage 1):      │     Score: 0.94          │
│  ┌────────────────┐  │     "Adaptive neural..." │
│  │ A system for   │  │     Snippet: "The inv... │
│  │ adaptive neural │  │     [View] [Compare]    │
│  │ network...     │  │                          │
│  └────────────────┘  │  2. US9,876,543 B1       │
│                      │     Score: 0.87          │
│  Filters:            │     "Machine learning... │
│  Date: 2015-2026     │     [View] [Compare]    │
│  Country: US ▼       │                          │
│  Type: Patents ▼     │  3. WO2022/123456 A1     │
│                      │     Score: 0.82          │
│  [Search Again]      │     ...                  │
│                      │                          │
│  Source: USPTO ODP   │  [→ Draft Claims]        │
└──────────────────────┴──────────────────────────┘
```

Clicking "Compare" opens a side-by-side view of the invention's claims vs. the prior art reference.

**Stage 3: Claim Drafting**

Interactive claim editor with agent-generated suggestions.

```
┌──────────────────────┬──────────────────────────┐
│  Claim Tree          │  Claim Editor            │
│                      │                          │
│  ┌─ Claim 1 (ind.)  │  Claim 1.                │
│  │  ├─ Claim 2      │  A computer-implemented  │
│  │  ├─ Claim 3      │  method for adaptive     │
│  │  └─ Claim 4      │  neural network training │
│  │     └─ Claim 5   │  comprising:             │
│  ├─ Claim 6 (ind.)  │    (a) receiving...      │
│  │  ├─ Claim 7      │    (b) processing...     │
│  │  └─ Claim 8      │    (c) outputting...     │
│  └─ Claim 9 (ind.)  │                          │
│                      │  ⚠ ODP match: Claims    │
│  Scope:              │  1(a), 1(b) overlap with │
│  ● Broad   ● Med    │  US10,234,567 claim 2.   │
│  ● Narrow            │  Consider narrowing.     │
│                      │                          │
│  [Regenerate]        │  [Edit] [Check 112]      │
│  [Add Claim]         │  [→ Run Compliance]      │
└──────────────────────┴──────────────────────────┘
```

Users can edit AI-generated claims directly. Prior art overlap warnings appear inline based on prior art claim mappings.

**Stage 4: Compliance Check**

Traffic-light view of all compliance results.

```
┌─────────────────────────────────────────────────┐
│  Compliance Check — v2 claims                   │
│                                                 │
│  Overall: ⚠ 2 issues found                     │
│                                                 │
│  ✅ 35 USC 112(a) Written Description           │
│     All claims supported by specification       │
│     MPEP 2163                                   │
│                                                 │
│  ❌ 35 USC 112(b) Definiteness                  │
│     Claim 2: "the processing unit" lacks        │
│     antecedent basis in parent claim 1           │
│     MPEP 2173.05(e)                             │
│     Suggestion: Add "a processing unit" to      │
│     claim 1 element (c)                         │
│     [Auto-fix] [Dismiss]                        │
│                                                 │
│  ⚠  MPEP 608 Formalities                       │
│     Claim 5 depends on claim 4 which depends    │
│     on claim 1 — 3-level chain is valid but     │
│     consider simplifying for examiner clarity    │
│     [Dismiss]                                   │
│                                                 │
│  ✅ 35 USC 101 Patent Eligibility               │
│     Technical implementation details provide    │
│     "significantly more" beyond abstract idea   │
│                                                 │
│  [Re-check After Edits]  [→ Generate App]       │
└─────────────────────────────────────────────────┘
```

"Auto-fix" sends the issue back to the claim drafter for targeted revision, then re-runs only the affected compliance check.

**Stage 5: Application Generation**

Full patent application preview with section navigation.

```
┌──────────────────────┬──────────────────────────┐
│  Sections            │  DETAILED DESCRIPTION    │
│                      │                          │
│  ○ Title             │  [0023] The present      │
│  ○ Cross-References  │  invention relates to... │
│  ○ Background        │                          │
│  ● Detailed Desc.    │  [0024] In accordance    │
│  ○ Claims            │  with one embodiment,    │
│  ○ Abstract          │  the system comprises... │
│  ○ Figure Desc.      │                          │
│                      │  [0025] Referring now to  │
│  ── Export ──        │  FIG. 1, a block diagram │
│  [Word .docx]        │  illustrates...          │
│  [PDF]               │                          │
│  [Markdown]          │                          │
│  [EFS-Web XML]       │                          │
│                      │                          │
└──────────────────────┴──────────────────────────┘
```

**Stage 6: File & Monitor (Portfolio)**

Dashboard for tracking prosecution status via USPTO APIs.

```
┌─────────────────────────────────────────────────┐
│  Portfolio                                      │
│                                                 │
│  Patent App 16/123,456 — "Adaptive Neural..."   │
│  Filed: 2026-06-15  Status: Office Action       │
│                                                 │
│  Timeline:                                      │
│  ──●──────●──────●──────●────── ○ ──── ○ ──    │
│  Filed  Pub'd   OA1   Resp.  OA2    Allow      │
│  06/15  12/15   01/26  03/26  ???              │
│                                                 │
│  Latest Office Action (2026-01-15):             │
│  §103 rejection over US10,234,567 + US9,876...  │
│  [View Full OA] [Draft Response]                │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 4.3 Cross-Stage Data Flow

![Data Flow](diagrams/data-flow.png)
*Figure 4: Full Pipeline Data Flow*

Each stage feeds forward into the next. The central backend manages this routing:

```
Intake (11 fields)
    │
    ├──▶ Feasibility Stage 1 output (technical restatement)
    │        │
    │        ├──▶ USPTO ODP query (prior art search)
    │        │        │
    │        │        └──▶ Claim drafter input (draft around known art)
    │        │
    │        ├──▶ Feasibility Stage 3 output (patentability findings)
    │        │        │
    │        │        └──▶ Claim drafter input (target strongest angles)
    │        │
    │        └──▶ Feasibility Stage 5 output (claim directions)
    │                 │
    │                 └──▶ Claim drafter input (recommended scope)
    │
    ├──▶ Claim drafter output (claims + spec language)
    │        │
    │        └──▶ Compliance checker input
    │                 │
    │                 ├──▶ Pass → Application generator
    │                 └──▶ Fail → Back to claim drafter (targeted fix)
    │
    └──▶ Application generator input (all artifacts)
             │
             └──▶ Export (Word/PDF/EFS-Web)
```

---

## 5. Deployment

### 5.1 Docker Compose (Development)

![Docker Topology](diagrams/docker-topology.png)
*Figure 3: Docker Compose Deployment Topology*


```yaml
version: "3.9"

services:
  backend:
    build: ./backend
    ports: ["3000:3000"]
    depends_on: [postgres]
    environment:
      DATABASE_URL: postgresql://patentforge:patentforge@postgres:5432/patentforge
      FEASIBILITY_URL: http://feasibility:3001
      PRIOR_ART_URL: http://prior-art:3002
      DRAFTING_URL: http://drafting:3003
      COMPLIANCE_URL: http://compliance:3004
      USPTO_URL: http://uspto:3005

  feasibility:
    build: ./services/feasibility
    ports: ["3001:3001"]
    environment:
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}

  prior-art:
    build: ./services/prior-art
    ports: ["3002:3002"]
    environment:
      USPTO_ODP_API_KEY: ${USPTO_ODP_API_KEY}

  drafting:
    build: ./services/drafting
    ports: ["3003:3003"]
    environment:
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}

  compliance:
    build: ./services/compliance
    ports: ["3004:3004"]
    volumes:
      - ./data/mpep-corpus:/app/corpus
    environment:
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}

  uspto:
    build: ./services/uspto
    ports: ["3005:3005"]

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: patentforge
      POSTGRES_USER: patentforge
      POSTGRES_PASSWORD: patentforge
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports: ["5432:5432"]

  frontend:
    build: ./frontend
    ports: ["8080:8080"]
    depends_on: [backend]

volumes:
  pgdata:
```

### 5.2 Minimal Deployment (v0.1)

For v0.1, only the backend + feasibility service + frontend are needed:

```yaml
services:
  backend:
    build: ./backend
    ports: ["3000:3000"]
    depends_on: [postgres]
  feasibility:
    build: ./services/feasibility
    ports: ["3001:3001"]
  postgres:
    image: postgres:16-alpine
  frontend:
    build: ./frontend
    ports: ["8080:8080"]
```

Additional services are added one at a time as they're built.

---

## 6. Technology Sources & Licenses

| Component | Source Repo | License | Stars | Status |
|-----------|-----------|---------|-------|--------|
| Central Backend | [AutoBE](https://github.com/wrtnio/autobe) | MIT | — | Active |
| Feasibility Pipeline | scottconverse/patent-analyzer-app (private) | Proprietary | — | Active |
| Prior Art Search | [USPTO Open Data Portal](https://developer.uspto.gov/) | Public API | — | Active |
| Claim Drafting Patterns | [QiYao-Wang/AutoPatent](https://github.com/QiYao-Wang/AutoPatent) | MIT | 188 | Active |
| Drafting Orchestration | [yycyyv/M-Cube](https://github.com/yycyyv/M-Cube) | MIT | 117 | Active |
| Compliance RAG | [RobThePCGuy/Claude-Patent-Creator](https://github.com/RobThePCGuy/Claude-Patent-Creator) | MIT | 51 | Active |
| USPTO Data (Go CLI) | [smcronin/uspto-cli](https://github.com/smcronin/uspto-cli) | MIT | 31 | Active |
| USPTO Data (Python) | [DunlapCoddingPC/pyUSPTO](https://github.com/DunlapCoddingPC/pyUSPTO) | MIT | 2 | Active |
| Patent Image Search | [TIBHannover/iPatent](https://github.com/TIBHannover/iPatent) | MIT | 2 | Early |
| Bulk Patent Data Sync | [patent-dev/bulk-file-loader](https://github.com/patent-dev/bulk-file-loader) | MIT | — | Active |
| USPTO APIs | [USPTO Open Data Portal](https://data.uspto.gov/) | Public | — | Active |

All source components are MIT-licensed (commercially safe) or public government APIs.

---

## 7. Release Phases

| Phase | Services | What Ships | User Gets |
|-------|----------|-----------|-----------|
| **v0.1** | Backend + Feasibility + Frontend | Web patent feasibility analyzer | Cross-platform replacement for WPF app |
| **v0.2** | + Prior Art Search (USPTO ODP) | Patent prior art search | Structured search alongside LLM analysis |
| **v0.3** | + USPTO Data Service | Patent data enrichment | Real patent lookups, prosecution history |
| **v0.4** | + Claim Drafting Service | AI claim generation | Claims informed by prior art + analysis |
| **v0.5** | + Compliance Service | Legal compliance checks | 112a/112b/MPEP validation |
| **v0.6** | + Application Generator | Full patent application export | Word/PDF ready for filing |
| **v1.0** | + Portfolio Dashboard | Prosecution tracking | Full lifecycle management |
