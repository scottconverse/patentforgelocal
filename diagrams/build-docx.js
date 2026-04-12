const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, Footer, AlignmentType, HeadingLevel, BorderStyle,
  WidthType, ShadingType, PageBreak, PageNumber, LevelFormat, ExternalHyperlink
} = require("docx");

const OUT = path.resolve(__dirname, "..");
const IMG = __dirname;

const blue_dark = "1B3A5C";
const blue_mid = "2E75B6";
const green = "548235";
const gray = "595959";
const light_bg = "F2F6FA";
const white = "FFFFFF";

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

function headerCell(text, width) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: blue_dark, type: ShadingType.CLEAR },
    margins: cellMargins,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF", font: "Arial", size: 18 })] })],
  });
}

function dataCell(text, width, bold) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: white, type: ShadingType.CLEAR },
    margins: cellMargins,
    children: [new Paragraph({ children: [new TextRun({ text, font: "Arial", size: 18, color: gray, bold: !!bold })] })],
  });
}

function makeImage(filename, w, h) {
  const data = fs.readFileSync(path.join(IMG, filename));
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    children: [new ImageRun({
      type: "png",
      data,
      transformation: { width: w, height: h },
      altText: { title: filename, description: filename, name: filename },
    })],
  });
}

function heading(text, level) {
  return new Paragraph({ heading: level, spacing: { before: 300, after: 150 }, children: [new TextRun({ text, font: "Arial" })] });
}

function para(text, opts) {
  return new Paragraph({
    spacing: { after: 120 },
    ...opts,
    children: [new TextRun({ text, font: "Arial", size: 22, color: gray, ...(opts && opts.run ? opts.run : {}) })],
  });
}

function boldPara(label, text) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({ text: label, font: "Arial", size: 22, color: blue_dark, bold: true }),
      new TextRun({ text, font: "Arial", size: 22, color: gray }),
    ],
  });
}

// Build stages table
const stagesTable = new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [600, 2800, 1200, 4760],
  rows: [
    new TableRow({ children: [headerCell("#", 600), headerCell("Stage Name", 2800), headerCell("Web Search", 1200), headerCell("Purpose", 4760)] }),
    ...([
      ["1", "Technical Intake & Restatement", "No", "Restates invention in precise technical/legal terms"],
      ["2", "Prior Art Research", "Yes (20)", "LLM-powered prior art search via web"],
      ["3", "Patentability Analysis", "Yes (5)", "101 eligibility, 102 novelty, 103 obviousness, 112 enablement"],
      ["4", "Deep Dive Analysis", "Yes (10)", "Specialized analysis of AI/ML and 3D printing elements"],
      ["5", "IP Strategy & Recommendations", "No", "Filing strategy, cost estimates, claim directions, timeline"],
      ["6", "Comprehensive Report", "No", "Assembles all findings into professional report"],
    ].map(row => new TableRow({ children: row.map((c, i) => dataCell(c, [600, 2800, 1200, 4760][i])) }))),
  ],
});

// Compliance checks table
const complianceTable = new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [2500, 1800, 5060],
  rows: [
    new TableRow({ children: [headerCell("Check", 2500), headerCell("Statute", 1800), headerCell("What It Catches", 5060)] }),
    ...([
      ["Written Description", "35 USC 112(a)", "Specification doesn't support the claims"],
      ["Enablement", "35 USC 112(a)", "Specification doesn't teach how to make/use"],
      ["Definiteness", "35 USC 112(b)", "Ambiguous claim language, missing antecedent basis"],
      ["Formalities", "MPEP 608", "Format, numbering, dependency chain errors"],
      ["Abstract Eligibility", "35 USC 101", "Alice/Mayo framework abstract idea test"],
    ].map(row => new TableRow({ children: row.map((c, i) => dataCell(c, [2500, 1800, 5060][i])) }))),
  ],
});

// Technology sources table
const techTable = new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [2000, 3360, 1000, 1000, 2000],
  rows: [
    new TableRow({ children: [headerCell("Component", 2000), headerCell("Source", 3360), headerCell("License", 1000), headerCell("Stars", 1000), headerCell("Status", 2000)] }),
    ...([
      ["Central Backend", "AutoBE (wrtnio/autobe)", "MIT", "\u2014", "Active"],
      ["Feasibility Pipeline", "patent-analyzer-app (private)", "Proprietary", "\u2014", "Active"],
      ["Prior Art ML Search", "pqaidevteam/pqai", "MIT", "115", "Active"],
      ["Claim Drafting", "AutoPatent + M-Cube", "MIT", "188 / 117", "Active"],
      ["Compliance RAG", "Claude-Patent-Creator", "MIT", "51", "Active"],
      ["USPTO Data (Go)", "smcronin/uspto-cli", "MIT", "31", "Active"],
      ["USPTO Data (Python)", "DunlapCoddingPC/pyUSPTO", "MIT", "2", "Active"],
      ["Patent Image Search", "TIBHannover/iPatent", "MIT", "2", "Early"],
      ["Bulk Data Sync", "patent-dev/bulk-file-loader", "MIT", "\u2014", "Active"],
      ["USPTO APIs", "USPTO Open Data Portal", "Public", "\u2014", "Active"],
    ].map(row => new TableRow({ children: row.map((c, i) => dataCell(c, [2000, 3360, 1000, 1000, 2000][i])) }))),
  ],
});

// Release phases table
const releaseTable = new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [900, 2460, 3000, 3000],
  rows: [
    new TableRow({ children: [headerCell("Phase", 900), headerCell("Services", 2460), headerCell("What Ships", 3000), headerCell("User Gets", 3000)] }),
    ...([
      ["v0.1", "Backend + Feasibility + Frontend", "Web patent feasibility analyzer", "Cross-platform WPF replacement"],
      ["v0.2", "+ Prior Art Service (PQAI API)", "ML prior art search", "Structured search alongside LLM"],
      ["v0.3", "+ USPTO Data Service", "Patent data enrichment", "Real patent lookups, prosecution"],
      ["v0.4", "+ Claim Drafting Service", "AI claim generation", "Claims informed by prior art"],
      ["v0.5", "+ Compliance Service", "Legal compliance checks", "112a/112b/MPEP validation"],
      ["v0.6", "+ Application Generator", "Full patent application export", "Word/PDF ready for filing"],
      ["v1.0", "+ Portfolio Dashboard", "Prosecution tracking", "Full lifecycle management"],
    ].map(row => new TableRow({ children: row.map((c, i) => dataCell(c, [900, 2460, 3000, 3000][i], i === 0)) }))),
  ],
});

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: blue_dark },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: blue_mid },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: green },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
    }],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: blue_mid, space: 4 } },
          children: [
            new TextRun({ text: "PatentForge", font: "Arial", size: 18, bold: true, color: blue_dark }),
            new TextRun({ text: "   Architecture & Design Document", font: "Arial", size: 18, color: gray }),
          ],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 4 } },
          children: [
            new TextRun({ text: "CONFIDENTIAL  |  v0.1.0-draft  |  Page ", font: "Arial", size: 16, color: gray }),
            new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: gray }),
          ],
        })],
      }),
    },
    children: [
      // ========== TITLE PAGE ==========
      new Paragraph({ spacing: { before: 3000 } }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "PatentForge", font: "Arial", size: 72, bold: true, color: blue_dark })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: "Architecture & Design Document", font: "Arial", size: 36, color: blue_mid })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "Full-Lifecycle Patent Analysis Platform", font: "Arial", size: 24, color: gray, italics: true })] }),
      new Paragraph({ spacing: { before: 1500 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Version 0.1.0-draft  |  March 30, 2026  |  Pre-development", font: "Arial", size: 20, color: gray })] }),
      new Paragraph({ children: [new PageBreak()] }),

      // ========== SECTION 1: VISION ==========
      heading("1. Vision", HeadingLevel.HEADING_1),
      para("PatentForge is an open-source, full-lifecycle patent platform that takes an inventor from \"I have an idea\" to \"here's a draft patent application with prior art citations, compliance checks, and a filing strategy\" \u2014 then tracks the patent through prosecution. It is the only open-source tool that covers the entire patent lifecycle in one platform."),
      new Paragraph({ children: [new PageBreak()] }),

      // ========== SECTION 2: SYSTEM ARCHITECTURE ==========
      heading("2. System Architecture", HeadingLevel.HEADING_1),
      heading("2.1 Federated Service Model", HeadingLevel.HEADING_2),
      para("PatentForge uses a federated architecture: a central backend orchestrates independent specialized services that each own one capability. Services communicate over HTTP/JSON and can be developed, deployed, scaled, and replaced independently."),
      makeImage("architecture.png", 620, 465),

      heading("2.2 Central Backend (AutoBE-Generated)", HeadingLevel.HEADING_2),
      para("The central backend is generated by AutoBE from a natural language requirements specification. It provides:"),
      boldPara("Project State Machine: ", "INTAKE \u2192 FEASIBILITY \u2192 PRIOR_ART \u2192 DRAFTING \u2192 COMPLIANCE \u2192 APPLICATION \u2192 FILED. Downstream stages are marked STALE when upstream stages are re-run."),
      boldPara("Service Adapters: ", "Manually written TypeScript adapters that call each specialized service (feasibility, prior art, drafting, compliance, USPTO) via HTTP."),
      boldPara("Unified Event Bus: ", "SSE endpoint that streams events from all services to the frontend in a common envelope format."),
      boldPara("Document Versioning: ", "Every artifact is versioned per project. Re-running a stage creates a new version without deleting history."),
      boldPara("Technology Stack: ", "NestJS (TypeScript), Prisma ORM + PostgreSQL, SSE streaming, generated by AutoBE with 100% compilation guarantee."),

      heading("2.3 Database Schema", HeadingLevel.HEADING_2),
      para("The database uses Prisma ORM with PostgreSQL (production) or SQLite (development). The schema is designed around the patent lifecycle stages:"),
      makeImage("database-schema.png", 640, 394),
      new Paragraph({ children: [new PageBreak()] }),

      // ========== SECTION 3: SERVICE SPECIFICATIONS ==========
      heading("3. Service Specifications", HeadingLevel.HEADING_1),

      heading("3.1 Feasibility Service", HeadingLevel.HEADING_2),
      boldPara("Source: ", "Ported from scottconverse/patent-analyzer-app (C#/.NET 8 \u2192 TypeScript)"),
      para("Runs a 6-stage sequential AI analysis pipeline that evaluates whether an invention is patentable and provides a filing strategy."),
      stagesTable,
      para("Each stage receives all previous stage outputs as context. The service streams tokens to the caller via SSE for real-time display. Rate limit retry with escalating delays (60s/90s/120s). Supports cancellation at any point.", { spacing: { before: 200 } }),

      heading("3.2 Prior Art Service", HeadingLevel.HEADING_2),
      boldPara("Source: ", "PQAI (MIT) by Georgia IP Alliance + AT&T \u2014 ML-powered semantic patent search trained on historical patent examiner decisions."),
      para("9-stage pipeline: query preprocessing \u2192 CPC index selection \u2192 SentenceTransformer vectorization \u2192 relevance feedback \u2192 FAISS vector search \u2192 post-retrieval filtering \u2192 MatchPyramid reranking \u2192 snippet extraction \u2192 result assembly."),
      para("Integration options: PQAI public API (zero setup, free) or self-hosted (6 Docker containers, full control). Covers US patents via USPTO bulk data."),

      heading("3.3 Claim Drafting Service", HeadingLevel.HEADING_2),
      boldPara("Source: ", "Architecture patterns from AutoPatent (MIT, 188 stars) and M-Cube (MIT, 117 stars)."),
      para("Multi-agent system: Planner (builds claim tree via PGTree) \u2192 Writer (drafts claim language per node) \u2192 Examiner (reviews for quality and gaps) \u2192 revision loop. Claims are informed by prior art results and feasibility analysis."),

      heading("3.4 Compliance Service", HeadingLevel.HEADING_2),
      boldPara("Source: ", "Extracted from Claude-Patent-Creator (MIT, 51 stars) \u2014 hybrid RAG over MPEP/USC/CFR."),
      complianceTable,
      para("Uses BM25 keyword search + FAISS dense vector search over the legal corpus, merged and reranked. LLM evaluates claims against retrieved passages and returns structured pass/fail/warn results with MPEP citations.", { spacing: { before: 200 } }),

      heading("3.5 USPTO Data Service", HeadingLevel.HEADING_2),
      boldPara("Source: ", "USPTO-CLI (MIT, Go, 50+ endpoints) + pyUSPTO (MIT, Python, 9 APIs including Office Action retrieval)."),
      para("Provides patent bibliographic data, family trees, prosecution timelines, PTAB proceedings, and full-text search. Wraps the USPTO Open Data Portal (38 API endpoints, free, rate-limited)."),
      new Paragraph({ children: [new PageBreak()] }),

      // ========== SECTION 4: USER JOURNEY ==========
      heading("4. User Journey & UX Design", HeadingLevel.HEADING_1),
      para("The user journey follows the patent lifecycle through 7 stages, from invention disclosure to USPTO filing and prosecution tracking:"),
      makeImage("user-journey.png", 650, 232),

      heading("4.1 Cross-Stage Data Flow", HeadingLevel.HEADING_2),
      para("Each stage feeds forward into the next. The central backend manages routing and data assembly:"),
      makeImage("data-flow.png", 600, 436),
      para("When compliance checks fail, the system routes issues back to the claim drafter for targeted revision (red dashed arrow), then re-runs only the affected compliance checks."),
      new Paragraph({ children: [new PageBreak()] }),

      // ========== SECTION 5: DEPLOYMENT ==========
      heading("5. Deployment", HeadingLevel.HEADING_1),
      para("All services are containerized and orchestrated via Docker Compose. A single \"docker compose up\" command starts the entire platform."),
      makeImage("docker-topology.png", 620, 362),
      para("v0.1 MVP requires only 4 containers: frontend, backend, feasibility, and postgres. Additional services are added one at a time as they are built."),
      new Paragraph({ children: [new PageBreak()] }),

      // ========== SECTION 6: TECHNOLOGY SOURCES ==========
      heading("6. Technology Sources & Licenses", HeadingLevel.HEADING_1),
      para("All source components are MIT-licensed (commercially safe) or public government APIs:"),
      techTable,
      new Paragraph({ children: [new PageBreak()] }),

      // ========== SECTION 7: RELEASE PHASES ==========
      heading("7. Release Phases", HeadingLevel.HEADING_1),
      para("The platform ships incrementally. Each phase is independently useful:"),
      releaseTable,
    ],
  }],
});

Packer.toBuffer(doc).then(buffer => {
  const outPath = path.join(OUT, "PatentForge-Architecture.docx");
  fs.writeFileSync(outPath, buffer);
  console.log("Written:", outPath, "(" + (buffer.length / 1024).toFixed(0) + " KB)");
});
