"""
PatentForge v1.0.0 — Architecture Diagram Generator
Generates 5 PNG diagrams reflecting the 6-service system architecture.
"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import numpy as np
import os

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Color palette (matching landing page dark theme) ──
BG = '#0f172a'
SURFACE = '#1e293b'
BORDER = '#334155'
TEXT = '#e2e8f0'
MUTED = '#94a3b8'
ACCENT = '#3b82f6'
GREEN = '#22c55e'
AMBER = '#f59e0b'
PURPLE = '#a78bfa'
RED = '#ef4444'
PINK = '#f472b6'
CYAN = '#22d3ee'

def make_box(ax, x, y, w, h, title, subtitle='', color=ACCENT, title_size=11):
    """Draw a rounded box with title and optional subtitle."""
    box = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.02",
                         facecolor=SURFACE, edgecolor=color, linewidth=2)
    ax.add_patch(box)
    cy = y + h/2
    if subtitle:
        ax.text(x + w/2, cy + 0.02, title, ha='center', va='center',
                color=TEXT, fontsize=title_size, fontweight='bold', fontfamily='sans-serif')
        ax.text(x + w/2, cy - 0.04, subtitle, ha='center', va='center',
                color=MUTED, fontsize=8, fontfamily='sans-serif')
    else:
        ax.text(x + w/2, cy, title, ha='center', va='center',
                color=TEXT, fontsize=title_size, fontweight='bold', fontfamily='sans-serif')

def arrow(ax, x1, y1, x2, y2, color=MUTED, style='->', lw=1.5, label='', label_offset=(0, 0.02)):
    """Draw an arrow with optional label."""
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle=style, color=color, lw=lw))
    if label:
        mx, my = (x1+x2)/2 + label_offset[0], (y1+y2)/2 + label_offset[1]
        ax.text(mx, my, label, ha='center', va='center', color=color,
                fontsize=7.5, fontfamily='sans-serif')


# ══════════════════════════════════════════════════════════
# 1. ARCHITECTURE DIAGRAM
# ══════════════════════════════════════════════════════════
def gen_architecture():
    fig, ax = plt.subplots(1, 1, figsize=(14, 8))
    fig.patch.set_facecolor(BG)
    ax.set_facecolor(BG)
    ax.set_xlim(0, 1.4); ax.set_ylim(0, 1)
    ax.axis('off')

    # Title
    ax.text(0.7, 0.96, 'PatentForge — System Architecture (v1.0.0)',
            ha='center', va='center', color=TEXT, fontsize=16, fontweight='bold')

    # ── Row 1: Frontend ──
    make_box(ax, 0.5, 0.82, 0.28, 0.1, 'React Frontend', 'TypeScript + Vite + Tailwind | :8080', ACCENT, 10)

    # ── Row 2: Backend (orchestrator) ──
    make_box(ax, 0.5, 0.65, 0.28, 0.1, 'NestJS Backend', 'Prisma ORM + REST API | :3000', ACCENT, 10)
    arrow(ax, 0.64, 0.82, 0.64, 0.75, MUTED, label='HTTP/SSE', label_offset=(0.06, 0))

    # ── Row 3: Microservices ──
    services = [
        (0.02, 'Feasibility', 'TypeScript\n:3001', GREEN),
        (0.28, 'Claim Drafter', 'Python/FastAPI\n:3002', CYAN),
        (0.54, 'App Generator', 'Python/FastAPI\n:3003', CYAN),
        (0.80, 'Compliance', 'Python/FastAPI\n:3004', CYAN),
    ]
    for sx, sname, ssub, scolor in services:
        make_box(ax, sx, 0.42, 0.22, 0.12, sname, ssub, scolor, 9)
        # Arrow from backend down to service
        arrow(ax, 0.64, 0.65, sx + 0.11, 0.54, MUTED, lw=1)

    # ── Row 4: Database ──
    db_x, db_y = 0.50, 0.2
    ellipse1 = mpatches.Ellipse((db_x + 0.14, db_y + 0.1), 0.22, 0.07,
                                 facecolor=SURFACE, edgecolor=AMBER, linewidth=1.5)
    ax.add_patch(ellipse1)
    rect = mpatches.Rectangle((db_x + 0.03, db_y + 0.03), 0.22, 0.07,
                               facecolor=SURFACE, edgecolor=AMBER, linewidth=1.5)
    ax.add_patch(rect)
    ellipse2 = mpatches.Ellipse((db_x + 0.14, db_y + 0.03), 0.22, 0.07,
                                 facecolor=SURFACE, edgecolor=AMBER, linewidth=1.5)
    ax.add_patch(ellipse2)
    ax.text(db_x + 0.14, db_y + 0.065, 'SQLite / PostgreSQL', ha='center', va='center',
            color=AMBER, fontsize=9, fontweight='bold')
    ax.text(db_x + 0.14, db_y + 0.01, '14 tables', ha='center', va='center',
            color=MUTED, fontsize=7)
    arrow(ax, 0.64, 0.42, 0.64, 0.31, AMBER, label='Prisma', label_offset=(0.04, 0))

    # ── External APIs (right side) ──
    make_box(ax, 1.1, 0.7, 0.22, 0.1, 'Anthropic', 'Claude API (SSE)', PURPLE, 9)
    arrow(ax, 0.78, 0.7, 1.1, 0.75, PURPLE, lw=1, label='SSE stream', label_offset=(0, 0.02))

    make_box(ax, 1.1, 0.52, 0.22, 0.1, 'USPTO ODP', 'Open Data Portal API', PURPLE, 9)
    arrow(ax, 0.78, 0.67, 1.1, 0.57, PURPLE, lw=1, label='REST', label_offset=(0, 0.02))

    make_box(ax, 1.1, 0.34, 0.22, 0.1, 'LiteLLM', 'Model Pricing Data', PURPLE, 9)
    arrow(ax, 0.78, 0.65, 1.1, 0.39, PURPLE, lw=1, label='cost est.', label_offset=(0, 0.02))

    # ── Legend ──
    ax.text(0.02, 0.12, 'Legend:', color=TEXT, fontsize=8, fontweight='bold')
    ax.plot([0.09, 0.13], [0.12, 0.12], color=ACCENT, lw=2); ax.text(0.14, 0.12, 'Internal service', color=MUTED, fontsize=7.5)
    ax.plot([0.09, 0.13], [0.08, 0.08], color=CYAN, lw=2); ax.text(0.14, 0.08, 'LangGraph agent', color=MUTED, fontsize=7.5)
    ax.plot([0.28, 0.32], [0.12, 0.12], color=PURPLE, lw=2); ax.text(0.33, 0.12, 'External API', color=MUTED, fontsize=7.5)
    ax.plot([0.28, 0.32], [0.08, 0.08], color=AMBER, lw=2); ax.text(0.33, 0.08, 'Database', color=MUTED, fontsize=7.5)

    fig.savefig(os.path.join(OUTPUT_DIR, 'architecture.png'), dpi=200, bbox_inches='tight',
                facecolor=BG, edgecolor='none')
    plt.close(fig)
    print('OK: architecture.png')


# ══════════════════════════════════════════════════════════
# 2. DATA FLOW DIAGRAM
# ══════════════════════════════════════════════════════════
def gen_data_flow():
    fig, ax = plt.subplots(1, 1, figsize=(16, 9))
    fig.patch.set_facecolor(BG)
    ax.set_facecolor(BG)
    ax.set_xlim(0, 1.6); ax.set_ylim(0, 1)
    ax.axis('off')

    ax.text(0.8, 0.96, 'PatentForge — Full Pipeline Data Flow (v1.0.0)',
            ha='center', va='center', color=TEXT, fontsize=16, fontweight='bold')

    # ── Column 1: Invention Input ──
    make_box(ax, 0.02, 0.78, 0.18, 0.1, 'Invention Input', '11-field disclosure', ACCENT, 9)

    # ── Column 2: Feasibility (6 stages) ──
    stages_feas = [
        ('Stage 1', 'Technical Intake'),
        ('Stage 2', 'Prior Art Research'),
        ('Stage 3', 'Patentability'),
        ('Stage 4', 'Deep Dive'),
        ('Stage 5', 'IP Landscape'),
        ('Stage 6', 'Consolidated Report'),
    ]
    fx = 0.25
    for i, (label, desc) in enumerate(stages_feas):
        y = 0.78 - i * 0.1
        col = GREEN if i in (1, 5) else ACCENT
        make_box(ax, fx, y, 0.18, 0.07, label, desc, col, 8)
        if i > 0:
            arrow(ax, fx + 0.09, y + 0.07 + 0.03, fx + 0.09, y + 0.07, MUTED)
    # Arrow input -> stage 1
    arrow(ax, 0.20, 0.83, 0.25, 0.83, MUTED, label='narrative', label_offset=(0, 0.02))
    # Web search annotation
    ax.text(fx + 0.22, 0.71, 'web search', ha='left', va='center', color=PURPLE, fontsize=7,
            fontstyle='italic')

    # ── Column 3: Prior Art (USPTO ODP) ──
    pa_y = 0.78
    make_box(ax, 0.50, pa_y, 0.18, 0.07, 'Prior Art Search', 'USPTO ODP API', AMBER, 8)
    arrow(ax, 0.34, 0.34, 0.55, pa_y, MUTED, lw=1, label='triggers', label_offset=(0.02, 0.02))

    # ── Column 4: Claim Drafting ──
    cd_x = 0.74
    claim_agents = [('Planner', CYAN), ('Writer', CYAN), ('Examiner', CYAN)]
    make_box(ax, cd_x, 0.82, 0.2, 0.07, 'Claim Drafter', 'LangGraph pipeline', CYAN, 8)
    for i, (name, col) in enumerate(claim_agents):
        y = 0.72 - i * 0.09
        make_box(ax, cd_x + 0.02, y, 0.16, 0.06, name, '', col, 8)
        if i == 0:
            arrow(ax, cd_x + 0.1, 0.82, cd_x + 0.1, y + 0.06, MUTED)
        else:
            arrow(ax, cd_x + 0.1, y + 0.06 + 0.03, cd_x + 0.1, y + 0.06, MUTED)
    # Arrow from prior art -> claim drafter
    arrow(ax, 0.68, 0.83, 0.74, 0.85, MUTED)

    # ── Column 5: Compliance ──
    comp_x = 1.0
    make_box(ax, comp_x, 0.82, 0.2, 0.07, 'Compliance Check', '4 checks', RED, 8)
    checks = ['101 Eligibility', '102 Novelty', '103 Obviousness', '112 Disclosure']
    for i, chk in enumerate(checks):
        y = 0.72 - i * 0.08
        make_box(ax, comp_x + 0.01, y, 0.18, 0.055, chk, '', RED, 7)
        if i == 0:
            arrow(ax, comp_x + 0.1, 0.82, comp_x + 0.1, y + 0.055, MUTED)
        else:
            arrow(ax, comp_x + 0.1, y + 0.055 + 0.025, comp_x + 0.1, y + 0.055, MUTED)
    # Arrow from claims -> compliance
    arrow(ax, 0.94, 0.85, 1.0, 0.85, MUTED)

    # ── Column 6: Application Generation ──
    app_x = 1.26
    make_box(ax, app_x, 0.82, 0.22, 0.07, 'App Generator', '5 agents / LangGraph', GREEN, 8)
    app_agents = ['Specification', 'Abstract', 'Drawings Desc.', 'Claims Format', 'Final Assembly']
    for i, ag in enumerate(app_agents):
        y = 0.72 - i * 0.075
        make_box(ax, app_x + 0.01, y, 0.2, 0.05, ag, '', GREEN, 7)
        if i == 0:
            arrow(ax, app_x + 0.11, 0.82, app_x + 0.11, y + 0.05, MUTED)
        else:
            arrow(ax, app_x + 0.11, y + 0.05 + 0.025, app_x + 0.11, y + 0.05, MUTED)
    # Arrow from compliance -> app gen
    arrow(ax, 1.20, 0.85, 1.26, 0.85, MUTED)

    # ── Export ──
    make_box(ax, 1.26, 0.28, 0.22, 0.08, 'Export', 'Word / Markdown', AMBER, 9)
    arrow(ax, app_x + 0.11, 0.345, app_x + 0.11, 0.36, MUTED, label='assembly', label_offset=(0.06, 0))

    # SSE streaming annotation
    ax.text(0.02, 0.12, 'Real-time SSE token streaming to browser at every stage',
            color=GREEN, fontsize=8, fontstyle='italic',
            bbox=dict(boxstyle='round,pad=0.3', facecolor=BG, edgecolor=GREEN, linewidth=0.5))

    # Disclaimer
    ax.text(0.02, 0.05, 'Every export includes hardcoded legal disclaimer',
            ha='left', va='center', color=MUTED, fontsize=7, fontstyle='italic')

    fig.savefig(os.path.join(OUTPUT_DIR, 'data-flow.png'), dpi=200, bbox_inches='tight',
                facecolor=BG, edgecolor='none')
    plt.close(fig)
    print('OK: data-flow.png')


# ══════════════════════════════════════════════════════════
# 3. USER JOURNEY
# ══════════════════════════════════════════════════════════
def gen_user_journey():
    fig, ax = plt.subplots(1, 1, figsize=(18, 4.5))
    fig.patch.set_facecolor(BG)
    ax.set_facecolor(BG)
    ax.set_xlim(0, 1.8); ax.set_ylim(0, 0.5)
    ax.axis('off')

    ax.text(0.9, 0.47, 'PatentForge — User Journey (v1.0.0)',
            ha='center', va='center', color=TEXT, fontsize=16, fontweight='bold')

    steps = [
        ('Create\nProject', 'title + status', ACCENT),
        ('Fill Invention\nForm', '11-field disclosure', ACCENT),
        ('Run\nFeasibility', '6-stage pipeline', GREEN),
        ('Review\nReport', 'on-screen viewer', ACCENT),
        ('Search\nPrior Art', 'USPTO ODP', AMBER),
        ('Draft\nClaims', 'Planner/Writer/\nExaminer', CYAN),
        ('Run\nCompliance', '101/102/103/112', RED),
        ('Generate\nApplication', '5-agent pipeline', GREEN),
        ('Export to\nWord', '.docx + .md', AMBER),
        ('Meet Your\nAttorney', 'prepared research', PURPLE),
    ]

    spacing = 0.17
    x_start = 0.03
    for i, (title, sub, color) in enumerate(steps):
        x = x_start + i * spacing
        # Number circle
        circle = mpatches.Circle((x + 0.06, 0.34), 0.018, facecolor=color, edgecolor='none')
        ax.add_patch(circle)
        ax.text(x + 0.06, 0.34, str(i + 1), ha='center', va='center',
                color='white', fontsize=9, fontweight='bold')
        # Box
        make_box(ax, x, 0.07, 0.13, 0.2, title, sub, color, 9)
        # Arrow
        if i < len(steps) - 1:
            arrow(ax, x + 0.13, 0.17, x + spacing, 0.17, MUTED)

    fig.savefig(os.path.join(OUTPUT_DIR, 'user-journey.png'), dpi=200, bbox_inches='tight',
                facecolor=BG, edgecolor='none')
    plt.close(fig)
    print('OK: user-journey.png')


# ══════════════════════════════════════════════════════════
# 4. DATABASE SCHEMA
# ══════════════════════════════════════════════════════════
def gen_database_schema():
    fig, ax = plt.subplots(1, 1, figsize=(18, 11))
    fig.patch.set_facecolor(BG)
    ax.set_facecolor(BG)
    ax.set_xlim(0, 1.8); ax.set_ylim(0, 1.1)
    ax.axis('off')

    ax.text(0.9, 1.07, 'PatentForge — Database Schema (v1.0.0) — 14 Tables',
            ha='center', va='center', color=TEXT, fontsize=16, fontweight='bold')

    def entity_box(x, y, w, h, name, fields, color=ACCENT):
        box = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.01",
                             facecolor=SURFACE, edgecolor=color, linewidth=2)
        ax.add_patch(box)
        header = FancyBboxPatch((x, y + h - 0.04), w, 0.04, boxstyle="round,pad=0.01",
                                facecolor=color, edgecolor=color, linewidth=0)
        ax.add_patch(header)
        ax.text(x + w/2, y + h - 0.02, name, ha='center', va='center',
                color='white', fontsize=9, fontweight='bold')
        for i, field in enumerate(fields):
            ax.text(x + 0.008, y + h - 0.065 - i * 0.025, field,
                    color=MUTED, fontsize=6.5, fontfamily='monospace')

    # ── Group labels ──
    def group_label(x, y, text, color):
        ax.text(x, y, text, ha='left', va='center', color=color,
                fontsize=9, fontweight='bold', fontstyle='italic')

    # ── Row 1: Core ──
    group_label(0.02, 1.0, 'Core', ACCENT)
    entity_box(0.02, 0.78, 0.22, 0.2, 'Project', [
        'id: UUID (PK)', 'title: String', 'status: ProjectStatus',
        'createdAt, updatedAt'
    ], ACCENT)

    entity_box(0.28, 0.78, 0.25, 0.2, 'InventionInput', [
        'id: UUID (PK)', 'projectId: UUID (FK, unique)',
        'title, description: String', '+ 9 optional text fields'
    ], ACCENT)

    entity_box(0.57, 0.78, 0.2, 0.2, 'AppSettings', [
        'id: "singleton"', 'anthropicApiKey', 'defaultModel',
        'researchModel', 'maxTokens', 'interStageDelay'
    ], ACCENT)

    # ── Row 2: Feasibility ──
    group_label(0.02, 0.74, 'Feasibility', GREEN)
    entity_box(0.02, 0.5, 0.25, 0.22, 'FeasibilityRun', [
        'id: UUID (PK)', 'projectId: UUID (FK)',
        'version: Int', 'status: RunStatus',
        'startedAt, completedAt', 'finalReport: Text?'
    ], GREEN)

    entity_box(0.31, 0.5, 0.27, 0.22, 'FeasibilityStage', [
        'id: UUID (PK)', 'feasibilityRunId: FK',
        'stageNumber: Int (1-6)', 'stageName: String',
        'status: RunStatus', 'outputText: Text?',
        'model, webSearchUsed'
    ], GREEN)

    # ── Row 2: Prior Art ──
    group_label(0.64, 0.74, 'Prior Art', AMBER)
    entity_box(0.64, 0.5, 0.22, 0.22, 'PriorArtSearch', [
        'id: UUID (PK)', 'projectId: FK',
        'version: Int', 'query: String[]',
        'status: RunStatus'
    ], AMBER)

    entity_box(0.90, 0.5, 0.24, 0.22, 'PriorArtResult', [
        'id: UUID (PK)', 'searchId: FK',
        'patentNumber: String', 'title: String',
        'relevanceScore: Float', 'abstract: Text?'
    ], AMBER)

    entity_box(1.18, 0.5, 0.22, 0.22, 'PatentDetail', [
        'id: UUID (PK)', 'resultId: FK',
        'claims: Text', 'description: Text',
        'inventors: String[]', 'filingDate'
    ], AMBER)

    entity_box(1.44, 0.5, 0.22, 0.22, 'PatentFamily', [
        'id: UUID (PK)', 'detailId: FK',
        'familyId: String', 'members: Json',
        'jurisdiction: String'
    ], AMBER)

    # ── Row 3: Claims + ODP ──
    group_label(0.02, 0.46, 'Claims', CYAN)
    entity_box(0.02, 0.22, 0.22, 0.22, 'ClaimDraft', [
        'id: UUID (PK)', 'projectId: FK',
        'version: Int', 'status: RunStatus',
        'strategy: Text?', 'model: String'
    ], CYAN)

    entity_box(0.28, 0.22, 0.22, 0.22, 'Claim', [
        'id: UUID (PK)', 'draftId: FK',
        'claimNumber: Int', 'claimType: Enum',
        'text: Text', 'parentClaimId?'
    ], CYAN)

    group_label(0.54, 0.46, 'Compliance', RED)
    entity_box(0.54, 0.22, 0.24, 0.22, 'ComplianceCheck', [
        'id: UUID (PK)', 'projectId: FK',
        'version: Int', 'status: RunStatus',
        'overallScore: Float?'
    ], RED)

    entity_box(0.82, 0.22, 0.24, 0.22, 'ComplianceResult', [
        'id: UUID (PK)', 'checkId: FK',
        'section: String (101-112)',
        'pass: Boolean', 'findings: Text',
        'recommendations: Text'
    ], RED)

    # ── Row 3 continued: Application + ODP ──
    group_label(1.12, 0.46, 'Application', GREEN)
    entity_box(1.12, 0.22, 0.24, 0.22, 'PatentApplication', [
        'id: UUID (PK)', 'projectId: FK',
        'version: Int', 'status: RunStatus',
        'specification: Text?', 'abstract: Text?',
        'exportPath: String?'
    ], GREEN)

    entity_box(1.44, 0.22, 0.22, 0.22, 'OdpApiUsage', [
        'id: UUID (PK)', 'projectId: FK',
        'endpoint: String', 'responseTime: Int',
        'tokensUsed: Int', 'cost: Float'
    ], AMBER)

    # ── Relationships ──
    arrow(ax, 0.24, 0.88, 0.28, 0.88, MUTED, label='1:1', label_offset=(0, 0.015))
    arrow(ax, 0.13, 0.78, 0.13, 0.72, MUTED, label='1:N', label_offset=(0.03, 0))
    arrow(ax, 0.27, 0.61, 0.31, 0.61, MUTED, label='1:N', label_offset=(0, 0.015))
    arrow(ax, 0.13, 0.78, 0.7, 0.72, MUTED, lw=1, label='1:N', label_offset=(0, 0.015))
    arrow(ax, 0.86, 0.61, 0.90, 0.61, MUTED, label='1:N', label_offset=(0, 0.015))
    arrow(ax, 1.14, 0.61, 1.18, 0.61, MUTED, label='1:1', label_offset=(0, 0.015))
    arrow(ax, 1.40, 0.61, 1.44, 0.61, MUTED, label='1:N', label_offset=(0, 0.015))
    arrow(ax, 0.24, 0.33, 0.28, 0.33, MUTED, label='1:N', label_offset=(0, 0.015))
    arrow(ax, 0.78, 0.33, 0.82, 0.33, MUTED, label='1:N', label_offset=(0, 0.015))

    # ── Table count ──
    ax.text(0.02, 0.14, '14 tables total | SQLite (local dev) / PostgreSQL (Docker)',
            color=MUTED, fontsize=8, fontstyle='italic')

    fig.savefig(os.path.join(OUTPUT_DIR, 'database-schema.png'), dpi=200, bbox_inches='tight',
                facecolor=BG, edgecolor='none')
    plt.close(fig)
    print('OK: database-schema.png')


# ══════════════════════════════════════════════════════════
# 5. DOCKER TOPOLOGY
# ══════════════════════════════════════════════════════════
def gen_docker_topology():
    fig, ax = plt.subplots(1, 1, figsize=(14, 8))
    fig.patch.set_facecolor(BG)
    ax.set_facecolor(BG)
    ax.set_xlim(0, 1.4); ax.set_ylim(0, 1)
    ax.axis('off')

    ax.text(0.7, 0.96, 'PatentForge — Docker Deployment Topology (v1.0.0)',
            ha='center', va='center', color=TEXT, fontsize=16, fontweight='bold')

    # Docker Compose Network boundary
    network = FancyBboxPatch((0.03, 0.08), 1.34, 0.82, boxstyle="round,pad=0.02",
                              facecolor='none', edgecolor=ACCENT, linewidth=1.5, linestyle='dashed')
    ax.add_patch(network)
    ax.text(0.7, 0.87, 'Docker Compose Network — 7 containers', ha='center', va='center',
            color=ACCENT, fontsize=10, fontstyle='italic')

    # Browser
    ax.text(0.25, 0.95, 'Browser', ha='center', va='center', color=MUTED, fontsize=9,
            bbox=dict(boxstyle='round,pad=0.3', facecolor=BG, edgecolor=BORDER))
    arrow(ax, 0.25, 0.93, 0.25, 0.83, MUTED, label=':8080')

    # Frontend container (external port)
    make_box(ax, 0.12, 0.72, 0.22, 0.1, 'frontend', 'React + Vite\n:8080 (external)', ACCENT, 9)

    # Backend container (external port)
    make_box(ax, 0.48, 0.72, 0.22, 0.1, 'backend', 'NestJS + Prisma\n:3000 (external)', ACCENT, 9)
    arrow(ax, 0.34, 0.77, 0.48, 0.77, MUTED, label='HTTP/SSE')

    # ── Internal-only services ──
    svc_y = 0.52
    internal_services = [
        (0.05, 'feasibility', 'TypeScript\n:3001 (internal)', GREEN),
        (0.32, 'claim-drafter', 'Python/FastAPI\n:3002 (internal)', CYAN),
        (0.59, 'app-generator', 'Python/FastAPI\n:3003 (internal)', CYAN),
        (0.86, 'compliance', 'Python/FastAPI\n:3004 (internal)', CYAN),
    ]
    for sx, name, sub, col in internal_services:
        make_box(ax, sx, svc_y, 0.24, 0.1, name, sub, col, 8)
        # Arrow from backend down to each service
        arrow(ax, 0.59, 0.72, sx + 0.12, svc_y + 0.1, MUTED, lw=1)

    # PostgreSQL container
    make_box(ax, 0.48, 0.24, 0.22, 0.12, 'postgres', 'PostgreSQL 16\n:5432 (internal)', AMBER, 9)
    arrow(ax, 0.59, 0.72, 0.59, 0.36, AMBER, label='TCP', label_offset=(0.04, 0))

    # Volumes
    ax.text(0.59, 0.15, 'pgdata volume', ha='center', va='center', color=AMBER, fontsize=8,
            bbox=dict(boxstyle='round,pad=0.3', facecolor=BG, edgecolor=AMBER, linewidth=0.5, linestyle='dashed'))
    arrow(ax, 0.59, 0.24, 0.59, 0.19, AMBER, style='->', lw=1)

    # External APIs
    ax.text(1.2, 0.38, 'Anthropic API', ha='center', va='center', color=PURPLE, fontsize=9,
            bbox=dict(boxstyle='round,pad=0.3', facecolor=BG, edgecolor=PURPLE))
    arrow(ax, 1.1, 0.57, 1.15, 0.42, PURPLE, label='HTTPS', label_offset=(0.05, 0))

    ax.text(1.2, 0.24, 'USPTO ODP API', ha='center', va='center', color=PURPLE, fontsize=9,
            bbox=dict(boxstyle='round,pad=0.3', facecolor=BG, edgecolor=PURPLE))
    arrow(ax, 0.7, 0.72, 1.12, 0.27, PURPLE, style='->', lw=1)

    # Note
    ax.text(0.05, 0.12, 'v1.0.0: frontend + backend + feasibility + claim-drafter + app-generator + compliance + postgres',
            color=MUTED, fontsize=7.5, fontstyle='italic')

    fig.savefig(os.path.join(OUTPUT_DIR, 'docker-topology.png'), dpi=200, bbox_inches='tight',
                facecolor=BG, edgecolor='none')
    plt.close(fig)
    print('OK: docker-topology.png')


if __name__ == '__main__':
    print('Generating PatentForge v1.0.0 diagrams...')
    gen_architecture()
    gen_data_flow()
    gen_user_journey()
    gen_database_schema()
    gen_docker_topology()
    print('Done — all 5 diagrams generated.')
