import express from 'express';
import cors from 'cors';
import { runPipeline } from './pipeline-runner';
import { InventionInput, AnalysisSettings } from './models';
import { getPromptHashes } from './prompts/loader';

const app = express();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'OPTIONS'],
}));
app.use(express.json({ limit: '10mb' }));

// Internal service auth — set INTERNAL_SERVICE_SECRET to require it.
// When not set, auth is disabled (dev mode / backward compatible).
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET || '';

function requireInternalSecret(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!INTERNAL_SECRET) return next(); // Auth disabled
  const provided = req.headers['x-internal-secret'];
  if (provided !== INTERNAL_SECRET) {
    res.status(403).json({ error: 'Invalid or missing internal service secret' });
    return;
  }
  next();
}

// ── Health check (no auth — used for Docker health checks) ───────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'patentforge-feasibility', promptHashes: getPromptHashes() });
});

// ── Main analysis endpoint — SSE stream (requires internal auth) ─────────────
app.post('/analyze', requireInternalSecret, async (req, res) => {
  const { inventionNarrative, settings, priorArtContext, startFromStage, previousOutputs } = req.body as {
    inventionNarrative: string;
    settings: AnalysisSettings;
    priorArtContext?: string;
    startFromStage?: number;
    previousOutputs?: Record<number, string>;
  };

  if (!inventionNarrative || typeof inventionNarrative !== 'string') {
    res.status(400).json({ error: 'inventionNarrative is required and must be a string' });
    return;
  }

  if (!settings?.apiKey) {
    res.status(400).json({ error: 'settings.apiKey is required' });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Create abort controller for cancellation when the client disconnects.
  // Use res.on('close') not req.on('close') — the request stream closes as soon as
  // the body is consumed, which would abort the pipeline immediately.
  const abortController = new AbortController();
  res.on('close', () => {
    abortController.abort();
  });

  // Helper to send an SSE event
  function sendEvent(eventType: string, data: unknown): void {
    if (res.writableEnded) return;
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  // Wrap the narrative in an InventionInput.
  // rawNarrative is set so the pipeline passes it through as-is (no double-labelling).
  const input: InventionInput = {
    title: 'Invention',
    description: inventionNarrative,
    rawNarrative: inventionNarrative,
  };

  if (!settings.model) {
    res.status(400).json({ error: 'settings.model is required. Configure a default model in Settings.' });
    return;
  }

  // Apply defaults to settings — model is required, no silent fallback to expensive model
  const resolvedSettings: AnalysisSettings = {
    model: settings.model,
    researchModel: settings.researchModel,
    maxTokens: settings.maxTokens || 32000,
    interStageDelaySeconds: settings.interStageDelaySeconds ?? 5,
    apiKey: settings.apiKey,
    priorArtContext: priorArtContext || undefined,
  };

  // Keepalive heartbeat: send an SSE comment every 20s while the pipeline runs.
  // This prevents the browser and any intermediate proxies from closing an idle
  // connection (which can happen during long first-token waits, e.g. Stage 6).
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(':keepalive\n\n');
    }
  }, 20_000);

  const resumeFromStage = typeof startFromStage === 'number' && startFromStage > 1 ? startFromStage : 1;
  const seedMap = new Map<number, string>(
    Object.entries(previousOutputs ?? {}).map(([k, v]) => [Number(k), v])
  );

  try {
    const generator = runPipeline(input, resolvedSettings, abortController.signal, resumeFromStage, seedMap);
    for await (const event of generator) {
      sendEvent(event.type, event);
    }
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      sendEvent('error', { stage: 0, message: err?.message ?? 'Unknown error' });
    }
  } finally {
    clearInterval(heartbeat);
  }

  if (!res.writableEnded) {
    res.end();
  }
});

// Prevent unhandled AbortError from crashing the process when clients disconnect
process.on('unhandledRejection', (reason: any) => {
  if (reason?.name === 'AbortError') return; // expected when client disconnects
  console.error('[Feasibility] Unhandled rejection:', reason);
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001', 10);
app.listen(PORT, () => {
  console.log(`Feasibility service running on port ${PORT}`);
});

export default app;
