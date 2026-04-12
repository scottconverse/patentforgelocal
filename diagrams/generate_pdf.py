"""
PatentForge v0.8.5 — README-FULL.pdf Generator
Generates a professional PDF with architecture diagrams.
"""
import os
from fpdf import FPDF

DIAGRAMS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(DIAGRAMS_DIR)
OUTPUT = os.path.join(ROOT_DIR, 'README-FULL.pdf')

class PatentForgePDF(FPDF):
    def header(self):
        if self.page_no() > 1:
            self.set_font('Helvetica', 'I', 8)
            self.set_text_color(130, 130, 130)
            self.cell(0, 8, 'PatentForge v0.8.5 - AI-Powered Full-Lifecycle Patent Platform', align='L')
            self.cell(0, 8, f'Page {self.page_no()}', align='R', new_x='LMARGIN', new_y='NEXT')
            self.line(10, 14, 200, 14)
            self.ln(4)

    def footer(self):
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 7)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, 'PatentForge is a research tool, not a legal service. The author is not a lawyer. See LEGAL_NOTICE.md.', align='C')

    def chapter_title(self, title):
        self.set_font('Helvetica', 'B', 16)
        self.set_text_color(30, 30, 30)
        self.cell(0, 12, title, new_x='LMARGIN', new_y='NEXT')
        self.set_draw_color(59, 130, 246)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(6)

    def section_title(self, title):
        self.set_font('Helvetica', 'B', 13)
        self.set_text_color(50, 50, 50)
        self.cell(0, 10, title, new_x='LMARGIN', new_y='NEXT')
        self.ln(2)

    def subsection_title(self, title):
        self.set_font('Helvetica', 'B', 11)
        self.set_text_color(70, 70, 70)
        self.cell(0, 8, title, new_x='LMARGIN', new_y='NEXT')
        self.ln(1)

    def body_text(self, text):
        self.set_font('Helvetica', '', 10)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 5.5, text)
        self.ln(3)

    def bullet(self, text):
        self.set_font('Helvetica', '', 10)
        self.set_text_color(40, 40, 40)
        x = self.get_x()
        self.cell(6, 5.5, '-')
        self.multi_cell(0, 5.5, text)
        self.ln(1)

    def bold_bullet(self, bold_part, rest):
        x = self.get_x()
        self.set_font('Helvetica', '', 10)
        self.set_text_color(40, 40, 40)
        self.cell(6, 5.5, '-')
        self.set_font('Helvetica', 'B', 10)
        self.write(5.5, bold_part)
        self.set_font('Helvetica', '', 10)
        self.write(5.5, rest)
        self.ln(7)

    def add_diagram(self, filename, caption, width=180):
        path = os.path.join(DIAGRAMS_DIR, filename)
        if os.path.exists(path):
            self.image(path, x=15, w=width)
            self.ln(3)
            self.set_font('Helvetica', 'I', 8)
            self.set_text_color(100, 100, 100)
            self.cell(0, 5, caption, align='C', new_x='LMARGIN', new_y='NEXT')
            self.ln(6)
        else:
            self.body_text(f'[Diagram not found: {filename}]')

    def disclaimer_box(self, text):
        self.set_fill_color(245, 245, 245)
        self.set_draw_color(200, 200, 200)
        self.set_font('Helvetica', 'I', 9)
        self.set_text_color(100, 100, 100)
        x = self.get_x()
        y = self.get_y()
        self.rect(10, y, 190, 30, style='DF')
        self.set_xy(12, y + 2)
        self.multi_cell(186, 4.5, text)
        self.ln(8)


def generate():
    pdf = PatentForgePDF()
    pdf.set_auto_page_break(auto=True, margin=20)

    # ── COVER PAGE ──
    pdf.add_page()
    pdf.ln(50)
    pdf.set_font('Helvetica', 'B', 32)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(0, 15, 'PatentForge', align='C', new_x='LMARGIN', new_y='NEXT')
    pdf.set_font('Helvetica', '', 14)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 10, 'AI-Powered Full-Lifecycle Patent Platform', align='C', new_x='LMARGIN', new_y='NEXT')
    pdf.ln(5)
    pdf.set_font('Helvetica', '', 11)
    pdf.cell(0, 8, 'Version 0.8.5  |  April 2026', align='C', new_x='LMARGIN', new_y='NEXT')
    pdf.cell(0, 8, 'Scott Converse', align='C', new_x='LMARGIN', new_y='NEXT')
    pdf.ln(15)
    pdf.set_font('Helvetica', 'I', 9)
    pdf.set_text_color(130, 130, 130)
    pdf.multi_cell(0, 5, 'PatentForge is a research tool, not a legal service. The author of this tool is not a lawyer. '
                         'The AI systems that execute these prompts are not lawyers. No attorney-client relationship '
                         'is created by using this tool. See LEGAL_NOTICE.md for full details.', align='C')
    pdf.ln(10)
    pdf.set_font('Helvetica', '', 9)
    pdf.cell(0, 6, 'Code: MIT License  |  Prompt Content: CC BY-SA 4.0', align='C', new_x='LMARGIN', new_y='NEXT')
    pdf.cell(0, 6, 'https://github.com/scottconverse/patentforge', align='C', new_x='LMARGIN', new_y='NEXT')

    # ── TABLE OF CONTENTS ──
    pdf.add_page()
    pdf.chapter_title('Table of Contents')
    toc = [
        '1. Overview',
        '2. What PatentForge Does',
        '3. System Architecture',
        '4. The 6-Stage Feasibility Pipeline',
        '5. Claim Drafting',
        '6. Compliance Checking',
        '7. Application Generation',
        '8. Data Flow',
        '9. Database Schema',
        '10. Docker Deployment',
        '11. User Journey',
        '12. Configuration',
        '13. Legal Guardrails',
        '14. License',
    ]
    for item in toc:
        pdf.set_font('Helvetica', '', 11)
        pdf.set_text_color(40, 40, 40)
        pdf.cell(0, 7, item, new_x='LMARGIN', new_y='NEXT')
    pdf.ln(5)

    # ── 1. OVERVIEW ──
    pdf.add_page()
    pdf.chapter_title('1. Overview')
    pdf.body_text(
        'PatentForge is an open-source, self-hosted web application that guides inventors through '
        'the full patent lifecycle using AI. Starting from a plain-language invention description, '
        'it runs a 6-stage feasibility analysis pipeline, automates prior art discovery, drafts '
        'independent and dependent patent claims, performs compliance pre-screening against patent '
        'law requirements, and generates a complete USPTO-formatted patent application. Every '
        "capability uses Anthropic's Claude API with multi-agent LangGraph pipelines for the "
        'drafting, compliance, and application generation services.'
    )
    pdf.body_text(
        'PatentForge also supports prosecution tracking to monitor the status of filed applications '
        'over time. The goal throughout is preparation, not replacement. PatentForge helps you walk '
        'into your first attorney meeting with your invention clearly described, related prior art '
        'identified, draft claims in hand, and a complete application draft ready for professional '
        'review - so you make the most of your attorney\'s time and arrive informed.'
    )
    pdf.disclaimer_box(
        'PatentForge is a research tool, not a legal service. The author is not a lawyer. '
        'The AI systems are not lawyers. No attorney-client relationship is created. '
        'AI-generated analysis may contain errors, omissions, or hallucinated references. '
        'Always consult a registered patent attorney before making filing decisions.'
    )

    # ── 2. WHAT IT DOES ──
    pdf.chapter_title('2. What PatentForge Does')
    features = [
        ('Structured technical analysis', ' - 6-stage AI pipeline restates your invention in patent terminology, searches for related art, identifies potential issues, and organizes findings into a structured report.'),
        ('Prior art discovery', ' - automated patent search via PatentsView API with AI-powered query extraction and relevance scoring, plus Claude web search for papers, products, and open-source projects.'),
        ('Claim drafting', ' - multi-agent AI pipeline (Planner, Writer, Examiner) generates independent and dependent patent claims with prior art awareness.'),
        ('Compliance pre-screening', ' - four automated checks (35 USC 112a, 112b, MPEP 608, 35 USC 101) with pass/fail/warn results and fix suggestions.'),
        ('Application generation', ' - 5-agent sequential pipeline generates a complete USPTO-formatted patent application (background, summary, detailed description, abstract, figure descriptions) with Word export following 37 CFR 1.52.'),
        ('Information disclosure', ' - automatic IDS table generation from prior art search results.'),
        ('Cost transparency', ' - pre-run cost estimate with per-stage token tracking so you know what the AI processing will cost before you start.'),
        ('Resume from interruption', ' - pick up where you left off if a run stops mid-pipeline.'),
        ('Multiple export formats', ' - HTML, Word (.docx), and Markdown for sharing with your attorney.'),
        ('Self-hosted & private', ' - runs on your machine; invention data stays local except for Anthropic API calls.'),
        ('Legal guardrails', ' - clickwrap agreement, embedded disclaimers, watermarked exports, dual license for prompt content.'),
    ]
    for bold, rest in features:
        pdf.bold_bullet(bold, rest)

    # ── 3. ARCHITECTURE ──
    pdf.add_page()
    pdf.chapter_title('3. System Architecture')
    pdf.body_text(
        'PatentForge uses a six-service federated architecture. Each service is independently '
        'deployable and communicates via HTTP requests and Server-Sent Events (SSE) for real-time '
        'streaming. SQLite is used for local development; PostgreSQL for Docker deployment.'
    )
    pdf.add_diagram('architecture.png', 'Figure 1: PatentForge System Architecture (v0.8.5)')

    pdf.section_title('Service Descriptions')
    pdf.bold_bullet('React Frontend (port 8080)', ' - Invention intake, real-time streaming, report viewer, claim editor, compliance results, application section navigator. React 18, TypeScript, Vite, Tailwind CSS.')
    pdf.bold_bullet('NestJS Backend (port 3000)', ' - Project CRUD, settings, feasibility tracking, SSE forwarding, prior art search, claim/compliance/application orchestration, Word/Markdown export. NestJS, Prisma ORM, SQLite/PostgreSQL.')
    pdf.bold_bullet('Feasibility Service (port 3001)', ' - 6-stage sequential AI analysis pipeline with web search. Express, TypeScript.')
    pdf.bold_bullet('Claim Drafter (port 3002)', ' - Multi-agent claim generation: Planner analyzes strategy, Writer drafts claims, Examiner reviews and requests revisions. Python, FastAPI, LangGraph.')
    pdf.bold_bullet('Application Generator (port 3003)', ' - 5-agent sequential pipeline generating USPTO-formatted patent application sections with paragraph numbering, Word export with watermark. Python, FastAPI, LangGraph, python-docx.')
    pdf.bold_bullet('Compliance Checker (port 3004)', ' - Four parallel compliance checks against patent law requirements with MPEP citations and fix suggestions. Python, FastAPI, LangGraph.')

    pdf.section_title('External Services')
    pdf.bold_bullet('Anthropic Claude API', ' - LLM processing with web search tool for grounded research in Stages 2, 3, and 4.')
    pdf.bold_bullet('PatentsView API', ' - USPTO patent database search for automated prior art discovery.')
    pdf.bold_bullet('LiteLLM Pricing', ' - Dynamic model cost estimation with 1-hour cached pricing data.')

    # ── 4. PIPELINE ──
    pdf.add_page()
    pdf.chapter_title('4. The 6-Stage Feasibility Pipeline')
    pdf.body_text(
        'PatentForge runs a sequential 6-stage analysis pipeline. Each stage builds on the output '
        'of all previous stages. The pipeline streams tokens in real time so you can watch the AI '
        'write its findings as they are generated.'
    )
    stages = [
        ('Stage 1: Technical Intake & Restatement', 'Restates your invention in precise technical language. Identifies core components, inventive concept candidates, and CPC classifications. Flags information gaps.'),
        ('Stage 2: Prior Art Research', 'Searches for existing patents, academic papers, products, and open-source projects using Claude web search and PatentsView data. Produces an element-by-element comparison table and white space assessment.'),
        ('Stage 3: Patentability Assessment', 'Maps the invention against patent law requirements under 35 USC 101 (eligibility), 102 (novelty), 103 (obviousness), and 112 (enablement). Identifies anticipated examiner concerns.'),
        ('Stage 4: Deep Dive Analysis', 'Domain-specific analysis of the technology areas relevant to the invention. Patent landscape, strongest/weakest elements, claim framing considerations.'),
        ('Stage 5: IP Landscape Assessment', 'Presents filing indicators, recommended IP protection mix, filing strategy, cost estimates, freedom-to-operate flags, and an overall assessment.'),
        ('Stage 6: Consolidated Report', 'Assembles all findings into a single structured document with executive summary, risk scores, and a plain-English summary for non-technical readers.'),
    ]
    for title, desc in stages:
        pdf.subsection_title(title)
        pdf.body_text(desc)

    # ── 5. CLAIM DRAFTING ──
    pdf.add_page()
    pdf.chapter_title('5. Claim Drafting')
    pdf.body_text(
        'The claim drafting service uses a multi-agent LangGraph pipeline to generate patent claims. '
        'Three agents work sequentially: the Planner analyzes the invention and prior art to develop '
        'a claim strategy, the Writer drafts independent and dependent claims, and the Examiner reviews '
        'the claims against prior art and may request revisions.'
    )
    pdf.body_text(
        'Claims are informed by feasibility analysis (stages 5-6) and prior art search results. '
        'The Examiner agent evaluates each claim for novelty, definiteness, and prior art overlap. '
        'If revisions are needed, the Writer agent incorporates feedback and produces revised claims.'
    )
    pdf.body_text(
        'Users can edit individual claims, regenerate specific claims, view claims as a dependency tree, '
        'and export to Word format. A UPL disclaimer modal is required before generation.'
    )

    # ── 6. COMPLIANCE CHECKING ──
    pdf.add_page()
    pdf.chapter_title('6. Compliance Checking')
    pdf.body_text(
        'The compliance checker runs four automated pre-screens against patent law requirements:'
    )
    checks = [
        ('35 USC 112(a) Written Description', 'Checks whether the specification adequately describes each claim element.'),
        ('35 USC 112(b) Definiteness', 'Evaluates claim language for indefinite terms, missing antecedent basis, and ambiguity.'),
        ('MPEP 608 Formalities', 'Checks claim structure, numbering, dependency chains, and formatting requirements.'),
        ('35 USC 101 Eligibility', 'Applies the Alice/Mayo two-step test for patent-eligible subject matter.'),
    ]
    for title, desc in checks:
        pdf.subsection_title(title)
        pdf.body_text(desc)
    pdf.body_text(
        'Each check returns PASS, FAIL, or WARN status with MPEP citations and actionable fix suggestions. '
        'Results are exportable to Word format.'
    )

    # ── 7. APPLICATION GENERATION ──
    pdf.add_page()
    pdf.chapter_title('7. Application Generation')
    pdf.body_text(
        'The application generator assembles upstream artifacts (feasibility analysis, prior art, claims) '
        'into a complete USPTO-formatted patent application. Five LLM agents run sequentially:'
    )
    agents = [
        ('Background Agent', 'Generates the Background of the Invention section from invention narrative, technical restatement, and prior art context.'),
        ('Summary Agent', 'Generates the Summary of the Invention, referencing claim elements and prior sections.'),
        ('Detailed Description Agent', 'Produces the comprehensive technical specification with enablement detail for every claim element.'),
        ('Abstract Agent', 'Creates a 50-150 word single-paragraph abstract per USPTO requirements.'),
        ('Figures Agent', 'Generates placeholder figure descriptions (Brief Description of the Drawings).'),
    ]
    for title, desc in agents:
        pdf.subsection_title(title)
        pdf.body_text(desc)
    pdf.body_text(
        'The generated application includes an Information Disclosure Statement (IDS) table auto-populated '
        'from prior art search results, and a user-editable Cross-References section.'
    )
    pdf.section_title('Export Format')
    pdf.body_text(
        'Word (.docx) export follows USPTO 37 CFR 1.52 formatting: US Letter size, Times New Roman 12pt, '
        '1.5 line spacing, bold [NNNN] paragraph numbering, page numbers, separate pages for Claims and '
        'Abstract, and a draft warning banner on every page. Markdown export is also available.'
    )

    # ── 8. DATA FLOW ──
    pdf.add_page()
    pdf.chapter_title('8. Data Flow')
    pdf.body_text(
        'The diagram below shows how data flows through the PatentForge pipeline, from inventor '
        'input through the 6 analysis stages to the final exported report.'
    )
    pdf.add_diagram('data-flow.png', 'Figure 2: Cross-Stage Data Flow')
    pdf.body_text(
        'Key characteristics: each stage receives the full output of all prior stages as context. '
        'Stages 2, 3, and 4 use Anthropic web search for grounded research. The backend also '
        'queries PatentsView independently for verified USPTO patent data that feeds into Stage 2. '
        'Every export (HTML, Word, Markdown) includes a hardcoded legal disclaimer footer that '
        'persists even if the AI output is truncated.'
    )

    # ── 9. DATABASE ──
    pdf.add_page()
    pdf.chapter_title('9. Database Schema')
    pdf.body_text(
        'PatentForge uses Prisma ORM with SQLite for local development and PostgreSQL for Docker '
        'deployment. The schema tracks projects, invention disclosures, feasibility runs with '
        'per-stage outputs, prior art searches, and application settings.'
    )
    pdf.add_diagram('database-schema.png', 'Figure 3: Database Entity-Relationship Diagram')

    # ── 10. DOCKER ──
    pdf.add_page()
    pdf.chapter_title('10. Docker Deployment')
    pdf.body_text(
        'PatentForge provides a Docker Compose configuration for single-command deployment. '
        'The compose file starts seven containers: frontend, backend, feasibility service, '
        'claim drafter, compliance checker, application generator, and PostgreSQL. '
        'A persistent volume stores database data across restarts.'
    )
    pdf.add_diagram('docker-topology.png', 'Figure 4: Docker Deployment Topology')

    # ── 11. USER JOURNEY ──
    pdf.chapter_title('11. User Journey')
    pdf.body_text(
        'The typical user journey takes an inventor from initial idea through structured research '
        'to a prepared attorney consultation.'
    )
    pdf.add_diagram('user-journey.png', 'Figure 5: User Journey from Invention to Attorney Meeting')

    # ── 12. CONFIGURATION ──
    pdf.add_page()
    pdf.chapter_title('12. Configuration')
    pdf.body_text('All settings are configurable via the Settings page in the web UI:')
    settings = [
        ('Anthropic API Key', 'Required. Your Claude API key (BYOK model).'),
        ('Default Model', 'Model for most pipeline stages. Default: claude-sonnet-4-20250514.'),
        ('Research Model', 'Optional cheaper model for Stage 2 (e.g., Haiku).'),
        ('Max Tokens', 'Maximum tokens per stage response. Default: 32,000.'),
        ('Inter-Stage Delay', 'Pause between stages for rate limit protection. Default: 5 seconds.'),
        ('USPTO API Key', 'Optional. Enables structured patent search from USPTO Open Data Portal. Free at beta-data.uspto.gov/apis.'),
        ('Cost Cap', 'Maximum spend per project before pipeline cancellation. Default: $5.00.'),
    ]
    for name, desc in settings:
        pdf.bold_bullet(name, f' - {desc}')

    # ── 13. LEGAL GUARDRAILS ──
    pdf.chapter_title('13. Legal Guardrails')
    pdf.body_text(
        'PatentForge includes multiple layers of legal guardrails to reduce unauthorized practice '
        'of law (UPL) exposure:'
    )
    guardrails = [
        ('First-run clickwrap', ' - unskippable agreement on first launch acknowledging the tool provides research, not legal advice.'),
        ('AI role framing', ' - all 6 stage prompts identify the AI as a "research assistant" (not an attorney) with explicit "not a lawyer" and "not legal advice" disclaimers.'),
        ('Embedded per-stage disclaimer', ' - every stage output begins with an italic disclaimer notice that survives copy-paste.'),
        ('Export watermarks', ' - all generated reports (HTML, Word, on-screen) include a persistent legal disclaimer.'),
        ('Hardcoded HTML footer', ' - the report exporter includes a disclaimer div outside the AI content that persists even if AI output is truncated.'),
        ('API key disclaimer', ' - Settings page notes the user is connecting to their own Anthropic account.'),
        ('Evidence-based framing', ' - output uses "indicators" and "assessment" language rather than prescriptive legal advice.'),
    ]
    for bold, rest in guardrails:
        pdf.bold_bullet(bold, rest)

    # ── 14. LICENSE ──
    pdf.chapter_title('14. License')
    pdf.body_text('PatentForge uses a dual license structure:')
    pdf.bold_bullet('Code', ' (backend, frontend, services infrastructure): MIT License')
    pdf.bold_bullet('Prompt content', ' (services/feasibility/src/prompts/): Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)')
    pdf.ln(3)
    pdf.body_text(
        'The CC BY-SA 4.0 license for prompts ensures that disclaimers and legal notices survive '
        'forks and derivative works via the ShareAlike requirement. Anyone who modifies and '
        'redistributes the prompts must use the same license, which means the LEGAL_NOTICE.md '
        'and embedded disclaimers carry forward.'
    )
    pdf.body_text('See LEGAL_NOTICE.md for full details on limitations and responsibilities.')

    # Save
    pdf.output(OUTPUT)
    print(f'OK: {OUTPUT}')

if __name__ == '__main__':
    generate()
