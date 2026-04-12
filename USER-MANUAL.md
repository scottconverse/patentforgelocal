# PatentForge User Manual — v1.0.0

A step-by-step guide for using PatentForge to research and prepare for a patent consultation.

---

## What Is PatentForge?

PatentForge is a web application that runs on your computer. You describe your invention, and it uses artificial intelligence (Anthropic's Claude) to explore the patent landscape — searching for related patents, identifying potential issues under patent law, and organizing findings into a readable report.

**The goal:** Help you walk into a meeting with a patent attorney prepared — with your invention clearly described, related prior art identified, and the right questions already on the table. PatentForge does the homework so you can make the most of your attorney's time.

**What it is not:** PatentForge is not a lawyer, not a legal service, and does not provide legal advice. The author of this tool is not a lawyer. The AI systems that generate the analysis are not lawyers. No attorney-client relationship is created by using this tool. AI-generated analysis may contain errors, omissions, or hallucinated references. Patent law is complex, and decisions about whether and how to file should always be made with a registered patent attorney or patent agent.

**What it costs:** Each analysis run costs approximately $0.75 to $3.00 in Anthropic API fees (the cost of the AI processing).

---

## How PatentForge Works

![PatentForge Architecture](diagrams/architecture.png)
*PatentForge uses 6 services working together to analyze your invention.*

---

## Installation

### Option A: Download the Installer (Recommended)

The simplest way to install PatentForge is to download the installer for your platform. No Node.js, Python, or git required — everything is bundled.

| Platform | Download | Size |
|----------|----------|------|
| **Windows** | [PatentForge-1.0.0-Setup.exe](https://github.com/scottconverse/patentforge/releases/latest/download/PatentForge-1.0.0-Setup.exe) | ~100 MB |
| **Mac (Beta)** | [PatentForge-1.0.0.dmg](https://github.com/scottconverse/patentforge/releases/latest/download/PatentForge-1.0.0.dmg) | ~100 MB |
| **Linux (Beta)** | [PatentForge-1.0.0.AppImage](https://github.com/scottconverse/patentforge/releases/latest/download/PatentForge-1.0.0.AppImage) | ~120 MB |

**Windows:** Double-click the `.exe` installer. Follow the prompts — accept the license, choose an install location (the default is fine), and click Install. When finished, PatentForge launches automatically.

**Mac (Beta):** Open the `.dmg` file. Drag the PatentForge icon into your Applications folder. Double-click PatentForge in Applications to launch. You may need to right-click and choose "Open" the first time, since the app is not notarized.

**Linux (Beta):** Download the `.AppImage` file. Make it executable (`chmod +x PatentForge-1.0.0.AppImage`) and run it. On some systems you may need to install FUSE first.

Mac and Linux installers are beta — please report issues on [GitHub Issues](https://github.com/scottconverse/patentforge/issues).

### First Launch

When you start PatentForge for the first time:

1. A **system tray icon** appears in your taskbar (Windows) or menu bar (Mac/Linux). This is the PatentForge service manager — it starts and monitors all the background services that power the application.
2. Your **browser opens automatically** to the PatentForge interface.
3. A **Terms of Use** dialog appears. Read it carefully — it explains that PatentForge is a research tool, not a legal service — then click "I Understand and Agree" to continue.
4. The **API key setup wizard** guides you through entering your Anthropic API key.

### First-Time Setup: API Key Wizard

Before you can run any analysis, you need an Anthropic API key:

1. **Get an API key** at [console.anthropic.com](https://console.anthropic.com/). Create a free account and add a small amount of credit (even $5 is enough for several runs).
2. When PatentForge opens for the first time, the **setup wizard** prompts you for your API key. Paste it in (it starts with `sk-ant-`).
3. Select which **AI model** to use (Sonnet is recommended for most users).
4. Click **Save**.

You must configure both an API key and a model before running any analysis. The key is encrypted (AES-256-GCM with a per-installation random salt) and saved in your local database — it is never stored as plain text.

You can change your API key and model at any time in **Settings** (gear icon in the top navigation bar). The navigation bar also has a **Projects** link that takes you back to your project list from anywhere in the app — the link is highlighted when you are on the Projects page.

### System Tray

The PatentForge system tray icon gives you quick access to manage the application:

- **Left-click** the tray icon to open PatentForge in your browser
- **Right-click** to see the menu:
  - **Open PatentForge** — opens the web interface in your default browser
  - **Services** — shows the status of each service (running, stopped, error)
  - **Restart Services** — stops and restarts all services (useful if something gets stuck)
  - **View Logs** — opens the log folder for troubleshooting
  - **Quit** — stops all services and exits PatentForge

The tray app automatically monitors service health and restarts any service that crashes. Log files are rotated to prevent disk space issues.

### Option B: Run from Source (for developers)

If you prefer to run PatentForge from source code:

#### What You Need

1. **A computer** running Windows, macOS, or Linux
2. **Node.js** — a free program that runs JavaScript applications. Download it from [nodejs.org](https://nodejs.org/). Choose the "LTS" (Long Term Support) version. During installation, accept all defaults.
3. **Python 3.11+** — for the claim-drafter, compliance-checker, and application-generator services
4. **An Anthropic API key** — get one at [console.anthropic.com](https://console.anthropic.com/)

#### Steps

1. **Download PatentForge** from [GitHub](https://github.com/scottconverse/patentforge) — click the green "Code" button, then "Download ZIP." Unzip the folder.

2. **Open a terminal** (Command Prompt on Windows, Terminal on Mac/Linux) and navigate to the PatentForge folder:
   ```
   cd path/to/patentforge
   ```

3. **Install the software** by running these commands one at a time:
   ```
   cd backend
   npm install
   cd ..

   cd services/feasibility
   npm install
   cd ../..

   cd frontend
   npm install
   cd ..
   ```
   This downloads all the libraries PatentForge needs. It may take a few minutes.

4. **Set up the database:**
   ```
   cd backend
   npx prisma migrate deploy
   npx prisma generate
   cd ..
   ```

5. **Start PatentForge:**
   - On Windows: double-click `PatentForge.bat`
   - On Mac/Linux: open three terminal windows and run:
     - Terminal 1: `cd backend && npm run build && npm run start`
     - Terminal 2: `cd services/feasibility && npm run build && npm run start`
     - Terminal 3: `cd frontend && npm run dev`

6. **Open your browser** and go to http://localhost:8080

On first launch, a **Terms of Use** dialog will appear. Read it carefully, then click "I Understand and Agree." Then go to **Settings** (gear icon), enter your Anthropic API key, select a model, and click Save.

---

## Using PatentForge

### Step 1: Create a New Project

1. From the home screen, click **"New Project"**
2. Enter a **title** for your invention (e.g., "AI-Powered Soil Moisture Sensor Network")
3. Click **Create**

You'll be taken to the project detail page.

### Deleting a Project

To remove a project and all its data (invention form, analysis, claims, compliance results):

1. From the home screen (project list), find the project you want to delete
2. Click the red **"Delete"** button next to that project
3. A confirmation dialog will appear showing the project name and explaining what will be removed
4. Click **"Delete"** to confirm, or **"Cancel"** to go back

**Warning:** This cannot be undone. All analysis results, claim drafts, and compliance checks for that project will be permanently deleted.

### Step 2: Fill In the Invention Form

The invention form has 11 fields. Only **Title** and **Description** are required, but the more detail you provide, the better the research output will be.

| Field | What to Write |
|-------|--------------|
| **Title** | A short, descriptive name for your invention |
| **Description** | A detailed explanation of what your invention is and how it works. Be as specific as possible. (8,000 character limit — a counter below the field shows how many characters remain.) |
| **Problem Solved** | What problem does your invention solve? Why do people need it? |
| **How It Works** | Technical details about how the invention operates |
| **AI Components** | If your invention uses artificial intelligence or machine learning, describe those parts here |
| **3D Print Components** | If your invention involves 3D-printed parts or physical designs, describe them here |
| **What Is Novel** | What do you believe is new about your invention? What hasn't been done before? |
| **Current Alternatives** | What solutions already exist for the same problem? How is yours different? |
| **What Is Built** | Have you built a prototype? Is this just an idea, or is there working code/hardware? |
| **What To Protect** | What specific aspects of your invention do you want patent protection for? |
| **Additional Notes** | Anything else relevant that doesn't fit in the other fields |

Click **Save Draft** to save your work without starting the analysis.

### Step 3: Run the Analysis

1. Click **"Run Feasibility"** on the project detail page
2. A **cost estimate** dialog will appear showing:
   - **Token cost** — estimated cost for the AI processing, based on historical run data when available (within 25% of actual). The label shows "Based on N previous runs" if historical data exists, or "Estimated (no run history)" for your first run.
   - **Web search cost** — approximately $0.15 for real-time patent and product research
   - **Total estimated cost** — combined estimate
3. Click **"Run Analysis"** to confirm and start

The analysis runs through 6 stages sequentially. You'll see:
- A **stage progress panel** on the left showing which stage is active — stage names are displayed in full (not truncated)
- **Real-time streaming text** on the right as the AI writes its findings
- Each stage takes 1-3 minutes depending on the complexity of your invention

**The 6 stages are:**

1. **Technical Intake & Restatement** — Restates your invention in precise technical language
2. **Prior Art Research** — Searches the web for existing patents, papers, and products
3. **Patentability Analysis** — Maps your invention against the main patent law requirements (35 USC 101, 102, 103, 112)
4. **Deep Dive Analysis** — Detailed examination of domain-specific patent dynamics
5. **IP Strategy & Recommendations** — Presents filing indicators, cost factors, and open questions
6. **Comprehensive Report** — Assembles all findings into a single structured document

### Step 4: Review the Results

When the analysis completes, you'll see:
- The **consolidated report** rendered in the main panel
- **Individual stage outputs** accessible by clicking each stage in the sidebar
- **Total API cost** shown below the stage list

The left sidebar also contains buttons for the post-analysis tools: **Prior Art**, **Claims**, **Compliance**, and **Application**. Each button shows a status badge so you can see at a glance what's been done:

- **Green dot** — that section is complete (e.g., claims have been drafted)
- **Spinning indicator** — that section is currently running
- **Red dot** — that section encountered an error
- **Result count** — when results exist, a small number appears showing how many items were found or generated (e.g., "12 patents" on Prior Art, "20 claims" on Claims)

**On a phone or small screen:** The sidebar sections collapse by default to save space. Tap **"Pipeline"** or **"Actions"** to expand them. Everything works the same — the sections just start closed so you see more of the report.

**Remember:** This output is structured research to help you prepare for a conversation with a patent professional. It is not a legal opinion. The AI's findings may contain errors, omissions, or hallucinated references — including fabricated patent numbers and inaccurate legal citations. All findings should be verified by a qualified patent attorney before making any decisions.

### Step 5: Export Your Report

Click the download buttons at the top of the report:

- **Download HTML** — a styled, printable report you can share with your attorney
- **Download Word** — a .docx file you can open in Microsoft Word or Google Docs
- **Download** (on individual stages) — saves that stage's output as a .md (Markdown) file

Files are saved to your browser's Downloads folder.

---

## Prior Art Discovery

When you run an analysis, PatentForge automatically searches for related patents using the USPTO Open Data Portal (ODP). Results appear in a **Prior Art panel** on the project detail page.

Each result shows:
- **Patent title** and number
- **Relevance score** (a colored bar showing textual similarity to your invention description)
- **Abstract snippet** explaining what the patent covers
- A **link to Google Patents** where you can read the full patent

The prior art results are also provided as context to Stage 2, so the AI considers them during its research.

**Note:** This is an automated search of U.S. patents with improved relevance scoring (common patent stop-words are filtered, title matches are weighted higher than abstract matches). It is not exhaustive. A patent attorney will typically conduct a more thorough professional search using specialized databases.

**USPTO API key (optional but recommended):** Add a free ODP API key in Settings to enable structured patent search and patent claims viewing. Without it, the AI analysis still uses web search for prior art research in Stage 2. To get an ODP API key (free), register at [data.uspto.gov](https://data.uspto.gov/myodp). This requires a USPTO.gov account with ID.me identity verification.

### Clicking a Prior Art Result

When prior art results are available, click any patent card to open a **detail drawer** on the right side of the screen. The drawer shows:

- **Patent number** (linked to Google Patents)
- **Filing date** and **grant date**
- **Assignee(s)** — who owns the patent
- **Inventor(s)**
- **CPC classifications** — the patent categories assigned by the patent office
- **Full claims text** — expandable section showing all patent claims. If you have a USPTO API key configured in Settings, clicking the Claims section will fetch the actual patent claims text from the USPTO. A loading spinner appears while the claims are being retrieved. Once loaded, claims are cached locally so they appear instantly on subsequent views. Without a USPTO key, a "View on Google Patents" link is shown instead.
- **Patent Family** — expandable section showing related patents in the same patent family. Click to load continuity data from the USPTO, which shows parent patents, child applications, continuations, divisionals, and continuations-in-part. Each family member shows its relationship type, status (granted, pending, or abandoned), filing/grant dates, and a link to Google Patents. This helps you understand the full patent landscape around a prior art result. Requires a USPTO API key.

If the patent data service is unavailable, the drawer will show a message with a link to view the patent directly on Google Patents.

### Exporting Prior Art as CSV

When a prior art search is complete, click the **Export CSV** button at the top of the Prior Art panel. This downloads a spreadsheet with columns for patent number, title, dates, assignees, inventors, CPC codes, relevance score, and abstract. You can open this file in Excel or Google Sheets.

---

## Generating Claim Drafts

After completing a feasibility analysis, you can generate AI-drafted patent claims.

### How to Generate Claims

1. On your project detail page, click the **Claims** button in the left sidebar
2. If you haven't run a feasibility analysis yet, you'll see a message telling you to run one first
3. Click **Generate Draft Claims**
4. A **legal acknowledgment dialog** will appear. Read it carefully — it explains that these are draft research concepts, not filing-ready claims. Check the box and click **Generate Draft Claims** to proceed
5. Wait 2-5 minutes while the AI plans, drafts, and reviews your claims
6. When complete, you'll see your claims organized by independent claim (broad, medium, narrow)

### Understanding the Claims

PatentForge generates three types of claims:
- **Independent claims** — broad, medium, and narrow scope versions, each using a different statutory type (method, system, apparatus)
- **Dependent claims** — narrower versions that add specific limitations to an independent claim
- Total is capped at 20 claims (the USPTO fee boundary)

### Exporting Claims as Word

Click the **"Export Word"** button at the top of the Claims tab to download a .docx file containing all your claims, formatted with proper numbering and including the standard UPL disclaimer. You can share this file with your patent attorney.

### Editing Claims

Hover over any claim text to see a pencil icon and a subtle border — this indicates the text is editable. Click the claim text to open an inline editor. Make your changes, then click **Save** to keep them or **Cancel** to discard.

### Claim Tree View

Above the claims list, you'll see a **List / Tree** toggle. Click **Tree** to switch to a visual tree diagram that shows the hierarchy of your claims:
- **Independent claims** appear as blue nodes at the top
- **Dependent claims** appear as gray nodes below, connected by lines to their parent claim
- Click any node to switch back to list view and jump to that claim for editing

This view is useful for quickly understanding how your claims relate to each other and verifying the dependency structure.

### Viewing Strategy and Feedback

Below the claims, you'll find collapsible sections:
- **Planner Strategy** — the AI's reasoning about claim scope, prior art avoidance, and claim type selection
- **Examiner Feedback** — the AI examiner's critique of each claim, including §101/§102/§103/§112 analysis

### Important Limitations

These claims are **DRAFT RESEARCH CONCEPTS**. They are:
- NOT reviewed by a patent attorney
- NOT suitable for filing without professional review
- Potentially too broad, too narrow, or using language that would not survive examination
- Generated by AI that may fabricate technical details

**Every claim must be reviewed, revised, and finalized by a registered patent attorney before any patent application filing.**

---

## Checking Compliance

After generating claim drafts, you can run an automated compliance check to see if your claims follow the rules that patent examiners will look at during examination. This is like a spell-checker, but for patent law requirements.

### What Compliance Checking Does

The compliance checker runs four automated checks on your claim drafts:

| Check | What It Looks For |
|-------|------------------|
| **Written Description (35 USC 112a)** | Does your invention description actually support what the claims say? If a claim mentions a feature that isn't described in your invention form, this check flags it. |
| **Definiteness (35 USC 112b)** | Are the claims written clearly? This catches vague language, terms used without proper introduction (called "antecedent basis"), and ambiguous phrasing that a patent examiner would reject. |
| **Formalities (MPEP 608)** | Are the claims formatted correctly? This checks numbering, proper dependency chains (e.g., "The method of claim 1" actually referring to a real claim), and structural formatting rules from the patent office handbook. |
| **Eligibility (35 USC 101)** | Is the claimed invention the kind of thing that can be patented? This applies the Alice/Mayo framework — a legal test that checks whether claims are directed to abstract ideas without enough concrete, technical substance. |

### How to Run Compliance Checks

1. On your project detail page, click the **Compliance** tab in the left sidebar
2. If you haven't generated claim drafts yet, you'll see a message telling you to generate claims first
3. A **legal acknowledgment dialog** will appear (similar to the one for claim drafting). Read it, check the box, and click **Run Compliance Check**
4. Wait 1-3 minutes while the checker analyzes each claim against each rule
5. When complete, you'll see results for every claim

### Reading the Results

Each claim shows a colored status for each of the four checks:

- **Green (PASS)** — This claim looks good for this particular rule. No issues detected.
- **Red (FAIL)** — This claim has a problem that a patent examiner would likely reject. The result includes a specific explanation of what's wrong and a suggestion for how to fix it.
- **Yellow (WARN)** — This claim might have an issue, but it's not clear-cut. Review the explanation and consider whether a change would strengthen the claim.

Each result includes:
- **What the issue is** — a plain-language explanation of the problem
- **MPEP citation** — a reference to the specific section of the Manual of Patent Examining Procedure (the official handbook that patent examiners use). For example, "MPEP 2173.05(e)" points to the section about antecedent basis. You don't need to look these up, but your patent attorney will find them useful.
- **Suggested fix** — a concrete suggestion for how to address the issue

### Fixing Issues and Re-Checking

1. Review the compliance results and note which claims have FAIL or WARN status
2. Go back to the **Claims** tab and edit the flagged claims (click the claim text to edit)
3. Alternatively, click the **regenerate** button on an individual claim to have the AI rewrite just that one claim — you don't need to re-run the entire claim drafting pipeline
4. Return to the **Compliance** tab and click **Re-Check** to run the checks again on your updated claims
5. Repeat until you're satisfied with the results

### Prior Art Overlap Warnings

Some claims may show an amber warning icon indicating that terms in the claim overlap with known prior art references from your feasibility analysis. This doesn't necessarily mean the claim is invalid — it means your patent attorney should pay special attention to how those claims distinguish your invention from existing patents.

### Important Limitations

Compliance checking is **automated research, not legal review**. The results are:
- Generated by AI analyzing your claims against legal rules — not by a patent attorney
- Potentially incomplete — the checker may miss issues that a human examiner would catch
- Not a guarantee of patentability — a PASS result means the AI didn't find an obvious problem, not that the claim will survive examination

### Exporting Compliance Results as Word

Click the **"Export Word"** button at the top of the Compliance tab to download a .docx file containing the full compliance results: per-claim status, MPEP citations, and suggested fixes. This is useful for sharing with your patent attorney alongside the claims export.

All compliance results are marked "RESEARCH OUTPUT — NOT LEGAL ADVICE." **Always have a registered patent attorney review your claims before filing.**

---

## Generating a Patent Application

Once you have drafted claims for your invention, you can generate a complete patent application document.

### What You'll Need First

Before generating an application, you need:
- A completed **feasibility analysis** (all 6 stages)
- **Drafted claims** (from the Claims tab)

You don't need to run compliance checks first, but it's recommended.

### Step by Step

1. Open your project and click the **Application** button in the left sidebar
2. Click **Generate Application**
3. A disclaimer will appear reminding you this is a research tool, not legal advice. Check the box and click **Generate Application**
4. Wait while the AI generates your application sections. This takes 3-8 minutes — you'll see a spinner while it works
5. When complete, you'll see your application with all sections listed in the left panel

### Application Sections

Your generated application includes these sections:

- **Title** — pulled from your invention title
- **Cross-References** — for references to related patent applications you've filed (this starts empty — click "Add Cross-References" to fill it in)
- **Background of the Invention** — describes the field and existing solutions
- **Summary of the Invention** — overview of what your invention does
- **Detailed Description** — the full technical specification
- **Claims** — your drafted claims from the Claims tab
- **Abstract** — a 150-word summary
- **Figure Descriptions** — placeholder descriptions for patent drawings
- **Information Disclosure Statement (IDS)** — lists all prior art references found during your prior art search

### Editing Sections

Click **Edit** on any section to modify the text. Click **Save** when done, or **Cancel** to discard changes. The Cross-References section is intentionally empty — add references to any related patent applications you've filed (provisionals, continuations, etc.).

### Exporting Your Application

Click **Export Word** to download a formatted Word document (.docx) that follows USPTO formatting requirements:
- US Letter size with correct margins
- Times New Roman 12pt font with 1.5 line spacing
- Sequential paragraph numbering [0001], [0002], etc.
- Claims and Abstract on separate pages
- A watermark on every page reminding you to have it reviewed by a patent attorney

Click **Export Markdown** to download a plain text version.

### If the IDS Is Empty

If you see a yellow warning that the "Information Disclosure Statement is empty," it means no prior art search was completed. To fix this:

1. Go to **Settings** and enter a USPTO Open Data Portal API key (free at [beta-data.uspto.gov/apis](https://beta-data.uspto.gov/apis))
2. Go to the **Prior Art** tab and run a prior art search
3. Come back to the Application tab and click **Regenerate**

### Important Reminder

The generated application is an **AI-drafted research document**. It is **not** a legal filing. Every section must be reviewed, revised, and finalized by a registered patent attorney before filing with the USPTO.

---

## Re-running Individual Stages

After a completed analysis, you can re-run any individual stage without restarting the entire pipeline. This is useful if you've updated your invention description and want to see how a specific stage's output changes.

1. Look at the **stage list** in the left sidebar
2. Each completed stage shows a small **"re-run"** link on the right side
3. Click "re-run" on the stage you want to re-run
4. PatentForge creates a new version of the analysis, copies all stages before your selected stage, and re-runs from that point through Stage 6

**Note:** Re-running a stage also re-runs all stages after it, because each stage depends on the output of the stages before it. For example, re-running Stage 3 will also re-run Stages 4, 5, and 6. The cost estimate reflects only the stages being re-run.

Your previous analysis version is preserved — you can view it in the **History** section.

### History Run Cards

The History section lists all previous runs for a project. Each card shows the run version, date, status, and cost.

- **Completed runs** show a link to view the report for that version.
- **ERROR and CANCELLED runs** show a **Re-run** button so you can try again, along with "No report available" (since those runs never produced a finished report). Click Re-run to start a new analysis from the beginning.
- Runs that are still in progress show their current status.

---

## Settings

Access settings via the gear icon in the navigation bar. A **"Projects / Settings"** breadcrumb at the top of the page lets you navigate back to the project list.

| Setting | What It Does | Default |
|---------|-------------|---------|
| **Anthropic API Key** | Your Claude API key (required). Encrypted at rest. | — |
| **USPTO API Key** | Free key from data.uspto.gov for enhanced patent search and claims viewing. Encrypted at rest. | — |
| **Default Model** | Required. Which AI model to use. Must be selected before running analysis. | — |
| **Research Model** | Optional separate model for the research stage | — |
| **Max Tokens** | Maximum length of each stage's response | 32,000 |
| **Inter-Stage Delay** | Seconds to wait between stages (prevents rate limiting) | 5 |
| **Export Path** | Folder where reports are saved on the server. When running locally, files download to your browser's Downloads folder. | — |
| **Cost Cap (USD)** | Enforced server-side: blocks new analysis or claim drafting runs when cumulative project cost reaches this amount. Also checked mid-pipeline — if a stage pushes cost over the cap, the pipeline is cancelled. Set to 0 to disable. | $5.00 |

Below the settings form, the **ODP API Usage** card shows a weekly summary of your USPTO Open Data Portal API activity: total queries, results returned, and any rate limit events. This helps you monitor your API usage if you have a free ODP key configured.

**Model choices:**
- **Sonnet** (recommended) — good balance of quality and cost
- **Opus** — highest quality, slowest, most expensive
- **Haiku** — fastest and cheapest, lower quality

---

## Troubleshooting

### "No API key configured"

You need to enter your Anthropic API key in Settings before running an analysis. See the "First-Time Setup" section above.

### Analysis stops mid-way

If the analysis stops before completing all 6 stages (due to a network issue, rate limit, or browser crash):
1. Go back to the project detail page
2. You'll see a **"Resume"** button next to the partially completed run
3. Click Resume — it picks up from the last completed stage
4. The cost estimate will reflect only the remaining stages

If the project enters a full error state (the entire run failed rather than stalling), the project detail page shows two buttons: **Retry** (starts a new run from the beginning) and **Back to Projects** (returns to the project list without retrying). Use Retry if you want to try again immediately, or Back to Projects if you want to revisit your invention form first.

### "Rate limited" error

This means you've sent too many requests to the Anthropic API in a short time. PatentForge automatically retries with increasing delays (60s, 90s, 120s). If it still fails:
- Wait 5 minutes and try again
- Increase the "Inter-Stage Delay" in Settings to 10 or 15 seconds

### The page shows a loading spinner that won't stop

Try refreshing the page (F5 or Ctrl+R). If a pipeline was running when the page loaded, PatentForge detects the stale state and shows you the partial results with a Resume option.

### "Cost cap exceeded"

Your cumulative API spending for this project has reached your cost cap. PatentForge tracks cost across all completed stages and blocks new runs when the total exceeds the cap you set in Settings. If a stage pushes the cost over the cap mid-pipeline, the pipeline is cancelled automatically.

To continue:
1. Go to **Settings**
2. Increase the **Cost Cap (USD)** to a higher value, or set it to **0** to disable the cap entirely
3. Return to your project and start the run again

### "No AI model configured"

You need to select a model in Settings before running analysis or generating claims. PatentForge does not pick a default model for you — you choose which AI model to use based on your quality and cost preferences.

### "A claim draft is already running"

Only one claim draft can run at a time per project. Wait for the current draft to complete, or refresh the page — if a previous draft was interrupted by a crash, PatentForge automatically cleans it up on restart.

### "Export path must be within your home directory"

For security, the export folder must be inside your home directory. Paths like `/etc` or `C:\Windows` are rejected. Use a subfolder of your Desktop, Documents, or home directory.

### I can't connect to http://localhost:8080

Make sure all six services are running:
- Backend on port 3000
- Feasibility service on port 3001
- Claim drafter on port 3002
- Application generator on port 3003
- Compliance checker on port 3004
- Frontend on port 8080

If you used `PatentForge.bat`, check that the terminal windows are open and not showing errors.

---

## Glossary

| Term | Plain English Definition |
|------|------------------------|
| **API key** | A password-like code that lets PatentForge access the Claude AI service |
| **Claude** | The AI model made by Anthropic that PatentForge uses for analysis |
| **LLM** | Large Language Model — the type of AI that powers Claude |
| **Patent** | A legal document that gives you the exclusive right to make, use, or sell an invention for a limited time |
| **Prior art** | Any evidence that something similar to your invention already existed before you invented it |
| **SSE** | Server-Sent Events — the technology that lets you see the AI's response appear word by word |
| **35 USC 101** | The law defining what kinds of things can be patented |
| **35 USC 102** | The law requiring that your invention be new (novel) |
| **35 USC 103** | The law requiring that your invention not be an obvious combination of known things |
| **35 USC 112** | The law requiring that a patent application clearly describe how to make and use the invention |
| **Token** | A small unit of text (roughly 3/4 of a word) used to measure AI processing costs |
| **Independent claim** | A patent claim that stands on its own — it defines the invention without referring to any other claim |
| **Dependent claim** | A patent claim that refers to and narrows another claim (e.g., "The method of claim 1, wherein...") |
| **Claim scope** | How broad or narrow a claim is — broader claims cover more but are easier to invalidate, narrower claims are more defensible |
| **Statutory type** | The legal category of a claim — method (process), system (machine), apparatus (device), or computer-readable medium (software) |
| **Patent family** | A group of related patents and applications that share a common origin — including parent patents, continuations, divisionals, and continuations-in-part |
| **Continuation** | A patent application filed to pursue additional claims based on the same invention described in an earlier (parent) application |
| **Divisional** | A patent application split off from a parent application when the patent office determines the parent covers more than one distinct invention |
| **MPEP** | Manual of Patent Examining Procedure — the official handbook that patent examiners use when reviewing patent applications. Compliance check results cite specific MPEP sections. |
| **Antecedent basis** | A rule requiring that every term in a patent claim be properly introduced before it is referenced. For example, you must say "a sensor" before you can say "the sensor." |
| **Alice/Mayo framework** | A two-step legal test used to determine whether a patent claim is directed to an abstract idea (like a mathematical formula) without enough concrete technical substance to be patentable |
| **Compliance check** | An automated review of patent claims against legal requirements — checking format, clarity, support in the description, and eligibility for patent protection |

---

*PatentForge is a research tool, not a legal service. The author of this tool is not a lawyer. The AI systems that generate the analysis are not lawyers. No attorney-client relationship is created by using this tool. It does not provide legal advice. Always consult a registered patent attorney or patent agent before making patent filing decisions.*
