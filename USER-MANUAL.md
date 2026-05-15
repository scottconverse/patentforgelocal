# PatentForge User Manual — v0.5.0

A step-by-step guide for using PatentForge to research and prepare for a patent consultation. PatentForge runs in two modes — Local (on your hardware) or Cloud (Anthropic) — and this manual covers both.

---

## 1. What is PatentForge?

PatentForge is a program that runs on your computer. You describe your invention, and it uses AI to analyze whether your idea might be patentable. It searches for similar patents, identifies potential legal issues, and produces a detailed report you can take to a patent attorney.

You choose where the AI runs:

- **Local mode** — the AI model runs on your own computer (Ollama + Google Gemma 4). Your invention description never leaves your machine. Free; no API keys; no recurring cost; requires a reasonably capable computer.
- **Cloud mode** — the AI runs on Anthropic's servers (Claude). You bring your own Anthropic API key. Faster on modest hardware; the cost of each analysis rides on your Anthropic account.

You can switch modes any time in Settings. Same prompts, same analysis pipelines, same outputs — only the underlying model changes.

### What it does

- Searches for similar patents (called "prior art") to see if something like your invention already exists
- Analyzes your invention's novelty — what makes it different from what came before
- Identifies potential legal issues under U.S. patent law
- Generates a detailed feasibility report
- Drafts patent claims — the specific legal boundaries that define what your patent would protect
- Generates a draft patent application — the full document you would file with the patent office
- Checks compliance against 35 USC 112(a), 112(b), 101, and MPEP 608 formalities

### What it is NOT

PatentForge is **not a lawyer, not a legal service, and does not provide legal advice**. The author of this tool is not a lawyer. The AI that generates the analysis is not a lawyer. No attorney-client relationship is created by using this tool.

AI-generated analysis may contain errors, omissions, or fabricated references — including made-up patent numbers and inaccurate legal citations. Patent law is complex, and decisions about whether and how to file should always be made with a registered patent attorney or patent agent.

### What it costs

**Local mode is free.** The AI runs on your computer. There is no subscription, no per-use fee, no cloud service to pay for.

**Cloud mode costs whatever your Anthropic account charges per call.** A full 6-stage feasibility analysis typically runs between $0.10 (Haiku 4.5) and $2.00 (Opus 4.7) depending on model choice and invention narrative length. You see an estimated cost before each run and confirm before any API call is made.

### Your privacy

In **Local mode**, your invention description never leaves your computer. No data is sent to any external server unless you specifically enable optional features (web search or USPTO patent database lookups). Even then, only search terms are sent — never your full invention description. See Section 14 (Privacy & Security).

In **Cloud mode**, your invention description and prompts are sent to Anthropic per their API Terms. Anthropic does not train on API traffic (per current policy at time of writing — verify in their Trust Center). Your Anthropic API key is encrypted at rest on your machine. PatentForge does not send any data to PatentForge servers — there are no PatentForge servers.

---

## 2. System requirements

|  | Cloud mode | Local mode |
|---|---|---|
| **RAM** | 4 GB | 16 GB minimum · 32 GB+ recommended |
| **Free disk space** | 1 GB | 25 GB minimum · 50 GB+ recommended |
| **Processor (CPU)** | 2 cores, 2018+ | 4 cores, 2018+ · 8+ recommended |
| **Graphics card (GPU)** | Not required | Not required; dramatically speeds inference if present (NVIDIA CUDA / AMD ROCm / Apple Silicon Metal) |
| **Operating system** | Windows 10+, macOS 12+, Ubuntu 22+ | Same |

Cloud mode is lightweight because the model runs on Anthropic; PatentForge in Cloud mode is essentially a UI + orchestrator + your local SQLite database.

Local mode pulls Gemma 4 (~10 GB compressed weights) on first launch and keeps it on disk. The default model is `gemma4:e4b` (a dense 4B-parameter model with 128K context). Heavier options include `gemma4:26b` (MoE, ~17 GB weights, slower but higher quality).

### How to check your computer's specs

**On Windows:** Press Win+I → System → About. Look for "Installed RAM" and "Processor." For disk: File Explorer → right-click C: → Properties.

**On macOS:** Apple menu → About This Mac. For disk: Apple menu → System Settings → General → Storage.

**On Linux:** `free -h` (RAM), `df -h /` (disk), `lscpu` (CPU).

---

## 3. Installation

PatentForge ships two installer **editions** per platform:

| Edition | What's bundled | Pick this when |
|---|---|---|
| **Lean** | Frontend + backend + Python services. No Ollama runtime. Smaller download. | You only want Cloud mode. You have an Anthropic API key. You want the smallest install. |
| **Full** | Everything in Lean + Ollama runtime + first-launch model download. | You want Local mode, or you want the option to switch between modes. |

Both editions can run Cloud mode. Only the Full edition can run Local mode (Lean has no Ollama bundled).

### Windows

1. Download `PatentForge-Full-<version>-Setup.exe` or `PatentForge-Lean-<version>-Setup.exe` from [GitHub Releases](https://github.com/scottconverse/patentforge/releases/latest).
2. Run the installer. Accept the license. Choose an install location.
3. Launch PatentForge from the Start menu or desktop shortcut.

### macOS

1. Download `PatentForge-Full-<version>.dmg` or `PatentForge-Lean-<version>.dmg`.
2. Open the DMG and drag PatentForge to your Applications folder.
3. **First launch:** right-click the app → Open (the DMG is unsigned). Confirm the "from internet" prompt. Or run `xattr -cr /Applications/PatentForge.app` once.

### Linux

1. Download `PatentForge-Full-<version>.AppImage` or `PatentForge-Lean-<version>.AppImage`.
2. `chmod +x PatentForge-*.AppImage`
3. Run it: `./PatentForge-*.AppImage`

### Upgrading from PatentForgeLocal

If you already have PatentForgeLocal installed: install the new PatentForge **Full** edition over it. Your existing data, settings, and downloaded Gemma 4 model are preserved. Provider defaults to **Local** automatically — your install behaves exactly as before. Cloud mode is now available in Settings if you want to try it.

---

## 4. First launch

A wizard runs the first time PatentForge starts. The wizard flow depends on the installer edition.

### Full edition first launch

1. **Welcome** — brief overview of both modes.
2. **Pick a mode** — Local or Cloud. You can change this later in Settings.
3. **Local mode path:**
   - **System check** — verifies RAM, CPU, disk space. Warnings are non-blocking; you can proceed even on borderline hardware (analysis will just be slower).
   - **Model download** — pulls Gemma 4 (~10 GB) the first time. Progress bar shown.
   - **Optional API keys** — enter your Ollama Web Search token (for web-augmented analysis; free at ollama.com) and USPTO API key (free at data.uspto.gov). Both optional; skip is fine.
4. **Cloud mode path:**
   - **Anthropic API key** — paste your `sk-ant-...` key. Get one at [console.anthropic.com](https://console.anthropic.com/settings/keys). Stored encrypted at rest.
   - **USPTO API key** (optional).
5. **Disclaimer** — research-tool acknowledgment.
6. **Ready** — wizard completes; main app opens in your browser.

### Lean edition first launch

Lean installers ship without Ollama, so the wizard goes straight to Cloud mode setup:

1. **Welcome** — describes Lean as the cloud-only edition.
2. **Anthropic API key** — paste your key.
3. **USPTO API key** (optional).
4. **Disclaimer**.
5. **Ready**.

If you later want Local mode on a Lean install, you'll need to install Ollama separately (and the Provider switch won't appear until you do).

---

## 5. The main interface

After the wizard completes, PatentForge opens in your default browser at `http://localhost:3001`. The interface has three areas:

- **Sidebar** (left) — the pipeline (Invention Intake → Feasibility → Prior Art → Claims → Compliance → Application) with a "Total cost" footer that reads **"Free"** in Local mode or `$N.NNN` in Cloud mode.
- **Main content** (center) — whatever you're working on (project list, invention form, running analysis, report, etc.).
- **Top-right** — Settings link.

The tray icon (Windows taskbar / macOS menu bar / Linux system tray) shows service health. Right-click it for menu options (Open, Restart Services, View Logs, Quit).

---

## 6. Creating your first project

1. From the project list, click **New Project**.
2. Enter a title and click **Create**.
3. Fill out the **Invention Intake** form. The fields prompt you for:
   - Title
   - Description (minimum word count enforced)
   - Problem solved, how it works, novel aspects, current alternatives, what you've built, what to protect, additional notes.
4. Save the form. You'll return to the project overview.

Tips for a good invention description:
- Be specific. "A device that uses AI" is too vague; "A handheld device that uses an on-device neural network to identify edible wild mushrooms from a photograph and warn the user of dangerous look-alikes" is workable.
- Describe the problem you're solving and the existing alternatives — this anchors the prior art search.
- Note any 3D-printed or AI components explicitly — the system surfaces special considerations for those.

---

## 7. Running feasibility analysis

From the project overview (or sidebar), click **Run Feasibility**. What happens next depends on your mode.

### Local mode

The run starts immediately. There's nothing to confirm because local inference is free.

The 6 stages execute sequentially:

1. **Technical intake & restatement** — the model summarizes your invention back to you in technical-disclosure shape. ~30s–2min depending on hardware.
2. **Prior art research** — uses the prior-art search results (USPTO + optional web search) to ground the analysis in actual existing patents.
3. **Patentability analysis** — assesses 102 (novelty), 103 (non-obviousness), 101 (eligibility).
4. **Deep dive** — surfaces nuance specific to your invention's category.
5. **IP strategy & recommendations** — advice on claim strategy, filing approach, defensive vs offensive posture.
6. **Comprehensive report** — consolidated final write-up.

Stream the analysis live in the **Running** view. Click any completed stage in the sidebar to view its full output.

### Cloud mode

When you click Run Feasibility (or Resume on a failed run), a **cost-confirm modal** opens first:

- Shows the estimated USD cost for the full 6-stage run.
- Estimate uses your project's past-run history if available; otherwise a typical baseline (~$0.50).
- **Approve** kicks off the run.
- **Cancel** discards the intent. No API call is made.
- Esc and backdrop click also cancel.

After Approve, the run streams in the same way as Local mode. Per-stage cost appears under each stage card in the sidebar; the running total appears at the bottom.

You can change the active model in Settings → AI Model. Haiku 4.5 is the cheapest; Opus 4.7 is the most capable; Sonnet 4.6 is the balanced default.

---

## 8. Prior art search

Independent of feasibility, you can run a USPTO PatentSearch query directly:

1. **Prior Art** in the sidebar opens the panel.
2. The system auto-derives a query from your invention narrative on first run. You can edit it.
3. **Run Search** sends the query to USPTO.
4. Results stream in with relevance scores, snippets, and clickable patent numbers (open detail drawer with full claims + family info).

Prior art search runs in parallel with feasibility — feasibility stage 2 (Prior Art Research) uses these results as context. If you've already pulled prior art, feasibility uses it; if not, feasibility kicks off its own search.

Prior art search does NOT consume Anthropic credits even in Cloud mode — it hits USPTO's API directly. Web search (Ollama Cloud) is similarly free (subject to the free-tier quotas of ollama.com).

---

## 9. Claim drafting

After feasibility completes, click **Claims** in the sidebar. The 3-agent pipeline runs:

- **Planner** — designs the claim strategy (number of independents, dependency chains, scope levels).
- **Writer** — drafts claim text per the planner's spec.
- **Examiner** — does a self-review pass and flags issues.

In Cloud mode, this is also gated by the cost-confirm modal. Estimated cost shows the full 3-agent total.

The output is a draft claim set, organized by independent and dependent claims with examiner notes attached to each.

---

## 10. Compliance checking

After claims are drafted, click **Compliance** in the sidebar. The pipeline runs 4 specialized agents:

- **112(a) written description** — does the spec support the claims?
- **112(b) definiteness** — are claim terms unambiguous?
- **101 eligibility** — is the subject matter patentable?
- **MPEP 608 formalities** — citation format, reference numerals, claim format.

Each rule produces PASS / FAIL / WARN with detail and (where relevant) MPEP citations.

A UPL (Unauthorized Practice of Law) acknowledgment modal appears the first time you run compliance check on a project. The output is research output, not legal advice — that point is made every place compliance results show up.

---

## 11. Application generation

The final stage builds a full draft USPTO application. Click **Application** in the sidebar. The 5-agent pipeline writes:

- Title
- Cross-references
- Background
- Summary
- Detailed description
- Claims (carried over from drafting)
- Abstract
- Figure descriptions
- IDS (Information Disclosure Statement) table

Export options: Markdown, Word (.docx), or HTML.

---

## 12. Settings

Open Settings from the link at the top-right of any page. The page has these sections (top to bottom):

### Provider

The first section. A radio chooser: **Local (Ollama)** or **Cloud (Anthropic)**.

- **Local panel** appears when Local is selected: Ollama URL (defaults to `http://localhost:11434`), Local default model dropdown (Gemma 4 e4b / 26B / etc.), model-ready status indicator.
- **Cloud panel** appears when Cloud is selected: Cloud API key (password input with show/hide toggle), Cloud default model dropdown (Claude Haiku 4.5 / Sonnet 4.6 / Opus 4.7).

Switching providers preserves both sides' settings — you can flip Local ↔ Cloud freely without re-entering anything.

> **Apply takes effect on next service restart.** After changing the provider, use Tray → Restart Services (or restart the app) for the change to take effect across all services. The frontend reflects the change immediately, but the running services started with the previous provider value.

### AI Model

(In Local mode) Ollama connection status, model name, "Test connection" button.

(In Cloud mode) Anthropic API status (live-checked on save).

### API Keys

- **Ollama Web Search Key** — optional Ollama Cloud account token for web-augmented analysis.
- **USPTO API Key** — optional, enables structured prior art search via data.uspto.gov.

Both encrypted at rest using your machine's keychain-derived key.

### ODP Usage

Weekly USPTO API call count + rate-limit summary.

### Analysis Parameters

- **Max tokens** — per-stage output cap (default 32000).
- **Inter-stage delay** — pause between stages (default 5s).
- **Research model** — optional; used for stages that benefit from a different model. Empty means use the default model.

### Export

- **Export path** — where Word/Markdown exports land.
- **Auto-export** — if checked, every completed feasibility run auto-exports to disk.

---

## 13. Cost display behavior

PatentForge shows estimated costs alongside every analysis result. The display is provider-aware:

- **Local mode** — all cost fields read **"Free"**. There's no per-token cost; Gemma 4 runs on your hardware.
- **Cloud mode** — costs display as `$N.NNN` (or `<$0.001` for sub-tenth-cent items). Per-stage estimates appear under each stage card; a running total appears at the bottom of the sidebar.

This applies to:
- Sidebar pipeline → Feasibility → Total cost
- Stage cards (per-stage cost)
- Stage Output Viewer (selected stage detail)
- Run History (per-run cost)
- Application tab estimated cost
- Compliance tab estimated cost

---

## 14. Privacy & security

### Local mode

- All inference happens on your computer via Ollama. The model weights are downloaded once and stored locally.
- The SQLite database lives at `<install-dir>/data/patentforge.db`. (If you upgraded from PatentForgeLocal, the old `patentforgelocal.db` is automatically renamed on first boot.)
- API keys (USPTO, Ollama Cloud) are encrypted at rest with a machine-derived key.
- Optional outbound: USPTO API for prior art, Ollama Cloud API for web search. Both opt-in.

### Cloud mode

- Invention text + prompts are sent to Anthropic per their API Terms. PatentForge calls Anthropic directly from your machine — there are no PatentForge servers in between.
- Your Anthropic API key is encrypted at rest with a machine-derived key.
- The cost-confirm modal makes every API call explicit; nothing is sent without your approval.
- Anthropic's enterprise policy (as of writing) is to not train on API traffic. Verify current policy at [trust.anthropic.com](https://trust.anthropic.com).

### Both modes

- No telemetry. PatentForge does not phone home.
- No analytics. No usage tracking.
- Reports include a disclaimer banner identifying them as AI-generated research, not legal advice.

---

## 15. Tray menu reference

Right-click the tray icon for:

- **Open PatentForge** — opens the browser to the running app.
- **Status** — quick health summary.
- **View Logs** — opens the logs directory in your file manager.
- **Restart Services** — restarts every service (use this after Settings changes that need to propagate, e.g., a provider switch).
- **About** — links to GitHub releases.
- **Quit** — stops all services and exits.

---

## 16. Troubleshooting

### Local mode: "Ollama is not running"

The Full installer bundles Ollama, but if the service didn't start, the tray menu shows a degraded status:

- Right-click tray → Restart Services.
- If that fails, check logs (Tray → View Logs → look at `ollama.log`).
- On Windows, the bundled Ollama lives in `<install-dir>\runtime\ollama\ollama.exe`. On Mac/Linux, the wrapper script auto-downloads Ollama from ollama.com if the bundled copy is missing.

### Cloud mode: "Anthropic API call failed"

- Verify your API key in Settings → Provider → Cloud panel. Click Save and Restart Services.
- Check your Anthropic account: [console.anthropic.com](https://console.anthropic.com).
- Out of credits? Add credit in your Anthropic Workspace settings.
- Rate limited? Anthropic enforces per-minute and per-day rate limits; wait a few minutes and retry.

### "Model not ready" (Local mode)

The model-ready flag flips to `true` after the first-run wizard completes the Gemma 4 download. If it didn't:

- Settings → AI Model → Test Connection.
- If the model is missing, use the Settings page or run `ollama pull gemma4:e4b` in a terminal pointing at the bundled Ollama.

### Cost shows "$0.000" in Cloud mode

This means the per-token pricing for the model you selected isn't in the local pricing table. The run will still proceed; the cost just won't be tracked accurately. Update PatentForge to a newer version that includes pricing for your model.

---

## 17. Where things live on disk

| What | Path (default) |
|---|---|
| App binaries | `<install-dir>/` |
| Database | `<install-dir>/data/patentforge.db` |
| Logs | `<install-dir>/logs/` |
| Config + edition marker | `<install-dir>/config/` |
| Ollama models (Full edition) | `<install-dir>/models/` |
| Exports (default) | Your Documents folder, configurable in Settings |

The `data/`, `logs/`, `config/`, and `models/` directories survive uninstall by default — you keep your projects and the 10 GB Gemma 4 download.

---

## 18. Getting help

- **GitHub Discussions** — [github.com/scottconverse/patentforge/discussions](https://github.com/scottconverse/patentforge/discussions)
- **GitHub Issues** — for bug reports
- **Changelog** — [CHANGELOG.md](CHANGELOG.md) for what changed and when

PatentForge is a research tool, not a legal service. For decisions that affect your patent rights, consult a registered patent attorney or agent.
