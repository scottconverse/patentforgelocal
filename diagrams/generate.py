import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch
import os

OUT = r"C:\Users\scott\OneDrive\Desktop\Claude\patentforge\diagrams"

blue_dark = '#1B3A5C'
blue_mid = '#2E75B6'
blue_light = '#D5E8F0'
green = '#548235'
green_light = '#E2EFDA'
orange = '#C55A11'
orange_light = '#FCE4D6'
purple = '#7030A0'
purple_light = '#E8D5F5'
gray = '#595959'
gray_light = '#F2F2F2'

def draw_box(ax, x, y, w, h, label, sublabel, fc, ec, fontsize=9):
    box = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.1", facecolor=fc, edgecolor=ec, linewidth=1.5)
    ax.add_patch(box)
    ax.text(x + w/2, y + h/2 + 0.15, label, ha='center', va='center', fontsize=fontsize, fontweight='bold', color=ec)
    if sublabel:
        ax.text(x + w/2, y + h/2 - 0.2, sublabel, ha='center', va='center', fontsize=7, color=gray, style='italic')

# ============================================================
# DIAGRAM 1: Federated System Architecture
# ============================================================
fig, ax = plt.subplots(1, 1, figsize=(12, 9))
ax.set_xlim(0, 12)
ax.set_ylim(0, 9)
ax.axis('off')
fig.patch.set_facecolor('white')

ax.text(6, 8.7, 'PatentForge \u2014 Federated System Architecture', ha='center', fontsize=16, fontweight='bold', color=blue_dark)

draw_box(ax, 3.5, 7.2, 5, 1.2, 'React Frontend', 'TypeScript + Vite + Tailwind CSS', blue_light, blue_mid, fontsize=11)
ax.annotate('', xy=(6, 6.3), xytext=(6, 7.2), arrowprops=dict(arrowstyle='->', color=blue_mid, lw=2))
ax.text(6.6, 6.75, 'HTTP + SSE', fontsize=8, color=gray, style='italic')
draw_box(ax, 3, 4.8, 6, 1.5, 'Central Backend (AutoBE-Generated)', 'NestJS + Prisma + PostgreSQL  |  Port 3000', blue_light, blue_dark, fontsize=11)

services = [
    (0.2, 1.5, 2.2, 1.8, 'Feasibility\nService', 'TypeScript\nPort 3001', green_light, green),
    (2.7, 1.5, 2.2, 1.8, 'Prior Art\nService', 'PQAI (Python)\nPort 3002', blue_light, blue_mid),
    (5.2, 1.5, 2.2, 1.8, 'Claim Drafting\nService', 'LangGraph\nPort 3003', orange_light, orange),
    (7.7, 1.5, 2.2, 1.8, 'Compliance\nService', 'FAISS RAG\nPort 3004', purple_light, purple),
    (10.0, 1.5, 1.8, 1.8, 'USPTO\nData', 'Go/Python\nPort 3005', gray_light, gray),
]
for sx, sy, sw, sh, sl, ss, sfc, sec in services:
    draw_box(ax, sx, sy, sw, sh, sl, ss, sfc, sec)
for sx, _, sw, _, _, _, _, _ in services:
    ax.annotate('', xy=(sx + sw/2, 3.3), xytext=(sx + sw/2, 4.8), arrowprops=dict(arrowstyle='->', color=gray, lw=1.5, linestyle='--'))

cx, cy = 10.5, 5.5
ax.add_patch(plt.Rectangle((cx-0.5, cy-0.4), 1, 0.8, facecolor='#FFF2CC', edgecolor='#BF8F00', linewidth=1.5, zorder=3))
ax.add_patch(matplotlib.patches.Ellipse((cx, cy+0.4), 1, 0.35, facecolor='#FFF2CC', edgecolor='#BF8F00', linewidth=1.5, zorder=4))
ax.add_patch(matplotlib.patches.Ellipse((cx, cy-0.4), 1, 0.35, facecolor='#FFF2CC', edgecolor='#BF8F00', linewidth=1.5, zorder=2))
ax.text(cx, cy, 'PostgreSQL', ha='center', va='center', fontsize=8, fontweight='bold', color='#BF8F00')
ax.annotate('', xy=(9, 5.5), xytext=(10, 5.5), arrowprops=dict(arrowstyle='->', color='#BF8F00', lw=1.5))

legend_items = [(green, 'Your Code (Ported)'), (blue_mid, 'Open Source (MIT)'), (orange, 'New (OSS Patterns)'), (purple, 'Extracted from OSS')]
for i, (c, t) in enumerate(legend_items):
    ax.add_patch(plt.Rectangle((0.3, 0.2 + i*0.3), 0.3, 0.2, facecolor=c, edgecolor='none'))
    ax.text(0.8, 0.3 + i*0.3, t, fontsize=8, va='center', color=gray)

plt.tight_layout()
plt.savefig(os.path.join(OUT, 'architecture.png'), dpi=200, bbox_inches='tight', facecolor='white')
plt.close()
print("1/5: architecture.png OK")

# ============================================================
# DIAGRAM 2: User Journey
# ============================================================
fig, ax = plt.subplots(1, 1, figsize=(14, 5))
ax.set_xlim(0, 14)
ax.set_ylim(0, 5)
ax.axis('off')
fig.patch.set_facecolor('white')
ax.text(7, 4.7, 'PatentForge \u2014 User Journey', ha='center', fontsize=16, fontweight='bold', color=blue_dark)

stages = [
    (0.3, 'INTAKE', 'Invention\nDisclosure', green_light, green),
    (2.2, 'FEASIBILITY', '6-Stage AI\nAnalysis', green_light, green),
    (4.1, 'PRIOR ART', 'ML Patent\nSearch', blue_light, blue_mid),
    (6.0, 'DRAFTING', 'Claim\nGeneration', orange_light, orange),
    (7.9, 'COMPLIANCE', '112 Legal\nChecks', purple_light, purple),
    (9.8, 'APPLICATION', 'Full Patent\nDocument', '#D6E4F0', blue_dark),
    (11.7, 'FILED', 'USPTO\nTracking', gray_light, gray),
]
sources = ['User Input', 'Anthropic\nClaude API', 'PQAI\nML Search', 'AutoPatent +\nM-Cube', 'Claude-Patent-\nCreator RAG', 'All Artifacts\nAssembled', 'USPTO-CLI +\npyUSPTO']

for i, (x, title, desc, fc, ec) in enumerate(stages):
    box = FancyBboxPatch((x, 2.0), 1.7, 2.0, boxstyle="round,pad=0.12", facecolor=fc, edgecolor=ec, linewidth=2)
    ax.add_patch(box)
    circle = plt.Circle((x + 0.85, 3.65), 0.22, facecolor=ec, edgecolor='white', linewidth=1.5, zorder=5)
    ax.add_patch(circle)
    ax.text(x + 0.85, 3.65, str(i), ha='center', va='center', fontsize=10, fontweight='bold', color='white', zorder=6)
    ax.text(x + 0.85, 3.1, title, ha='center', va='center', fontsize=7.5, fontweight='bold', color=ec)
    ax.text(x + 0.85, 2.55, desc, ha='center', va='center', fontsize=7, color=gray)
    ax.text(x + 0.85, 1.5, sources[i], ha='center', va='center', fontsize=6.5, color=gray, style='italic')
    if i < len(stages) - 1:
        ax.annotate('', xy=(x + 1.85, 3.0), xytext=(x + 1.7, 3.0), arrowprops=dict(arrowstyle='->', color=gray, lw=1.5))

ax.annotate('', xy=(6.85, 2.0), xytext=(8.7, 2.0), arrowprops=dict(arrowstyle='->', color='#C00000', lw=1.5, connectionstyle='arc3,rad=-0.4', linestyle='--'))
ax.text(7.8, 1.1, 'Revision loop\n(on failure)', ha='center', fontsize=7, color='#C00000', style='italic')

plt.tight_layout()
plt.savefig(os.path.join(OUT, 'user-journey.png'), dpi=200, bbox_inches='tight', facecolor='white')
plt.close()
print("2/5: user-journey.png OK")

# ============================================================
# DIAGRAM 3: Data Flow
# ============================================================
fig, ax = plt.subplots(1, 1, figsize=(11, 8))
ax.set_xlim(0, 11)
ax.set_ylim(0, 8)
ax.axis('off')
fig.patch.set_facecolor('white')
ax.text(5.5, 7.7, 'PatentForge \u2014 Cross-Stage Data Flow', ha='center', fontsize=16, fontweight='bold', color=blue_dark)

nodes = [
    (1, 6.8, 2.5, 0.5, 'Invention Intake (11 fields)', green_light, green),
    (1, 5.9, 2.5, 0.5, 'Stage 1: Technical Restatement', green_light, green),
    (1, 5.0, 2.5, 0.5, 'Stage 3: Patentability Analysis', green_light, green),
    (1, 4.1, 2.5, 0.5, 'Stage 5: IP Strategy', green_light, green),
    (5, 5.9, 2.5, 0.5, 'PQAI Prior Art Search', blue_light, blue_mid),
    (5, 4.4, 2.5, 0.5, 'Claim Drafter (Multi-Agent)', orange_light, orange),
    (5, 2.9, 2.5, 0.5, 'Compliance Checker (RAG)', purple_light, purple),
    (8.5, 4.4, 2.2, 0.5, 'Application Generator', '#D6E4F0', blue_dark),
    (8.5, 3.4, 2.2, 0.5, 'Export (Word/PDF)', gray_light, gray),
]
for x, y, w, h, label, fc, ec in nodes:
    box = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.08", facecolor=fc, edgecolor=ec, linewidth=1.5)
    ax.add_patch(box)
    ax.text(x + w/2, y + h/2, label, ha='center', va='center', fontsize=8, fontweight='bold', color=ec)

arrows = [
    ((2.25, 6.8), (2.25, 6.4), 'narrative'),
    ((3.5, 6.15), (5, 6.15), 'query'),
    ((3.5, 5.9), (5, 4.75), 'restatement'),
    ((3.5, 5.25), (5, 4.65), 'findings'),
    ((3.5, 4.35), (5, 4.55), 'directions'),
    ((6.25, 5.9), (6.25, 4.9), 'ranked results'),
    ((7.5, 4.65), (8.5, 4.65), 'claims + spec'),
    ((6.25, 4.4), (6.25, 3.4), 'claims'),
    ((7.5, 2.9), (8.5, 3.65), 'pass'),
    ((9.6, 4.4), (9.6, 3.9), ''),
]
for (x1, y1), (x2, y2), label in arrows:
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1), arrowprops=dict(arrowstyle='->', color=gray, lw=1.2))
    if label:
        mx, my = (x1+x2)/2, (y1+y2)/2
        ax.text(mx + 0.15, my + 0.12, label, fontsize=6.5, color=gray, style='italic')

ax.annotate('', xy=(5, 3.15), xytext=(5, 4.4), arrowprops=dict(arrowstyle='->', color='#C00000', lw=1.2, linestyle='--'))
ax.text(4.4, 3.75, 'fail\nrevise', fontsize=7, color='#C00000', style='italic', ha='center')
ax.add_patch(plt.Rectangle((0.7, 3.8), 0.15, 3.3, facecolor=green, edgecolor='none', alpha=0.3))
ax.text(0.5, 5.45, 'FEASIBILITY\nSERVICE', fontsize=7, fontweight='bold', color=green, rotation=90, ha='center', va='center')

plt.tight_layout()
plt.savefig(os.path.join(OUT, 'data-flow.png'), dpi=200, bbox_inches='tight', facecolor='white')
plt.close()
print("3/5: data-flow.png OK")

# ============================================================
# DIAGRAM 4: Database Schema (ERD)
# ============================================================
fig, ax = plt.subplots(1, 1, figsize=(13, 8))
ax.set_xlim(0, 13)
ax.set_ylim(0, 8)
ax.axis('off')
fig.patch.set_facecolor('white')
ax.text(6.5, 7.7, 'PatentForge \u2014 Database Schema (ERD)', ha='center', fontsize=16, fontweight='bold', color=blue_dark)

def draw_entity(ax, x, y, w, h, name, fields, pk_color):
    ax.add_patch(FancyBboxPatch((x, y+h-0.45), w, 0.45, boxstyle="round,pad=0.05,rounding_size=0.08", facecolor=pk_color, edgecolor=pk_color, linewidth=1.5))
    ax.text(x + w/2, y+h-0.22, name, ha='center', va='center', fontsize=9, fontweight='bold', color='white')
    ax.add_patch(plt.Rectangle((x, y), w, h-0.45, facecolor='white', edgecolor=pk_color, linewidth=1.2))
    for i, field in enumerate(fields):
        ax.text(x + 0.1, y + h - 0.65 - i*0.22, field, fontsize=6.5, color=gray, family='monospace')

entities = [
    (0.3, 4.5, 2.5, 3, 'Project', ['id: UUID (PK)', 'title: String', 'status: ProjectStatus', 'createdAt: DateTime', 'updatedAt: DateTime'], blue_dark),
    (3.5, 5.5, 2.8, 2, 'InventionInput', ['id: UUID (PK)', 'projectId: UUID (FK)', 'title, description: String', '+ 9 optional fields'], green),
    (3.5, 3.2, 2.8, 2, 'FeasibilityRun', ['id: UUID (PK)', 'projectId: UUID (FK)', 'version: Int', 'status: RunStatus', 'finalReport: Text?'], green),
    (7, 3.2, 2.8, 2, 'FeasibilityStage', ['id: UUID (PK)', 'runId: UUID (FK)', 'stageNumber: Int (1-6)', 'outputText: Text?', 'model, webSearchUsed'], green),
    (3.5, 0.7, 2.8, 2, 'PriorArtSearch', ['id: UUID (PK)', 'projectId: UUID (FK)', 'version: Int', 'query: String?'], blue_mid),
    (7, 0.7, 2.8, 2, 'PriorArtResult', ['id: UUID (PK)', 'searchId: UUID (FK)', 'patentNumber: String', 'relevanceScore: Float', 'snippet: Text?'], blue_mid),
    (10.2, 5.5, 2.5, 2, 'ClaimDraft', ['id: UUID (PK)', 'projectId: UUID (FK)', 'version: Int', 'specLanguage: Text?'], orange),
    (10.2, 3.2, 2.5, 2, 'ComplianceCheck', ['id: UUID (PK)', 'projectId: UUID (FK)', 'draftVersion: Int', 'overallPass: Boolean'], purple),
    (10.2, 0.7, 2.5, 2, 'PatentApplication', ['id: UUID (PK)', 'projectId: UUID (FK)', 'version: Int', 'title...claims: Text?'], blue_dark),
]
for x, y, w, h, name, fields, color in entities:
    draw_entity(ax, x, y, w, h, name, fields, color)

rels = [
    ((2.8, 6.5), (3.5, 6.5), '1:1'),
    ((2.8, 5.5), (3.5, 4.7), '1:N'),
    ((2.8, 4.8), (3.5, 2.0), '1:N'),
    ((6.3, 4.2), (7, 4.2), '1:N'),
    ((6.3, 1.7), (7, 1.7), '1:N'),
    ((2.8, 5.0), (10.2, 6.5), '1:N'),
    ((2.8, 4.6), (10.2, 4.2), '1:N'),
    ((2.8, 4.5), (10.2, 1.7), '1:N'),
]
for (x1, y1), (x2, y2), label in rels:
    ax.plot([x1, x2], [y1, y2], color=gray, linewidth=1, linestyle='-', alpha=0.6)
    ax.text((x1+x2)/2, (y1+y2)/2 + 0.12, label, fontsize=6, color=gray, ha='center', style='italic')

plt.tight_layout()
plt.savefig(os.path.join(OUT, 'database-schema.png'), dpi=200, bbox_inches='tight', facecolor='white')
plt.close()
print("4/5: database-schema.png OK")

# ============================================================
# DIAGRAM 5: Docker Deployment Topology
# ============================================================
fig, ax = plt.subplots(1, 1, figsize=(12, 7))
ax.set_xlim(0, 12)
ax.set_ylim(0, 7)
ax.axis('off')
fig.patch.set_facecolor('white')
ax.text(6, 6.7, 'PatentForge \u2014 Docker Deployment Topology', ha='center', fontsize=16, fontweight='bold', color=blue_dark)

ax.add_patch(FancyBboxPatch((0.3, 0.3), 11.4, 6, boxstyle="round,pad=0.2", facecolor='#F8F8F8', edgecolor='#2496ED', linewidth=2, linestyle='--'))
ax.text(1, 6.1, 'Docker Compose Network', fontsize=10, fontweight='bold', color='#2496ED')

containers = [
    (1, 4.5, 3, 1.2, 'frontend', ':8080', 'React + Vite\nnginx', blue_light, blue_mid),
    (5, 4.5, 3, 1.2, 'backend', ':3000', 'NestJS + Prisma\nAutoBE-generated', blue_light, blue_dark),
    (9, 4.5, 2.5, 1.2, 'postgres', ':5432', 'PostgreSQL 16\nAlpine', '#FFF2CC', '#BF8F00'),
    (0.5, 2, 2, 1.2, 'feasibility', ':3001', 'TypeScript\nExpress', green_light, green),
    (3, 2, 2, 1.2, 'prior-art', ':3002', 'PQAI Python\nMicroservices', blue_light, blue_mid),
    (5.5, 2, 2, 1.2, 'drafting', ':3003', 'Python\nLangGraph', orange_light, orange),
    (8, 2, 2, 1.2, 'compliance', ':3004', 'Python\nFAISS + BM25', purple_light, purple),
    (10.3, 2, 1.5, 1.2, 'uspto', ':3005', 'Go/Python\nHTTP wrap', gray_light, gray),
]
for x, y, w, h, name, port, desc, fc, ec in containers:
    box = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.08", facecolor=fc, edgecolor=ec, linewidth=1.5)
    ax.add_patch(box)
    ax.text(x + w/2, y + h - 0.25, f'{name} {port}', ha='center', va='center', fontsize=8, fontweight='bold', color=ec)
    ax.text(x + w/2, y + 0.35, desc, ha='center', va='center', fontsize=6.5, color=gray)

ax.annotate('', xy=(5, 5.1), xytext=(4, 5.1), arrowprops=dict(arrowstyle='->', color=blue_mid, lw=1.5))
ax.text(4.5, 5.35, 'HTTP', fontsize=7, color=gray, ha='center')
ax.annotate('', xy=(9, 5.1), xytext=(8, 5.1), arrowprops=dict(arrowstyle='->', color='#BF8F00', lw=1.5))
ax.text(8.5, 5.35, 'TCP', fontsize=7, color=gray, ha='center')

for sx, _, sw, _, _, _, _, _, _ in containers[3:]:
    ax.annotate('', xy=(sx + sw/2, 3.2), xytext=(6.5, 4.5), arrowprops=dict(arrowstyle='->', color=gray, lw=1, linestyle='--'))

ax.annotate('', xy=(2.5, 5.7), xytext=(2.5, 6.4), arrowprops=dict(arrowstyle='->', color=blue_mid, lw=2))
ax.text(2.5, 6.5, 'Browser :8080', fontsize=8, color=blue_mid, ha='center', fontweight='bold')

ax.add_patch(FancyBboxPatch((9.5, 0.5), 2, 0.7, boxstyle="round,pad=0.05", facecolor='#FFF2CC', edgecolor='#BF8F00', linewidth=1, linestyle='--'))
ax.text(10.5, 0.85, 'pgdata volume', ha='center', va='center', fontsize=7, color='#BF8F00', style='italic')

ax.add_patch(FancyBboxPatch((0.5, 0.5), 4.5, 0.7, boxstyle="round,pad=0.05", facecolor='#E2EFDA', edgecolor=green, linewidth=1))
ax.text(2.75, 0.85, 'v0.1 MVP: frontend + backend + feasibility + postgres', ha='center', va='center', fontsize=7.5, fontweight='bold', color=green)

plt.tight_layout()
plt.savefig(os.path.join(OUT, 'docker-topology.png'), dpi=200, bbox_inches='tight', facecolor='white')
plt.close()
print("5/5: docker-topology.png OK")
print("All diagrams generated.")
