# PatentForgeLocal User Manual — v0.1.1

A step-by-step guide for using PatentForgeLocal to research and prepare for a patent consultation.

---

## 1. What Is PatentForgeLocal?

PatentForgeLocal is a program that runs on your computer. You describe your invention, and it uses artificial intelligence to analyze whether your idea might be patentable. It searches for similar patents, identifies potential legal issues, and produces a detailed report you can take to a patent attorney.

Everything happens on your machine. The AI model — the "brain" that does the analysis — runs locally on your computer. Your invention description never leaves your machine. There are no cloud servers, no subscriptions, and no per-use fees.

### What It Does

- **Searches for similar patents** (called "prior art") to see if something like your invention already exists
- **Analyzes your invention's novelty** — what makes it different from what came before
- **Identifies potential legal issues** under U.S. patent law
- **Generates a detailed report** summarizing its findings
- **Drafts patent claims** — the specific legal boundaries that define what your patent would protect
- **Generates a draft patent application** — the full document you would file with the patent office
- **Checks compliance** — reviews your claims against patent law requirements

### What It Is NOT

PatentForgeLocal is **not a lawyer, not a legal service, and does not provide legal advice**. The author of this tool is not a lawyer. The AI that generates the analysis is not a lawyer. No attorney-client relationship is created by using this tool.

AI-generated analysis may contain errors, omissions, or fabricated references — including made-up patent numbers and inaccurate legal citations. Patent law is complex, and decisions about whether and how to file should always be made with a registered patent attorney or patent agent.

### What It Costs

**Nothing.** The AI runs entirely on your computer. There is no subscription, no per-use fee, and no cloud service to pay for. You download it once, and it works forever.

### Your Privacy

Your invention description **never leaves your computer**. No data is sent to any external server unless you specifically enable optional features (web search or USPTO patent database lookups). Even then, only search terms are sent — never your full invention description. See Section 14 (Privacy & Security) for complete details.

---

## 2. System Requirements

PatentForgeLocal runs an AI model on your computer, which requires more computing power than a typical application. Here is what you need.

### Minimum Requirements

| Resource | Minimum | What This Means |
|----------|---------|-----------------|
| **RAM** | 16 GB | RAM is your computer's short-term working memory. The AI model needs a large amount of it to run. |
| **Free disk space** | 25 GB | The AI model file is about 18 GB, plus space for the program itself and your projects. |
| **Processor (CPU)** | 4 cores, 2018 or newer | The processor is your computer's "brain." Most computers made after 2018 will work. |
| **Operating system** | Windows 10+, macOS 12+, or Ubuntu 22+ | The version of Windows, Mac, or Linux your computer runs. |

### Recommended (for Faster Analysis)

| Resource | Recommended | Why It Helps |
|----------|-------------|--------------|
| **RAM** | 32 GB or more | More RAM lets the AI process longer invention descriptions and produce more detailed analysis. |
| **Free disk space** | 50 GB or more | Extra space for multiple projects and exported documents. |
| **Processor (CPU)** | 8 cores or more | More cores means faster analysis — stages complete in less time. |
| **Graphics card (GPU)** | 8 GB VRAM or more | A dedicated graphics card with its own memory dramatically speeds up AI processing. NVIDIA cards with CUDA support work best. |

### How to Check Your Computer's Specs

**On Windows:**
1. Press the **Windows key + I** to open Settings
2. Click **System**, then **About**
3. Look for "Installed RAM" and "Processor"
4. To check disk space: open File Explorer, right-click your C: drive, and click Properties
5. To check your graphics card: press **Windows key**, type "Device Manager," open it, and expand "Display adapters"

**On Mac:**
1. Click the **Apple menu** (top-left corner of your screen) and choose **About This Mac**
2. You will see your processor, memory (RAM), and macOS version
3. To check disk space: click the Apple menu, choose **System Settings**, then **General**, then **Storage**
4. To check your graphics card: in About This Mac, look for "Graphics" or "GPU"

**On Linux (Ubuntu):**
1. Open a terminal (press Ctrl+Alt+T)
2. Type `free -h` and press Enter to see your RAM
3. Type `df -h /` and press Enter to see your disk space
4. Type `lscpu` and press Enter to see your processor details
5. Type `lspci | grep -i vga` and press Enter to see your graphics card

---

## 3. Installation

### Step 1: Download the Installer

Go to the PatentForgeLocal releases page on GitHub:

**https://github.com/scottconverse/patentforgelocal/releases/latest**

Download the installer for your operating system:

| Operating System | File to Download |
|-----------------|-----------------|
| **Windows** | `PatentForgeLocal-0.1.1-Setup.exe` |
| **Mac** | `PatentForgeLocal-0.1.1.dmg` |
| **Linux** | `PatentForgeLocal-0.1.1.AppImage` |

### Step 2: Run the Installer

**On Windows:**
1. Double-click the downloaded `.exe` file
2. If Windows shows a "Windows protected your PC" message, click **More info**, then **Run anyway** — this appears because the software is new and not yet widely installed
3. Follow the installer prompts — the default settings are fine
4. Click **Install** and wait for it to finish
5. Click **Finish** — PatentForgeLocal will launch automatically

**On Mac:**
1. Double-click the downloaded `.dmg` file
2. Drag the PatentForgeLocal icon into your **Applications** folder
3. Open your Applications folder and double-click **PatentForgeLocal**
4. If macOS says the app "can't be opened because it is from an unidentified developer," right-click the app icon and choose **Open**, then click **Open** again in the dialog. You only need to do this once.

**On Linux:**
1. Open a terminal in the folder where you downloaded the file
2. Make it executable: `chmod +x PatentForgeLocal-0.1.1.AppImage`
3. Run it: `./PatentForgeLocal-0.1.1.AppImage`
4. On some systems, you may need to install FUSE first: `sudo apt install libfuse2`

### What Gets Installed

The installer places three things on your computer:

1. **The PatentForgeLocal application** — the program itself, including all the services that power it
2. **A bundled Python runtime** — a programming language runtime needed by some of the analysis services
3. **A bundled AI engine (Ollama)** — the software that runs the AI model on your computer

Total size before the AI model download: approximately 4 GB. After the model downloads during first launch (see next section), total size is approximately 22 GB.

### The System Tray

After installation, a small icon appears in your **system tray** — the row of small icons near the clock on your taskbar (Windows), menu bar (Mac), or system panel (Linux). This is the PatentForgeLocal service manager. It runs in the background and manages all the services that power the application.

- **Left-click** the tray icon to open PatentForgeLocal in your web browser
- **Right-click** the tray icon to see options:
  - **Open PatentForgeLocal** — opens the application in your browser
  - **Services** — shows the status of each background service (running, stopped, or error)
  - **Restart Services** — stops and restarts all services (useful if something gets stuck)
  - **View Logs** — opens the log folder for troubleshooting
  - **Quit** — stops all services and closes PatentForgeLocal

The tray app automatically monitors the health of each service and restarts any service that crashes.

---

## 4. First Launch — Setup Wizard

The first time you start PatentForgeLocal, a setup wizard walks you through everything you need to get started. Each screen is described below.

### Screen 1: Welcome

You will see a welcome message introducing PatentForgeLocal. Click **"Get Started"** to begin.

### Screen 2: System Check

The program checks whether your computer meets the requirements. You will see a list of items with colored indicators:

- **Green checkmark** — your computer meets or exceeds this requirement. No action needed.
- **Yellow warning** — your computer meets the minimum but falls below the recommended level. PatentForgeLocal will work, but analysis may be slower. For example, you might see a yellow warning if you have 16 GB of RAM instead of the recommended 32 GB.
- **Red X** — your computer does not meet the minimum requirement. You will need to address this before continuing. The screen will explain specifically what is needed — for example, "You have 8 GB of RAM. PatentForgeLocal requires at least 16 GB."

If everything is green (or yellow), click **"Continue."** If you see a red item, see the Troubleshooting section for help.

### Screen 3: Model Download

This screen downloads the AI model — the "brain" that analyzes your inventions. The model is called **Gemma 4** (made by Google), and it is approximately **18 GB** in size.

This is a **one-time download**. Once the model is on your computer, you will never need to download it again. A progress bar shows how much has been downloaded and an estimate of how much time remains.

- On a fast internet connection (100+ Mbps): approximately 10 minutes
- On a moderate connection (25 Mbps): approximately 20-30 minutes
- On a slower connection (10 Mbps): approximately 45-60 minutes

You can leave this running and do other things on your computer while it downloads. Do not close the PatentForgeLocal window or shut down your computer during the download.

After the model is downloaded, future launches of PatentForgeLocal take about **30 seconds** — just enough time for the AI model to load into memory.

### Screen 4: Web Search (Optional)

PatentForgeLocal can optionally search the internet during analysis to find recently published patents and technical papers. This feature uses a free Ollama cloud account.

- **If you enable web search:** During analysis, the AI sends search queries (not your full invention description) to the internet to find recent relevant patents and publications. This helps the AI find prior art that was published after its training data was collected.
- **If you skip this step:** The AI uses the built-in patent databases and its own training knowledge. This is still effective — web search just adds more recent results.

To enable web search:
1. Click **"Create Free Account"** (this opens the Ollama website in your browser)
2. Create your free account and copy your API key
3. Paste the API key into the field on this screen
4. Click **"Continue"**

To skip: Click **"Skip — I'll set this up later."** You can always enable web search later in Settings.

### Screen 5: USPTO API Key (Optional)

The USPTO (United States Patent and Trademark Office) provides a free API (a way for programs to access their database) that gives PatentForgeLocal better access to patent search results.

- **If you add a USPTO key:** Patent searches return more detailed results, including the ability to view full patent claims text and patent family information (related patents).
- **If you skip this step:** Patent analysis still works using the AI's web search and training knowledge. You just get slightly less detail in the prior art results.

To add a USPTO API key:
1. Click **"Get Free API Key"** (this opens the USPTO data portal in your browser)
2. Create a free account at data.uspto.gov (this requires ID.me identity verification)
3. Copy your API key
4. Paste it into the field on this screen
5. Click **"Continue"**

To skip: Click **"Skip — I'll set this up later."** You can always add this key later in Settings.

### Screen 6: Legal Notice

This screen reminds you that PatentForgeLocal is a **research tool, not a legal service**. The AI can make mistakes, including fabricating patent numbers and making incorrect legal assessments. Always consult a registered patent attorney before making any patent filing decisions.

Read the notice carefully, then click **"I Understand."**

### Screen 7: Ready

You are all set. Click **"Start Using PatentForgeLocal."** Your web browser will open to the PatentForgeLocal home screen, where you can create your first project.

---

## 5. Creating a Project

In PatentForgeLocal, each invention you want to analyze is a **project**. One invention equals one project.

### Starting a New Project

1. From the home screen, click **"New Project"**
2. Enter a **title** for your invention — a short, descriptive name (for example, "Solar-Powered Water Purification System" or "AI-Based Crop Disease Detector")
3. Click **"Create"**

You will be taken to the project page, where you will fill in the invention form.

### The Invention Form

The form has 11 fields. Only **Title** and **Description** are required, but the more information you provide, the better the analysis will be. Think of it this way: you are explaining your invention to a knowledgeable researcher who will go investigate it. The clearer you are, the better their research will be.

| Field | What to Write | Tips |
|-------|--------------|------|
| **Title** | A short, descriptive name for your invention | Keep it under 10 words. Be specific — "Smart Irrigation Controller" is better than "My Invention." |
| **Description** | A detailed explanation of what your invention is and how it works | This is the most important field. Write 2-3 paragraphs. Describe what it does, how it works, and what makes it different. A counter below the field shows how many characters remain (8,000 limit). |
| **Problem Solved** | What problem does your invention solve? Why do people need it? | Think about who has this problem and why existing solutions fall short. |
| **How It Works** | Technical details about how the invention operates | Describe the mechanism step by step. If it has multiple parts, explain how they connect. |
| **AI/ML Components** | If your invention uses artificial intelligence or machine learning, describe those parts here | Leave blank if your invention does not involve AI. If it does, explain what the AI does and how it is trained or configured. |
| **3D Print / Physical Design** | If your invention involves 3D-printed parts or physical designs, describe them here | Leave blank if your invention is purely software. If it includes physical components, describe their shape, material, and how they fit together. |
| **What I Believe Is Novel** | What do you believe is new about your invention? What has not been done before? | Be specific. "It's better" is not helpful. "It uses ultrasonic waves instead of chemical filtration" is helpful. |
| **Current Alternatives** | What solutions already exist for the same problem? How is yours different? | Name specific products, patents, or approaches you know about. This helps the AI understand the competitive landscape. |
| **What Has Been Built** | Have you built a prototype? Is this just an idea, or is there working code or hardware? | Be honest about the stage. "Concept only," "working prototype," or "production version" are all fine. |
| **What I Want Protected** | What specific aspects of your invention do you want patent protection for? | Think about what a competitor would need to copy to replicate your advantage. That is what you want to protect. |
| **Additional Notes** | Anything else relevant that does not fit in the other fields | Market information, regulatory considerations, related inventions you have filed, or anything else the analysis should consider. |

### Tips for Good Descriptions

- **Be specific, not vague.** "It uses a sensor" is weak. "It uses a capacitive soil moisture sensor that takes readings every 30 seconds and transmits data via Bluetooth Low Energy" is strong.
- **Describe the "how," not just the "what."** Do not just say what your invention does — explain the mechanism by which it achieves the result.
- **Use technical terms when you know them.** If you know the proper name for a component or process, use it. The AI will understand technical language.
- **Include quantities and specifics.** Numbers, measurements, frequencies, materials — these details help the AI find the most relevant prior art.
- **Do not worry about legal language.** Write naturally. The AI handles the translation to patent terminology.

When you are finished, click **"Save Draft"** to save your work without starting the analysis, or proceed directly to running the analysis.

### Deleting a Project

To remove a project and all its data:

1. From the home screen, find the project you want to delete
2. Click the red **"Delete"** button next to that project
3. A confirmation dialog will appear — read it carefully
4. Click **"Delete"** to confirm, or **"Cancel"** to go back

**Warning:** This cannot be undone. All analysis results, claim drafts, compliance results, and application drafts for that project will be permanently deleted.

---

## 6. Running an Analysis

Once you have filled in your invention form, you are ready to run the analysis. This is where PatentForgeLocal does its work — the AI reads your invention description, searches for similar patents, evaluates patentability, and produces a detailed report.

### Starting the Analysis

1. From your project page, click **"Run Analysis"**
2. A confirmation screen appears showing the estimated time (typically 5-10 minutes, depending on your computer's speed and the complexity of your invention)
3. Click **"Start Analysis"**

### The 6-Stage Pipeline

The analysis runs through six stages, one after another. You can watch the AI work in real time — text appears on screen as the AI writes its findings.

**Stage 1: Technical Intake and Restatement**
The AI reads your invention description and restates it in precise technical language. This confirms that the AI understands what you described. If the restatement does not match your intent, you may want to revise your invention description and run the analysis again.

**Stage 2: Prior Art Research**
The AI searches for existing patents, published papers, and products that are similar to your invention. "Prior art" is a legal term meaning any evidence that something similar existed before your invention. This stage identifies what is already out there so the AI can assess how your invention compares.

**Stage 3: Patentability Analysis**
The AI evaluates your invention against the three main requirements of U.S. patent law:
- **Novelty** (35 U.S.C. 102) — Is your invention genuinely new? Has it been done before?
- **Non-obviousness** (35 U.S.C. 103) — Even if it is new, would it have been obvious to someone skilled in the field?
- **Utility** (35 U.S.C. 101) — Does it serve a practical purpose?

**Stage 4: Deep Dive Analysis**
A detailed examination of domain-specific aspects of your invention. If your invention involves AI or machine learning, this stage analyzes the patent landscape for AI inventions specifically. If it involves physical designs, it examines design patent considerations.

**Stage 5: IP Strategy and Recommendations**
The AI recommends filing strategies, discusses claim scope (how broadly or narrowly to define your patent protection), identifies open questions to discuss with your attorney, and highlights cost factors.

**Stage 6: Comprehensive Report**
All findings from the previous five stages are compiled into a single, structured report.

### Watching Progress

While the analysis runs, you will see:
- A **stage progress panel** on the left side showing which stage is currently active
- **Real-time streaming text** on the right as the AI writes its findings
- Each stage typically takes 1-3 minutes

### Canceling an Analysis

You can cancel at any time by clicking the **X** (cancel) button. The analysis stops after the current stage finishes. You will not lose work — any completed stages are saved, and you can resume from where you stopped.

### Resuming a Stopped Analysis

If an analysis is interrupted — whether you canceled it, your computer lost power, or an error occurred:

1. Go back to the project page
2. You will see a **"Resume"** button next to the partially completed run
3. Click **Resume** — it picks up from the last completed stage
4. Only the remaining stages will run

---

## 7. Understanding Your Report

When the analysis completes, you will see a detailed report organized into sections. Here is how to read it.

### Report Sections

The left sidebar lists each stage of the analysis. Click any stage to view its output. The **Comprehensive Report** (Stage 6) is the most useful starting point — it combines all findings into one document.

### Reading the Prior Art Table

The report includes a table of patents and publications that are similar to your invention. Each entry shows:

- **Patent number or publication ID** — a unique identifier. Patent numbers starting with "US" are U.S. patents.
- **Title** — the name of the patent or publication
- **Relevance score** — a colored bar showing how similar this prior art is to your invention. Higher scores (darker/longer bars) mean the prior art is more relevant.
- **Abstract** — a short summary of what the patent covers
- **Link** — click to view the full patent on Google Patents

A high relevance score does not automatically mean your invention is not patentable. It means the prior art is worth examining closely to understand how your invention differs.

### What "Novelty" Means

**Novelty** means your invention is genuinely new — no single piece of prior art describes exactly the same thing. If a patent already exists that describes your exact invention, yours is not novel. But if your invention has meaningful differences from everything that came before, it has novelty.

### What "Non-Obviousness" Means

**Non-obviousness** is a higher bar than novelty. Even if your exact invention is new, a patent examiner will ask: "Would someone skilled in this field have found it obvious to combine existing ideas to arrive at this invention?" If the answer is yes, the invention is "obvious" and cannot be patented. The AI analyzes this by looking at how your invention combines or extends existing technology.

### What "Utility" Means

**Utility** simply means your invention is useful — it serves a practical purpose. Almost all inventions meet this requirement. The AI flags utility concerns only in unusual cases (such as inventions that claim to violate laws of physics).

### Confidence Levels

The report may include confidence levels (high, medium, low) for various assessments. These indicate how confident the AI is in its analysis:
- **High confidence** — the AI found strong evidence supporting its assessment
- **Medium confidence** — the evidence is mixed or incomplete
- **Low confidence** — limited information was available; treat this assessment as preliminary

### Red Flags to Watch For

Pay special attention if the report mentions:
- **Highly similar prior art** — a patent that closely matches your invention
- **Alice/Mayo concerns** — your invention may fall into a category that is difficult to patent (such as abstract ideas or natural phenomena)
- **Incomplete description** — the AI could not fully analyze your invention because the description lacked sufficient detail

### Exporting Your Report

Click the download buttons at the top of the report:

- **Download Word** — a .docx file you can open in Microsoft Word or Google Docs. This is the best format to share with your patent attorney.
- **Download HTML** — a styled, printable version you can open in any web browser
- **Download** (on individual stages) — saves that stage's output as a text file

Files are saved to your browser's default Downloads folder, or to the export path configured in Settings.

### The Prior Art Panel

Click **"Prior Art"** in the left sidebar to see detailed prior art results. Each patent card can be clicked to open a detail panel showing:

- Patent number (linked to Google Patents)
- Filing and grant dates
- Assignees (who owns the patent) and inventors
- CPC classifications (patent categories)
- Full claims text (if you have a USPTO API key configured)
- Patent family information (related patents, continuations, divisionals)

You can export all prior art results as a CSV spreadsheet by clicking **"Export CSV"** at the top of the panel.

### Important Reminder

This report is **structured research to help you prepare for a conversation with a patent professional**. It is not a legal opinion. The AI may have made errors, fabricated references, or missed relevant prior art. All findings should be verified by a qualified patent attorney before making any decisions.

---

## 8. Claim Drafting

After completing a feasibility analysis, you can ask the AI to draft patent claims for your invention.

### What Are Patent Claims?

Patent claims are the most important part of a patent. They define the exact boundaries of what your patent protects — similar to how a property deed defines the boundaries of a piece of land. Everything inside the claim boundaries is protected; everything outside is not.

There are two types of claims:

- **Independent claims** stand on their own. They describe the invention broadly without referring to any other claim. Think of these as the "big picture" definition of your invention.
- **Dependent claims** refer to an independent claim and add additional specific details. They narrow the scope. For example, an independent claim might describe "a water purification device," while a dependent claim might specify "the device of claim 1, wherein the filter is made of activated carbon."

Having both broad and narrow claims is a strategy: if a broad claim is challenged, the narrower dependent claims may still survive.

### How to Generate Claims

1. On your project page, click the **"Claims"** button in the left sidebar
2. Click **"Generate Draft Claims"**
3. A legal acknowledgment dialog will appear — read it carefully. It explains that these are draft research concepts, not filing-ready claims. Check the box and click **"Generate Draft Claims"**
4. Wait 2-5 minutes while the AI plans, drafts, and reviews your claims
5. When complete, you will see your claims organized by type

### Understanding the Output

PatentForgeLocal generates up to 20 claims (the number at which USPTO filing fees increase):

- **Three independent claims** — broad, medium, and narrow versions, each using a different category (method, system, or apparatus)
- **Dependent claims** — specific refinements attached to each independent claim

### Reviewing and Editing Claims

- Hover over any claim text to see a pencil icon — click it to edit the claim text inline
- Make your changes, then click **Save** or **Cancel**
- Use the **List / Tree** toggle above the claims to switch between list view and a visual tree diagram showing how claims relate to each other

### Viewing Strategy and Examiner Feedback

Below the claims, you will find expandable sections:
- **Planner Strategy** — the AI's reasoning about claim scope and prior art avoidance
- **Examiner Feedback** — the AI's self-critique of each claim, including analysis against patent law sections

### Exporting Claims

Click **"Export Word"** to download a .docx file containing all your claims, properly numbered and formatted for review by your patent attorney.

### Important Limitations

These claims are **draft research concepts**. They are:
- NOT reviewed by a patent attorney
- NOT suitable for filing without professional review
- Potentially too broad, too narrow, or using language that would not survive examination
- Generated by AI that may fabricate technical details

**Every claim must be reviewed, revised, and finalized by a registered patent attorney before any patent application filing.**

---

## 9. Application Generation

After drafting claims, you can generate a complete draft patent application — the full document you would file with the patent office.

### What Is a Patent Application?

A patent application is a formal legal document submitted to the United States Patent and Trademark Office (USPTO). It describes your invention in precise technical detail and includes the claims that define what you want to protect. The application must follow specific formatting rules and include specific sections.

### What You Need First

Before generating an application, you need:
- A completed **feasibility analysis** (all 6 stages)
- **Drafted claims** (from the Claims section)

Running a compliance check first is recommended but not required.

### How to Generate an Application

1. On your project page, click the **"Application"** button in the left sidebar
2. Click **"Generate Application"**
3. A disclaimer will appear reminding you this is a research tool. Check the box and click **"Generate Application"**
4. Wait 3-8 minutes while the AI generates each section
5. When complete, you will see the full application with all sections listed

### Application Sections

Your generated application includes:

| Section | What It Contains |
|---------|-----------------|
| **Title** | Your invention title |
| **Cross-References** | References to related patent applications you have filed (starts empty — you fill this in) |
| **Background of the Invention** | Describes the technical field and existing solutions |
| **Summary of the Invention** | Overview of what your invention does and why it matters |
| **Detailed Description** | The full technical specification — how to make and use the invention |
| **Claims** | Your drafted claims from the Claims section |
| **Abstract** | A 150-word summary of the invention |
| **Figure Descriptions** | Placeholder descriptions for patent drawings |
| **Information Disclosure Statement (IDS)** | Lists all prior art references found during your analysis |

### Editing Sections

Click **"Edit"** on any section to modify the text. Click **"Save"** when done, or **"Cancel"** to discard changes. The Cross-References section is intentionally empty — add references to any related patent applications you have filed (provisionals, continuations, etc.).

### Exporting Your Application

- **Export Word** — downloads a formatted .docx file following USPTO formatting requirements: US Letter size, correct margins, Times New Roman 12pt, 1.5 line spacing, sequential paragraph numbering, and claims and abstract on separate pages. A watermark on every page reminds you to have it reviewed by a patent attorney.
- **Export Markdown** — downloads a plain text version

### Important Reminder

The generated application is an **AI-drafted research document**. It is **not** a legal filing. Every section must be reviewed, revised, and finalized by a registered patent attorney before filing with the USPTO.

---

## 10. Compliance Check

After generating claims, you can run a compliance check — an automated review that looks for common problems a patent examiner would flag.

### What It Checks

Think of the compliance checker as a spell-checker, but for patent law requirements. It runs four checks:

| Check | What It Looks For | In Plain Language |
|-------|-------------------|-------------------|
| **Patent Eligibility (35 U.S.C. 101)** | Is the invention the kind of thing that can be patented? | Some categories of ideas — abstract concepts, laws of nature, natural phenomena — cannot be patented on their own. The checker looks for claims that might fall into these categories. |
| **Written Description (35 U.S.C. 112a)** | Does the invention description support what the claims say? | If a claim mentions a feature you did not describe in your invention form, this check flags it. |
| **Definiteness (35 U.S.C. 112b)** | Are the claims written clearly? | This catches vague language, undefined terms, and ambiguous phrasing that a patent examiner would reject. |
| **Formalities (MPEP 608)** | Are the claims formatted correctly? | This checks numbering, proper references between claims, and formatting rules from the patent office handbook. |

### How to Run a Compliance Check

1. On your project page, click the **"Compliance"** button in the left sidebar
2. Click **"Run Compliance Check"**
3. A legal acknowledgment dialog appears — read it, check the box, and click **"Run Compliance Check"**
4. Wait 1-3 minutes while the checker analyzes each claim
5. When complete, results appear for every claim

### Reading the Results

Each claim shows a colored status for each of the four checks:

- **Green (PASS)** — No issues detected for this rule. This does not guarantee the claim will pass examination — it means the AI did not find an obvious problem.
- **Yellow (WARN)** — A potential issue was found, but it is not clear-cut. Review the explanation and consider whether a change would strengthen the claim.
- **Red (FAIL)** — A problem was found that a patent examiner would likely reject. The result includes a specific explanation and a suggestion for how to fix it.

Each result includes:
- **What the issue is** — a plain-language explanation
- **MPEP citation** — a reference to the specific section of the Manual of Patent Examining Procedure (the handbook patent examiners use). You do not need to look these up, but your patent attorney will find them useful.
- **Suggested fix** — a concrete suggestion for how to address the issue

### Fixing Issues

1. Note which claims have FAIL or WARN results
2. Go to the **Claims** section and edit the flagged claims
3. Return to the **Compliance** section and click **"Re-Check"** to run the checks again
4. Repeat until you are satisfied with the results

### Exporting Compliance Results

Click **"Export Word"** to download a .docx file with the full compliance results, including per-claim status, MPEP citations, and suggested fixes. Share this with your patent attorney alongside the claims export.

### Important Limitations

Compliance checking is **automated research, not legal review**. The checker may miss issues that a human examiner would catch, and a PASS result does not guarantee patentability. **Always have a registered patent attorney review your claims before filing.**

---

## 11. Settings

Access settings by clicking the **gear icon** in the top navigation bar.

### Setting Reference

| Setting | What It Does | Default |
|---------|-------------|---------|
| **AI Model** | Shows which AI model is running on your computer (read-only). PatentForgeLocal uses Gemma 4. | Gemma 4 26B |
| **Ollama API Key** | Enables optional web search during analysis. Get a free key by creating an account at ollama.com. | None (web search disabled) |
| **USPTO API Key** | Improves patent search results with detailed patent data from the U.S. Patent Office. Get a free key at data.uspto.gov. | None (basic search only) |
| **Max Tokens** | Controls how much text the AI generates per stage. Higher values produce more detailed output but take longer. The default works well for most inventions. | 16,384 |
| **Inter-Stage Delay** | Number of seconds the system waits between analysis stages. The default of 2 seconds is appropriate since there are no rate limits when running locally. | 2 seconds |
| **Export Path** | The folder where exported documents (Word files, reports) are saved. Must be inside your home directory. | Your Documents folder |
| **Auto-Export** | When enabled, reports are automatically exported as Word documents when analysis completes. | Off |

### Changing Settings

1. Click the **gear icon** in the navigation bar
2. Make your changes
3. Click **"Save"**

You can navigate back to your project list at any time by clicking **"Projects"** in the breadcrumb at the top of the settings page.

### API Keys

Both API keys (Ollama and USPTO) are **encrypted** before being stored on your computer. They are never saved as plain text and never sent anywhere except to the services they authenticate with.

- The **Ollama API key** is used only for web search requests during analysis
- The **USPTO API key** is used only for patent database queries

Both keys are free to obtain. Neither is required to use PatentForgeLocal — they just enable additional features.

---

## 12. Troubleshooting

### "PatentForgeLocal won't start"

**What to try:**
1. Look for the PatentForgeLocal icon in your system tray (near the clock). If it is there, left-click it to open the application in your browser.
2. If the icon is not in the system tray, find PatentForgeLocal in your Start Menu (Windows), Applications folder (Mac), or application menu (Linux) and launch it again.
3. If it still does not start, restart your computer and try again. The AI model may not have loaded correctly.

### "Model not loaded" or "AI model unavailable"

**What this means:** The AI model (Gemma 4) is not currently running.

**What to try:**
1. Right-click the system tray icon and choose **"Services"** — check if the Ollama service shows "Running" or "Stopped"
2. If Ollama is stopped, right-click the tray icon and choose **"Restart Services"**
3. Wait 30-60 seconds for the model to load into memory
4. If the problem persists, check that you have enough free RAM (at least 16 GB total, with 10+ GB available)

### "Analysis is very slow"

**What this means:** The AI is running but taking longer than expected.

**What to try:**
1. Close other programs to free up RAM. The AI needs as much memory as possible.
2. Check your RAM usage: on Windows, press Ctrl+Shift+Esc to open Task Manager and look at the Memory column. If usage is above 90%, close some programs.
3. If you have a dedicated graphics card (GPU), make sure it is being used. Right-click the system tray icon, choose Services, and check if the Ollama service shows "GPU" or "CPU" mode. GPU mode is significantly faster.
4. A typical analysis takes 5-10 minutes. If it takes more than 20 minutes per stage, your hardware may be below the recommended specifications.

### "Web search not working"

**What this means:** The optional web search feature is not connecting.

**What to try:**
1. Go to **Settings** and check that your Ollama API key is entered correctly
2. Make sure you have an active internet connection
3. Web search is optional — the analysis will still work using the AI's built-in knowledge and any configured USPTO patent data

### "Prior art search returned no results"

**What to try:**
1. Add a **USPTO API key** in Settings for better patent search access (free at data.uspto.gov)
2. Make your invention description more specific — vague descriptions produce vague searches
3. Check that your internet connection is working (prior art search requires internet access)

### "Report seems incomplete or low quality"

**What to try:**
1. Go back to your invention form and add more detail — especially in the Description, How It Works, and What I Believe Is Novel fields
2. Run the analysis again. AI results vary between runs, and a second run may produce better output.
3. Check that the AI model is fully loaded (see "Model not loaded" above)

### "Application won't export" or "Export failed"

**What to try:**
1. Go to **Settings** and check the **Export Path** — make sure the folder exists on your computer
2. The export path must be inside your home directory. Paths like `C:\Windows` or `/etc` are not allowed for security reasons.
3. Make sure you have write permission to the export folder
4. Try exporting to a different folder, such as your Desktop

### "Not enough disk space"

**What to try:**
1. The AI model requires approximately 18 GB of disk space, plus 4 GB for the application itself
2. Check your free disk space (see Section 2 for how to check on each operating system)
3. Delete unnecessary files or move them to an external drive to free up space
4. If you are very low on space, consider using an external SSD drive for the PatentForgeLocal installation

### "The page shows a loading spinner that won't stop"

**What to try:**
1. Refresh the page in your browser (press F5 or Ctrl+R on Windows/Linux, Cmd+R on Mac)
2. If a pipeline was running when the page loaded, PatentForgeLocal detects the stale state and shows you partial results with a Resume option
3. If refreshing does not help, right-click the system tray icon and choose **"Restart Services"**, then refresh the page again

### "Analysis completed but some stages are missing"

**What this means:** The analysis was interrupted partway through and only some stages have output.

**What to try:**
1. Look for a **"Resume"** button on the project page — this picks up from the last completed stage
2. If no Resume button appears, click **"Run Analysis"** to start a fresh run
3. Your previous partial results are preserved in the History section

### "I closed the browser — is my analysis lost?"

**No.** The analysis runs on background services, not in your browser. Closing the browser does not stop the analysis. When you reopen PatentForgeLocal (left-click the system tray icon), your analysis will either still be running or will have completed while the browser was closed.

### "Claims or compliance won't generate"

**What to try:**
1. Make sure you have completed a full feasibility analysis first (all 6 stages) — claims require analysis results as input
2. For compliance checks, make sure you have generated claims first
3. Only one claim draft or compliance check can run at a time per project. If a previous run was interrupted, refresh the page — PatentForgeLocal automatically cleans up stale runs on restart.

### Stopping PatentForgeLocal Manually

If closing the window does not stop the background services (you notice high CPU or memory usage after closing):

1. **Windows:** Open a PowerShell window in the PatentForgeLocal folder and run: `.\PatentForgeLocal-stop.ps1`
2. This reads the process IDs from `logs\pids.txt` and stops each service gracefully
3. As a safety net, it also checks ports 3000-3004 and kills any remaining processes

### Finding Log Files

If something goes wrong and you need to share details with a support person:

1. Open the `logs` folder inside your PatentForgeLocal installation directory
2. Each service has its own log file: `backend.log`, `feasibility.log`, `claim-drafter.log`, etc.
3. Error output is in separate files ending in `-error.log` (e.g., `backend-error.log`)
4. These files are overwritten each time you launch PatentForgeLocal

### Getting More Help

If none of the above solutions resolve your problem:

1. Visit the PatentForgeLocal GitHub Issues page: **https://github.com/scottconverse/patentforgelocal/issues**
2. Search for your problem — someone else may have already reported it
3. If you do not find a matching issue, click **"New Issue"** and describe:
   - What you were trying to do
   - What happened instead
   - Your operating system and version
   - How much RAM and disk space your computer has

---

## 13. Glossary

| Term | Plain-Language Definition |
|------|--------------------------|
| **AI Model** | A computer program that has been trained on large amounts of text to understand and generate human-like language. PatentForgeLocal uses an AI model called Gemma 4 to analyze inventions. |
| **Abstract** | A short summary (usually 150 words or fewer) of what a patent covers. Every patent application requires one. |
| **Alice/Mayo Framework** | A two-step legal test used to determine whether a patent claim is directed to an abstract idea (like a math formula) without enough concrete, technical substance to be patentable. Named after two Supreme Court cases. |
| **Antecedent Basis** | A rule requiring that every term in a patent claim be properly introduced before it is referenced. For example, you must say "a sensor" before you can say "the sensor." |
| **API Key** | A code (like a password) that lets a program access an online service. PatentForgeLocal uses optional API keys for web search (Ollama) and patent database access (USPTO). |
| **Claim** | A numbered statement in a patent that defines exactly what the patent protects. Claims are the legal boundaries of patent protection. |
| **Claim Scope** | How broad or narrow a claim is. Broader claims cover more situations but are easier to challenge. Narrower claims are more defensible but protect less. |
| **Compliance Check** | An automated review of patent claims against legal requirements, checking format, clarity, description support, and eligibility for patent protection. |
| **Continuation** | A patent application filed to pursue additional claims based on the same invention described in an earlier (parent) application. |
| **CPC Classification** | Cooperative Patent Classification — a system of codes that categorize patents by technology area. For example, "A01B" covers soil-working tools. |
| **Definiteness** | A legal requirement (35 U.S.C. 112b) that patent claims be written clearly enough that someone skilled in the field can understand exactly what is claimed. |
| **Dependent Claim** | A patent claim that refers to and narrows another claim. For example: "The method of claim 1, wherein the sensor is a capacitive sensor." |
| **Divisional** | A patent application split off from a parent application when the patent office determines the parent covers more than one distinct invention. |
| **Filing Strategy** | The plan for how to file patent applications — including which claims to file first, whether to file a provisional application, and in which countries to seek protection. |
| **Gemma 4** | The AI model used by PatentForgeLocal, made by Google. It runs entirely on your computer and does not require an internet connection. |
| **GPU** | Graphics Processing Unit — a specialized computer chip originally designed for displaying graphics but now widely used to speed up AI processing. Having a GPU with 8+ GB of its own memory significantly speeds up analysis. |
| **Independent Claim** | A patent claim that stands on its own, defining the invention without referring to any other claim. |
| **MPEP** | Manual of Patent Examining Procedure — the official handbook that patent examiners use when reviewing applications. Compliance check results cite specific MPEP sections. |
| **Non-Obviousness** | A legal requirement (35 U.S.C. 103) that your invention not be an obvious combination of things that already exist. Even if your exact invention is new, it must also be a non-obvious advance. |
| **Novelty** | A legal requirement (35 U.S.C. 102) that your invention be genuinely new — not previously described in any single piece of prior art. |
| **Ollama** | The software that runs the AI model on your computer. Think of it as the "engine" that powers the AI. It is bundled with PatentForgeLocal — you do not need to install it separately. |
| **Patent** | A legal document granted by a government that gives you the exclusive right to make, use, or sell an invention for a limited time (typically 20 years from filing). |
| **Patent Application** | The formal document submitted to the patent office requesting a patent. It includes a detailed description of the invention, drawings, claims, and an abstract. |
| **Patent Eligibility** | A legal requirement (35 U.S.C. 101) defining what kinds of things can be patented. Abstract ideas, laws of nature, and natural phenomena generally cannot be patented on their own. |
| **Patent Family** | A group of related patents and applications that share a common origin, including continuations, divisionals, and foreign filings of the same invention. |
| **Prior Art** | Any evidence that something similar to your invention already existed before you invented it. This includes earlier patents, published papers, products on the market, and public demonstrations. |
| **Provisional Application** | A simplified, lower-cost patent application that establishes an early filing date. It gives you 12 months to file a full (non-provisional) application. |
| **RAM** | Random Access Memory — your computer's short-term working memory. The AI model needs a large amount of RAM to run. Check your RAM in Task Manager (Windows) or About This Mac (Mac). |
| **Specification** | The detailed description portion of a patent application — everything except the claims and abstract. It must describe the invention in enough detail that someone skilled in the field could reproduce it. |
| **System Tray** | The row of small icons near the clock on your computer's taskbar (Windows), menu bar (Mac), or system panel (Linux). PatentForgeLocal places an icon here to manage its background services. |
| **Token** | A small unit of text (roughly three-quarters of a word) used to measure how much text the AI processes. The "Max Tokens" setting controls how much text the AI generates per analysis stage. |
| **USPTO** | United States Patent and Trademark Office — the government agency that examines patent applications and grants patents. |
| **Utility** | A legal requirement (35 U.S.C. 101) that your invention serve a practical, useful purpose. Nearly all inventions meet this requirement. |
| **VRAM** | Video RAM — memory on your graphics card (GPU). More VRAM lets the AI model run faster. 8 GB or more is recommended. |
| **Non-Provisional Application** | The full, formal patent application filed with the USPTO. Unlike a provisional application, this is examined by a patent examiner and can result in a granted patent. |
| **PCT Application** | Patent Cooperation Treaty application — an international filing that lets you seek patent protection in multiple countries through a single application. It does not grant a patent directly but preserves your right to file in member countries. |
| **Written Description** | A legal requirement (35 U.S.C. 112a) that your patent application describe the invention in enough detail to show you actually possessed it at the time of filing. |

---

## 14. Privacy and Security

PatentForgeLocal was designed with privacy as a core principle. Here is exactly what stays on your computer and what (if anything) goes over the internet.

### What Stays on Your Computer — Everything by Default

- **Your invention descriptions** — never transmitted anywhere
- **The AI model** — runs entirely on your machine
- **All analysis results** — stored in a local database on your computer
- **Drafted claims and applications** — stored locally
- **Exported documents** — saved to your local disk
- **Your settings and API keys** — encrypted and stored locally

With no optional features enabled, PatentForgeLocal makes **zero network connections**. It works entirely offline.

### What Goes Over the Internet — Only If You Opt In

If you enable **web search** (by adding an Ollama API key in Settings):
- **Search queries** are sent to the Ollama cloud service during analysis. These are keyword-based search terms derived from your invention, not your full invention description.
- Search results (web page summaries) are returned to your computer for the AI to analyze locally.

If you enable **USPTO patent search** (by adding a USPTO API key in Settings):
- **Patent search queries** are sent to the USPTO Open Data Portal. These are keyword searches, not your full invention description.
- Patent data (titles, abstracts, claims, dates) is returned to your computer.

### What Is Never Sent

Regardless of your settings, the following are **never** transmitted over the internet:
- Your full invention description
- Your analysis results
- Your drafted claims or application text
- Your project names or personal information

### No Accounts Required

PatentForgeLocal does not require you to create an account, sign in, or register. There is no telemetry (automated data collection about how you use the software), no analytics, and no tracking.

### How API Keys Are Stored

Both optional API keys (Ollama and USPTO) are encrypted using AES-256-GCM with a per-installation random salt before being stored. They are never saved as plain text in any file on your computer.

### How to Verify

You can verify PatentForgeLocal's privacy claims yourself:
1. Disconnect your computer from the internet
2. Launch PatentForgeLocal and run an analysis
3. The analysis will complete successfully (without web search or USPTO results)

This confirms that the core analysis runs entirely on your machine with no network dependency.

---

*PatentForgeLocal is a research tool, not a legal service. The author of this tool is not a lawyer. The AI systems that generate the analysis are not lawyers. No attorney-client relationship is created by using this tool. It does not provide legal advice. Always consult a registered patent attorney or patent agent before making patent filing decisions.*
