/**
 * Local model info — Ollama inference has no per-token cost.
 * Kept for compatibility with components that reference model metadata.
 */
export const LOCAL_MODELS: Record<string, { label: string; parameterSize: string }> = {
  'gemma4:26b': { label: 'Gemma 4 (27B MoE)', parameterSize: '18 GB' },
  'gemma3:27b': { label: 'Gemma 3 (27B)', parameterSize: '16 GB' },
  'llama4:scout': { label: 'Llama 4 Scout', parameterSize: '17 GB' },
};

/** Get a human-readable label for a model */
export function getModelLabel(model: string): string {
  return LOCAL_MODELS[model]?.label ?? model;
}
