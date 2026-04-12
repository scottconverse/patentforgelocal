# PatentForge — Product Requirements Document

**Version**: 0.1.0-draft
**Last Updated**: 2026-03-30
**Status**: Pre-development

---

## 1. Product Overview

### 1.1 Problem Statement

Patent feasibility analysis costs $5,000-$15,000 per invention when done by an attorney. Existing AI patent tools are either (a) enterprise-priced SaaS products that cover only one slice of the workflow, or (b) open-source tools that do search/visualization but never produce an actionable opinion. No tool covers the full patent lifecycle from "I have an idea" through "here's a draft application ready for filing" in an affordable, self-hostable package.

### 1.2 Solution

PatentForge is an open-source, self-hosted web platform that orchestrates multiple AI services to cover the complete patent lifecycle:

1. **Feasibility** — Is this patentable? (6-stage AI analysis with §101-§112 evaluation)
2. **Prior Art** — What exists already? (ML-powered search over 100M+ patents)
3. **Drafting** — Write the claims (multi-agent planner/writer/examiner)
4. **Compliance** — Is the draft legally sound? (RAG over MPEP/USC/CFR)
5. **Application** — Generate the full document (spec, claims, abstract, figures)
6. **Prosecution** — Track it through the USPTO (Office Actions, responses, status)

### 1.3 Target Users

**Primary**: Independent inventors, startup founders, and small-business owners who want to understand whether their invention is patentable before spending $5k-$15k on an attorney.

**Secondary**: Patent attorneys and agents who want AI-assisted first drafts, compliance pre-checks, and prior art research to accelerate their workflow.

**Tertiary**: University tech transfer offices and corporate R&D teams that need scalable patent evaluation.

### 1.4 Competitive Landscape

| Product | Price | Coverage | Open Source |
|---------|-------|----------|-------------|
| Solve Intelligence | Enterprise (raised $40M) | Drafting + prosecution | No |
| Patlytics | Enterprise | Analysis + infringement | No |
| PatentPal | $$$ | Drafting only | No |
| ClaimMaster | $1,200/yr | Proofreading only | No |
| PQAI | Free | Prior art search only | Yes (MIT) |
| **PatentForge** | **Free / self-host** | **Full lifecycle** | **Yes (MIT)** |

### 1.5 Key Differentiators

1. **Only full-lifecycle open-source patent platform** — no competitor covers all 6 stages
2. **AI feasibility opinions** — the "should I patent this?" question that no other tool answers
3. **Self-hostable** — no data leaves your infrastructure; critical for pre-filing confidentiality
4. **Cost transparency** — ~$0.75-$3.00 per analysis vs. $5k-$15k attorney fee
5. **Federated architecture** — each capability is independently deployable and replaceable

---

## 2. Functional Requirements

### 2.1 Project Management

| ID | Requirement | Priority | Phase |
|----|------------|----------|-------|
| PM-1 | Create a new patent project with title | Must | v0.1 |
| PM-2 | View list of all projects with status | Must | v0.1 |
| PM-3 | View a single project with all artifacts | Must | v0.1 |
| PM-4 | Delete a project and all associated data | Must | v0.1 |
| PM-5 | Project state machine enforces stage ordering | Must | v0.1 |
| PM-6 | Re-running a stage creates a new version and marks downstream STALE | Should | v0.2 |
| PM-7 | View historical versions of any stage output | Could | v0.3 |

### 2.2 Invention Intake

| ID | Requirement | Priority | Phase |
|----|------------|----------|-------|
| IN-1 | 11-field invention disclosure form (Title, Description required; 9 optional) | Must | v0.1 |
| IN-2 | Save draft before running analysis | Must | v0.1 |
| IN-3 | Edit invention details after initial submission | Must | v0.1 |
| IN-4 | Auto-generate combined narrative from all fields (matches C# ToNarrative()) | Must | v0.1 |

### 2.3 Feasibility Analysis

| ID | Requirement | Priority | Phase |
|----|------------|----------|-------|
| FA-1 | Run 6-stage sequential pipeline from invention input | Must | v0.1 |
| FA-2 | Stream tokens to frontend in real-time via SSE | Must | v0.1 |
| FA-3 | Display stage progress (pending/running/complete/error) | Must | v0.1 |
| FA-4 | Cancel a running pipeline | Must | v0.1 |
| FA-5 | Each stage output persisted to database independently | Must | v0.1 |
| FA-6 | Stage 2 uses Anthropic web search tool (max 20 uses) | Must | v0.1 |
| FA-7 | Stage 3 uses Anthropic web search tool (max 5 uses) | Must | v0.1 |
| FA-8 | Stage 4 uses Anthropic web search tool (max 10 uses) | Must | v0.1 |
| FA-9 | Configurable model per stage (default + research model) | Should | v0.1 |
| FA-10 | Inter-stage delay configurable for rate limit protection | Should | v0.1 |
| FA-11 | Rate limit retry with escalating delays (60s/90s/120s) | Must | v0.1 |
| FA-12 | Final report rendered as styled markdown | Must | v0.1 |
| FA-13 | Track and display token usage and estimated cost per stage | Should | v0.2 |
| FA-14 | Re-run individual stages (not just full pipeline) | Could | v0.3 |

### 2.4 Prior Art Search

| ID | Requirement | Priority | Phase |
|----|------------|----------|-------|
| PA-1 | Search PQAI for semantically similar patents from natural language query | Must | v0.2 |
| PA-2 | Auto-populate query from feasibility Stage 1 (technical restatement) | Must | v0.2 |
| PA-3 | Filter results by date range, country, patent type | Should | v0.2 |
| PA-4 | Display ranked results with relevance score and snippet | Must | v0.2 |
| PA-5 | Claim-to-prior-art mapping (which claims overlap with which references) | Should | v0.3 |
| PA-6 | View full patent details for any result (via USPTO Data Service) | Should | v0.3 |
| PA-7 | Support both PQAI API mode and self-hosted mode | Could | v0.4 |
| PA-8 | Side-by-side comparison: invention claims vs. prior art reference | Could | v0.4 |

### 2.5 Claim Drafting

| ID | Requirement | Priority | Phase |
|----|------------|----------|-------|
| CD-1 | Generate independent claims (broad, medium, narrow scope) from analysis | Must | v0.4 |
| CD-2 | Generate dependent claims for each independent claim | Must | v0.4 |
| CD-3 | Claims informed by prior art results (draft around known art) | Must | v0.4 |
| CD-4 | Claims informed by feasibility §102/§103 findings | Must | v0.4 |
| CD-5 | Generate supporting specification language | Should | v0.4 |
| CD-6 | Display claim tree (hierarchical dependency visualization) | Should | v0.4 |
| CD-7 | User can edit generated claims before compliance check | Must | v0.4 |
| CD-8 | Regenerate individual claims on demand | Should | v0.5 |
| CD-9 | Prior art overlap warnings inline with claims | Could | v0.5 |

### 2.6 Compliance Checking

| ID | Requirement | Priority | Phase |
|----|------------|----------|-------|
| CC-1 | 35 USC 112(a) written description adequacy check | Must | v0.5 |
| CC-2 | 35 USC 112(b) definiteness check (antecedent basis, ambiguity) | Must | v0.5 |
| CC-3 | MPEP 608 formalities check (numbering, format, dependency chains) | Should | v0.5 |
| CC-4 | 35 USC 101 abstract eligibility assessment (Alice/Mayo) | Should | v0.5 |
| CC-5 | Each check returns pass/fail/warn with MPEP citation and suggestion | Must | v0.5 |
| CC-6 | Auto-fix option that sends issue to claim drafter for targeted revision | Could | v0.6 |
| CC-7 | Re-run compliance after claim edits | Must | v0.5 |

### 2.7 Application Generation

| ID | Requirement | Priority | Phase |
|----|------------|----------|-------|
| AG-1 | Generate full patent application (title, abstract, background, summary, detailed description, claims, figure descriptions) | Must | v0.6 |
| AG-2 | Application incorporates all upstream artifacts (claims, spec language, prior art citations) | Must | v0.6 |
| AG-3 | Export as Word (.docx) | Must | v0.6 |
| AG-4 | Export as PDF | Must | v0.6 |
| AG-5 | Export as Markdown | Should | v0.6 |
| AG-6 | Paragraph numbering per USPTO format ([0001], [0002], ...) | Must | v0.6 |
| AG-7 | Export as EFS-Web XML for electronic filing | Could | v1.0 |

### 2.8 Prosecution Tracking

| ID | Requirement | Priority | Phase |
|----|------------|----------|-------|
| PT-1 | Look up patent/application status from USPTO | Must | v0.3 |
| PT-2 | Display prosecution timeline (filing, publication, OAs, responses) | Should | v0.3 |
| PT-3 | View Office Action text | Should | v0.3 |
| PT-4 | Patent family tree (continuations, divisionals) | Could | v0.4 |
| PT-5 | PTAB proceeding lookup | Could | v1.0 |
| PT-6 | Portfolio dashboard across all projects | Could | v1.0 |
| PT-7 | Automated status monitoring with change alerts | Could | v1.0 |

### 2.9 Settings & Configuration

| ID | Requirement | Priority | Phase |
|----|------------|----------|-------|
| ST-1 | Configure Anthropic API key | Must | v0.1 |
| ST-2 | Select default model for analysis | Must | v0.1 |
| ST-3 | Select research model (for cost optimization) | Should | v0.1 |
| ST-4 | Configure max tokens per stage | Should | v0.1 |
| ST-5 | Configure inter-stage delay | Should | v0.1 |
| ST-6 | Configure PQAI API token or self-hosted URL | Should | v0.2 |
| ST-7 | API key stored encrypted at rest | Must | v0.1 |

### 2.10 Export & Reporting

| ID | Requirement | Priority | Phase |
|----|------------|----------|-------|
| EX-1 | Export feasibility report as Markdown | Must | v0.1 |
| EX-2 | Export feasibility report as HTML (styled, printable) | Must | v0.1 |
| EX-3 | Export feasibility report as Word (.docx) | Should | v0.2 |
| EX-4 | Export individual stage outputs | Should | v0.2 |
| EX-5 | Export prior art search results as CSV | Could | v0.3 |
| EX-6 | Export full patent application (see AG-3 through AG-7) | Must | v0.6 |

---

## 3. Non-Functional Requirements

### 3.1 Performance

| ID | Requirement | Target |
|----|------------|--------|
| NF-1 | Feasibility pipeline completes within 15 minutes (6 stages, Sonnet) | 15 min |
| NF-2 | Prior art search returns results within 10 seconds (PQAI API mode) | 10 sec |
| NF-3 | SSE token streaming latency from LLM to frontend | < 500ms |
| NF-4 | Page load time | < 2 sec |
| NF-5 | Database query response time | < 100ms |

### 3.2 Security

| ID | Requirement |
|----|------------|
| NF-6 | API keys encrypted at rest in database (not plaintext) |
| NF-7 | No patent data sent to external services except Anthropic API and PQAI (user-configured) |
| NF-8 | All inter-service communication over internal Docker network (not exposed) |
| NF-9 | No telemetry or analytics without explicit user consent |
| NF-10 | Pre-filing invention data never leaves the user's infrastructure |

### 3.3 Reliability

| ID | Requirement |
|----|------------|
| NF-11 | Pipeline resumes from last completed stage on crash/restart |
| NF-12 | Individual service failure does not crash the central backend |
| NF-13 | Database backups supported via standard PostgreSQL tools |
| NF-14 | Rate limit handling with configurable retry and backoff |

### 3.4 Deployment

| ID | Requirement |
|----|------------|
| NF-15 | Single `docker compose up` starts the entire platform |
| NF-16 | Works with SQLite for zero-dependency local development |
| NF-17 | Each service independently deployable and replaceable |
| NF-18 | Environment-variable-driven configuration (12-factor app) |

### 3.5 Accessibility

| ID | Requirement |
|----|------------|
| NF-19 | Keyboard navigable (all critical actions reachable without mouse) |
| NF-20 | WCAG 2.1 AA compliance for color contrast and text sizing |
| NF-21 | Screen reader compatible form labels and status updates |

---

## 4. Data Models

### 4.1 InventionInput

Captures the inventor's disclosure. Derived from the patent-analyzer-app's `InventionInput` C# model.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | Yes | Invention title |
| description | string | Yes | Detailed description of the invention |
| problemSolved | string | No | What problem does this solve? |
| howItWorks | string | No | Technical explanation of operation |
| aiComponents | string | No | AI/ML elements of the invention |
| threeDPrintComponents | string | No | 3D printing / physical design elements |
| whatIsNovel | string | No | What the inventor believes is new |
| currentAlternatives | string | No | Existing solutions / prior art known to inventor |
| whatIsBuilt | string | No | Current prototype or implementation status |
| whatToProtect | string | No | What aspects should the patent cover |
| additionalNotes | string | No | Any other relevant information |

### 4.2 FeasibilityRun

Tracks a single execution of the 6-stage analysis pipeline.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| projectId | UUID (FK) | Parent project |
| version | int | Version number (increments on re-run) |
| status | enum | PENDING, RUNNING, COMPLETE, ERROR, CANCELLED |
| startedAt | datetime | When pipeline started |
| completedAt | datetime | When pipeline finished |
| finalReport | text | Stage 6 output (comprehensive report) |

### 4.3 FeasibilityStage

Tracks a single stage within a feasibility run.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| feasibilityRunId | UUID (FK) | Parent run |
| stageNumber | int (1-6) | Stage sequence number |
| stageName | string | Human-readable stage name |
| status | enum | PENDING, RUNNING, COMPLETE, ERROR, CANCELLED |
| outputText | text | Full stage output |
| model | string | LLM model used for this stage |
| webSearchUsed | boolean | Whether Anthropic web search was invoked |
| startedAt | datetime | When stage started |
| completedAt | datetime | When stage finished |
| errorMessage | string | Error details if status is ERROR |

### 4.4 Stage Definitions

| # | Name | Web Search | Max Uses | Description |
|---|------|-----------|----------|-------------|
| 1 | Technical Intake & Restatement | No | — | Restates invention in precise technical/legal terms, identifies components, data flows, AI elements, 3D printing elements |
| 2 | Prior Art Research | Yes | 20 | Searches patents, academic papers, products, and open-source projects for prior art |
| 3 | Patentability Analysis | Yes | 5 | §101 eligibility, §102 novelty, §103 obviousness, §112 enablement analysis |
| 4 | Deep Dive Analysis | Yes | 10 | Specialized deep analysis of AI/ML and 3D printing patentability |
| 5 | IP Strategy & Recommendations | No | — | Filing strategy, cost estimates, trade secret boundaries, claim directions, timeline |
| 6 | Comprehensive Report | No | — | Assembles all findings into professional patent feasibility report |

### 4.5 PriorArtResult

| Field | Type | Description |
|-------|------|-------------|
| patentNumber | string | Patent or publication number (e.g., "US10,234,567 B2") |
| title | string | Patent title |
| abstract | text | Patent abstract |
| relevanceScore | float | ML-computed similarity score (0.0 - 1.0) |
| snippet | text | Extracted passage explaining relevance |
| claimMapping | text | Which invention claims overlap with which reference claims |
| source | string | Data source ("PQAI", "USPTO", "LLM_WEB_SEARCH") |
| cpcCodes | string[] | Cooperative Patent Classification codes |
| filingDate | date | When the reference was filed |

### 4.6 Claim

| Field | Type | Description |
|-------|------|-------------|
| claimNumber | int | Claim sequence number |
| claimType | enum | INDEPENDENT or DEPENDENT |
| parentClaimNumber | int (nullable) | Parent claim for dependent claims |
| text | text | Full claim text |

### 4.7 ComplianceResult

| Field | Type | Description |
|-------|------|-------------|
| rule | string | Rule identifier (e.g., "112a_written_description", "112b_definiteness", "mpep_608_formalities", "101_eligibility") |
| status | enum | PASS, FAIL, WARN |
| claimNumber | int (nullable) | Which claim triggered this result |
| detail | text | Human-readable explanation |
| citation | string | MPEP/USC section reference |
| suggestion | text | Recommended fix |

---

## 5. API Specification

### 5.1 Central Backend Endpoints

**Projects**
```
POST   /projects                     Create new project
GET    /projects                     List all projects
GET    /projects/:id                 Get project with all artifacts
DELETE /projects/:id                 Delete project and all data
PATCH  /projects/:id                 Update project metadata
```

**Invention Input**
```
PUT    /projects/:id/invention       Create or update invention disclosure
GET    /projects/:id/invention       Get invention disclosure
```

**Feasibility**
```
POST   /projects/:id/feasibility/run     Start feasibility pipeline
GET    /projects/:id/feasibility         Get latest feasibility run
GET    /projects/:id/feasibility/:version Get specific version
GET    /projects/:id/feasibility/stream  SSE stream of pipeline events
POST   /projects/:id/feasibility/cancel  Cancel running pipeline
```

**Prior Art**
```
POST   /projects/:id/prior-art/search   Run prior art search
GET    /projects/:id/prior-art           Get latest search results
GET    /projects/:id/prior-art/:version  Get specific version
```

**Claim Drafting**
```
POST   /projects/:id/claims/draft       Generate claims from analysis
GET    /projects/:id/claims              Get latest claim draft
GET    /projects/:id/claims/:version     Get specific version
PUT    /projects/:id/claims/:version     Update claims (user edits)
```

**Compliance**
```
POST   /projects/:id/compliance/check   Run compliance check on claims
GET    /projects/:id/compliance          Get latest check results
GET    /projects/:id/compliance/:version Get specific version
```

**Application**
```
POST   /projects/:id/application/generate  Generate full patent application
GET    /projects/:id/application            Get latest application
GET    /projects/:id/application/export/:format  Export (docx, pdf, md)
```

**USPTO Data**
```
GET    /patents/:number                  Patent bibliographic data
GET    /patents/:number/claims           Patent claim text
GET    /patents/:number/family           Patent family tree
GET    /patents/:number/prosecution      Prosecution timeline
```

**Settings**
```
GET    /settings                         Get app settings
PUT    /settings                         Update app settings
```

**Events**
```
GET    /projects/:id/events              Unified SSE stream (all services)
```

---

## 6. Prompt Templates

The feasibility service uses 6 system prompts ported from `PatentAnalyzer/Services/PromptTemplates.cs`. Each prompt includes:

### 6.1 Common Rules (prepended to all stages)

- Write clearly and precisely in professional patent analysis language
- Mark all data points as VERIFIED (from authoritative source), ESTIMATED (reasonable inference), or UNVERIFIED (LLM knowledge only)
- When web search is available but returns no results, note "UNVERIFIED — web search returned no results" and proceed with general knowledge
- All URLs must be verified as accessible; broken links must be flagged
- Include legal disclaimers: "This analysis is for informational purposes only and does not constitute legal advice"
- Minimum 50-word invention description required to proceed
- Date-stamp all cost estimates and filing fee references
- Safeguard against truncation: each stage must complete all sections before stopping

### 6.2 Stage-Specific Prompts

Prompts are stored as separate files (`src/prompts/stage-1.md` through `stage-6.md`) and loaded at startup. This allows prompt iteration without recompilation — a direct improvement over the C# app's embedded string constants.

### 6.3 Stage Chaining

Each stage receives all previous outputs as context:

| Stage | Receives |
|-------|---------|
| 1 | Invention narrative only |
| 2 | Stage 1 output + original narrative |
| 3 | Stages 1-2 output + original narrative |
| 4 | Stages 1-3 output + original narrative |
| 5 | Stages 1-4 output + original narrative |
| 6 | Stages 1-5 output + original narrative |

---

## 7. Release Plan

### v0.1 — Web Feasibility Analyzer (MVP)

**Goal**: Cross-platform replacement for the WPF desktop app.

**Scope**:
- AutoBE-generated central backend (NestJS + Prisma + PostgreSQL)
- Ported feasibility service (TypeScript, 6-stage pipeline)
- React frontend (invention form, streaming output, report view)
- Settings page (API key, model selection)
- Export (Markdown, HTML)
- Docker Compose for local deployment

**Excludes**: Prior art search, claim drafting, compliance, application generation, prosecution tracking.

**Estimated effort**: 2-3 weeks with AutoBE generating the backend.

### v0.2 — Prior Art Integration

**Goal**: Add ML-powered prior art search alongside LLM feasibility analysis.

**Scope**:
- PQAI API integration (adapter + search UI)
- Auto-populate search from feasibility Stage 1 output
- Ranked results display with snippets
- Date/country/type filters
- Word (.docx) export for feasibility reports

### v0.3 — USPTO Data & Versioning

**Goal**: Real patent data and artifact versioning.

**Scope**:
- USPTO Data Service wrapper (Go CLI or Python)
- Patent lookup by number
- Prosecution timeline display
- Stage re-run with versioning (new version, downstream STALE marking)
- CSV export for prior art results

### v0.4 — Claim Drafting

**Goal**: AI-generated patent claims informed by upstream analysis.

**Scope**:
- Multi-agent claim drafting service (Python + LangGraph)
- Claims informed by prior art + feasibility analysis
- Claim tree visualization
- User-editable claim text
- Patent family tree lookup

### v0.5 — Compliance Checking

**Goal**: Automated legal compliance validation.

**Scope**:
- MPEP/USC/CFR RAG index (FAISS + BM25)
- 112(a), 112(b), MPEP 608, 101 checks
- Traffic-light compliance report
- Re-check after claim edits
- Individual claim regeneration

### v0.6 — Application Generation

**Goal**: Full patent application document from all artifacts.

**Scope**:
- Application assembly service
- Word and PDF export
- USPTO paragraph numbering
- Auto-fix claims from compliance feedback

### v1.0 — Full Lifecycle

**Goal**: Complete patent lifecycle platform.

**Scope**:
- Portfolio dashboard
- Prosecution monitoring with alerts
- PTAB proceeding lookup
- EFS-Web XML export
- Automated status checks via USPTO API

---

## 8. Success Metrics

| Metric | Target | How Measured |
|--------|--------|-------------|
| Feasibility analysis completion rate | > 95% | Pipeline completes all 6 stages without error |
| Analysis cost per invention | < $3.00 | Token usage tracking (Sonnet pricing) |
| Time to complete feasibility | < 15 min | Pipeline start-to-finish timing |
| Prior art search relevance | > 80% precision in top-10 | Manual evaluation of PQAI results vs. human patent search |
| Compliance check accuracy | > 90% for 112(b) issues | Comparison against attorney review of same claims |
| User adoption | 100 GitHub stars in first 6 months | GitHub metrics |
| Self-host success rate | > 90% on first `docker compose up` | Issue tracker analysis |

---

## 9. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|------------|------------|
| AutoBE generates code that doesn't match requirements | High | Medium | Review generated schema/API before proceeding; manual adapter layer provides escape hatch |
| AutoBE token cost for generation ($5-$15) | Low | High | One-time cost; acceptable |
| PQAI public API goes down or changes terms | Medium | Low | Self-hosted mode as fallback; adapter pattern makes swapping easy |
| LLM hallucination in feasibility analysis | High | Medium | VERIFIED/ESTIMATED/UNVERIFIED labeling; web search for grounding; legal disclaimers |
| Claude-Patent-Creator MPEP corpus becomes outdated | Medium | Medium | MPEP updates are annual; index rebuild is scriptable |
| Patent attorneys distrust AI-generated analysis | High | High | Explicit positioning as "research tool, not legal advice"; attorney review always recommended |
| Pre-filing confidentiality concerns | High | Medium | Self-hosted by default; no external data sharing except user-configured APIs |
| USPTO API migration (ODP transition April 2026) | Medium | High | Use USPTO-CLI which is actively maintained and tracking the migration |

---

## 10. Open Questions

1. **Naming**: Is "PatentForge" the right product name? Alternatives: PatentPilot, InvenScope, ClaimCraft, PatentLab.
2. **Monetization**: Stay fully open-source, or offer a hosted version? If hosted, what's the pricing model?
3. **Multi-user**: v0.1 is single-user. When should multi-user with auth be added? v0.3? v1.0?
4. **International**: PQAI covers US patents only. When/how to add EPO, WIPO, JPO coverage?
5. **Figure generation**: Should PatentForge generate patent figures (flowcharts, block diagrams)? If so, which tool? (Graphviz, Mermaid, AI-generated?)
6. **Office Action responses**: Should v1.0+ include AI-assisted Office Action response drafting? This is a major feature in commercial tools (Solve Intelligence, Patlytics).

---

## 11. Glossary

| Term | Definition |
|------|-----------|
| §101 | 35 USC 101 — Patent eligibility (subject matter, Alice/Mayo abstract idea test) |
| §102 | 35 USC 102 — Novelty (is the invention new?) |
| §103 | 35 USC 103 — Non-obviousness (is it an obvious combination of known elements?) |
| §112 | 35 USC 112 — Disclosure requirements (written description, enablement, definiteness) |
| Alice/Mayo | Supreme Court framework for determining if an invention is patent-eligible under §101 |
| CPC | Cooperative Patent Classification — hierarchical code system for patent categories |
| EFS-Web | USPTO Electronic Filing System |
| MPEP | Manual of Patent Examining Procedure — USPTO examiner's handbook |
| Office Action | USPTO examiner's rejection or objection to a patent application |
| PTAB | Patent Trial and Appeal Board — handles inter partes reviews and appeals |
| Prior Art | Any evidence that an invention was known before the filing date |
| RAG | Retrieval-Augmented Generation — combining search retrieval with LLM generation |
| SSE | Server-Sent Events — HTTP-based protocol for real-time server-to-client streaming |
