# GitHub Discussions — Seed Posts

These are the initial posts to (re-)create when GitHub Discussions is updated for the merged PatentForge repo (Run 8 cutover). The previous PatentForgeLocal Discussions remain visible; these update the announcement post and add a migration note for existing users.

---

## Category: Announcements (pin this post)

### Title: PatentForge is now one product — your choice: cloud or local

**Body:**

PatentForge and PatentForgeLocal are now one product. Same prompts, same analysis pipelines, same outputs — you pick where the model runs.

**The two modes**

- **Local mode** — Ollama + Google Gemma 4 on your own hardware. Free, fully offline, private. The default for new installs and for everyone upgrading from PatentForgeLocal.
- **Cloud mode** — Anthropic Claude (Haiku 4.5 / Sonnet 4.6 / Opus 4.7) via your own API key. Faster on modest hardware, pay-per-call to your own account, cost shown before every run via a confirm modal.

Switch modes any time in Settings → Provider. Both modes save independently so flipping doesn't lose your other side's settings.

**The two installer editions**

- **Lean** — frontend + backend + services. No Ollama runtime. ~200 MB. Cloud-only target.
- **Full** — Lean + Ollama runtime + first-launch Gemma 4 download. ~880 MB (Windows; smaller on Mac/Linux). Supports both modes.

Both editions can run Cloud mode. Only Full can run Local mode. Pick at download time based on whether you want the option to run locally.

**Where this leaves you**

If you used PatentForgeLocal:
- Install the new Full edition over your existing install. Your data, settings, and the Gemma 4 model are preserved.
- Provider defaults to Local. Your install behaves exactly as before.
- Cloud mode is now the first section on the Settings page if you want to try it. Bring your own Anthropic API key.

If you used the original cloud-only PatentForge (the repo this fork came from):
- That repo is archived after the v0.5.0 cutover (Run 8). The merged product replaces it.
- Reinstall as the merged PatentForge in Cloud mode — your API key transfers in via the Settings page.

If you're new:
- Pick Local if you have 16 GB+ RAM and value privacy + zero cost.
- Pick Cloud if you want frontier-model quality on any hardware and don't mind a small per-run charge to your Anthropic account.

**Current status (merge plan Run 7 complete; v0.5.0 cutover in Run 8)**

- LLM provider abstraction across all four services (Run 2 — LiteLLM)
- Backend `AppSettings.provider` + encrypted `cloudApiKey` (Run 4)
- Frontend Provider chooser + conditional reveals in Settings (Run 5)
- Lean/Full installer split + edition-aware tray + FirstRunWizard branching + CostConfirmModal wiring (Run 6)
- Full docs rewrite covering both modes (Run 7 — this post)
- v0.5.0 release cutover with DB rename + repo rename + tag push (Run 8 — upcoming)

**Caveats — read these**

- This is a research tool, not a legal service. The author isn't a lawyer, the AI isn't a lawyer, and none of the output is legal advice.
- AI-generated analysis may contain errors, omissions, or hallucinated references. Always consult a registered patent attorney before making filing decisions.
- The Node `feasibility` service's Cloud-mode branch currently throws a typed `LLMClientCloudNotImplementedError` pending the Anthropic streaming + tool-call adapter — feasibility runs in Cloud mode are temporarily Anthropic-routed only after that follow-up lands. The 3 Python services already work in both modes via LiteLLM.

If you're trying it out, file bugs as GitHub issues, but use Discussions for questions, ideas, and general chat.

---

### Title: v0.5.0 — PatentForge merge complete (cloud-or-local)

**Body:**

v0.5.0 is the first release of the merged PatentForge product. PatentForgeLocal (the local-only fork) and the original PatentForge (the cloud-only product) are now one application with a provider toggle.

**What changed**

- All four services (3 Python + Node `feasibility`) route LLM calls through an `LLMClient` boundary that dispatches on `AppSettings.provider`. Python uses LiteLLM for both Ollama and Anthropic; the Node service uses Ollama directly for Local and LiteLLM for Cloud (Cloud branch pending a focused adapter follow-up).
- New Settings → Provider section as the first settings entry, with conditional Local / Cloud reveal panels.
- New `installEdition` mirror file (`<baseDir>/config/edition.txt`) written by the installer and reflected into `AppSettings.installEdition`. The tray reads this + a `provider.txt` mirror (written by the backend on every Settings save) to decide whether to manage Ollama as a child process.
- Two installer editions per platform: Lean (cloud-only, no Ollama runtime) and Full (Ollama + Gemma 4 bundled).
- FirstRunWizard branches on edition + chosen provider. Lean skips the chooser and force-saves Cloud. Full opens with a Local/Cloud chooser; the existing local pre-flight (system-check + model-download + Ollama-account) remains intact for Local picks.
- Cloud-mode runs are gated by a `CostConfirmModal` that shows the estimated USD before each Anthropic API call. Local-mode runs bypass the modal entirely.
- Cost rendering across the UI is provider-aware: "Free" everywhere in Local mode; `$N.NNN` in Cloud mode.

**Migration**

- Existing PatentForgeLocal installs upgrade silently. Provider defaults to Local. Your Gemma 4 model and SQLite data are preserved. The DB file is silently renamed from `patentforgelocal.db` to `patentforge.db` on first boot.
- Encrypted API keys remain encrypted with your machine's existing salt — no re-entry needed unless you copy the DB to a new machine.

**Test results (Run 6 baseline at PR merge)**

- 841 automated tests green across all subprojects:
  - backend Jest: 329/329
  - frontend Vitest: 231/231
  - tray Go test + vet: green
  - claim-drafter pytest: 89/89
  - application-generator pytest: 92/92
  - compliance-checker pytest: 71/71
  - feasibility npm test: 29/29
- docker compose config validation: clean
- All 3 installer build scripts (Windows / Mac / Linux) shellcheck-clean

**Acknowledgments**

PatentForge builds on excellent open-source work:

- [Ollama](https://ollama.com) — local LLM runtime
- [Google Gemma 4](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/) — open-weight model family
- [Anthropic Claude](https://www.anthropic.com) — frontier cloud LLM
- [LiteLLM](https://github.com/BerriAI/litellm) — unified provider abstraction
- [context-mode](https://github.com/scottconverse/context-mode) — context window compression

---

## Category: Q&A

### Title: How do I switch from Local to Cloud mode (or back)?

**Body:**

Open Settings → the Provider section is at the top. Pick Local (Ollama) or Cloud (Anthropic). Fill in the relevant fields (Anthropic API key for Cloud; Ollama URL + local model for Local). Save.

After saving, the backend writes a mirror file at `<install-dir>/config/provider.txt` so the tray sees the new value on its next launch. The change takes effect the next time you restart services — right-click the tray icon → Restart Services.

Why the restart? The tray decides whether to spawn an Ollama child process at boot, based on the current provider. Changing the provider mid-session doesn't kill or start Ollama on the fly — that happens at service-manager (re)start. A restart of services is cheap; the browser refresh picks up the new state in under a second.

If you're on a Lean install and want to switch to Local mode, you'll need to install Ollama separately (Lean ships without it). Pull the Gemma 4 model with `ollama pull gemma4:e4b`, set the Ollama URL in Settings, then switch the provider.

---

### Title: Why does cloud mode show a cost modal before every run?

**Body:**

Two reasons:

1. **Transparency.** Cloud mode calls Anthropic on your behalf, and those calls bill against your account. The modal shows the estimated cost (computed from past runs of the same project, or a typical baseline if there's no history) before any API call is made.
2. **A panic button.** If you accidentally hit Run, the modal gives you a chance to back out without sending the invention to Anthropic. Esc, backdrop click, and the Cancel button all dismiss without making a call.

Local mode bypasses the modal because there's no per-token cost. Inference runs on your machine; the cost is whatever Gemma 4 costs in electricity, which is well below the noise floor of your monthly power bill.

The modal estimate isn't exact — actual cost depends on how much context the invention narrative + prior art generate. The final cost appears in the run summary alongside the estimated one.

---

### Title: What's in the Lean vs Full installer?

**Body:**

Both editions ship:

- React frontend (Vite + TypeScript)
- NestJS backend (REST API, SSE proxy, SQLite + Prisma)
- 3 Python FastAPI services (claim-drafter, application-generator, compliance-checker)
- Node Express service (feasibility)
- Go system tray app (process manager)
- All shared assets (prompts, icons, the SQLite schema, encryption tooling)

The **Full** edition additionally bundles:

- Ollama runtime binary (`runtime/ollama/ollama` or `ollama.exe`)
- A first-launch hook that pulls the default Gemma 4 model (`gemma4:e4b`, ~10 GB compressed) into `<install-dir>/models/`

The **Lean** edition skips both of those. The marker file `<install-dir>/config/edition.txt` records which edition was installed; the tray and the backend both read it.

Decision criteria:
- Want Local mode? Need Full.
- Want both modes available? Need Full.
- Cloud-only and want the smallest download? Lean.

You can convert a Lean install into a Local-capable install by installing Ollama separately and pointing Settings → Provider → Local panel at it. But the simplest path is to grab Full from the start.
