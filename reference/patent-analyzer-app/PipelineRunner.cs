using PatentAnalyzer.Models;

namespace PatentAnalyzer.Services;

/// <summary>
/// Orchestrates the 6-stage patent analysis pipeline.
/// Each stage feeds its output into the next as context.
/// </summary>
public class PipelineRunner
{
    private readonly AppSettings _settings;
    private AnthropicClient? _client;
    private CancellationTokenSource? _cts;

    public static readonly StageDefinition[] Stages = new[]
    {
        new StageDefinition
        {
            Number = 1,
            Name = "Technical Intake & Restatement",
            Description = "Restates the invention in precise technical terms, identifies components, data flows, AI elements, and 3D printing elements.",
            UsesWebSearch = false,
            // Prompt embedded in PromptTemplates.cs
        },
        new StageDefinition
        {
            Number = 2,
            Name = "Prior Art Research",
            Description = "Searches patents, academic papers, products, and open-source projects for prior art.",
            UsesWebSearch = true,
            WebSearchMaxUses = 20,
            // Prompt embedded in PromptTemplates.cs
        },
        new StageDefinition
        {
            Number = 3,
            Name = "Patentability Analysis",
            Description = "Analyzes §101 eligibility, §102 novelty, §103 obviousness, and §112 enablement.",
            UsesWebSearch = true,
            WebSearchMaxUses = 5,
            // Prompt embedded in PromptTemplates.cs
        },
        new StageDefinition
        {
            Number = 4,
            Name = "Deep Dive Analysis",
            Description = "Specialized deep analysis of the invention's most patentable and riskiest elements.",
            UsesWebSearch = true,
            WebSearchMaxUses = 10,
            // Prompt embedded in PromptTemplates.cs
        },
        new StageDefinition
        {
            Number = 5,
            Name = "IP Strategy & Recommendations",
            Description = "Filing strategy, cost estimates, trade secret boundaries, claim directions, and timeline.",
            UsesWebSearch = false,
            // Prompt embedded in PromptTemplates.cs
        },
        new StageDefinition
        {
            Number = 6,
            Name = "Comprehensive Report",
            Description = "Assembles all findings into a single professional patent analysis report.",
            UsesWebSearch = false,
            // Prompt embedded in PromptTemplates.cs
        }
    };

    // Callbacks
    public event Action<int, string>? OnStageStart;
    public event Action<string>? OnToken;
    public event Action<string>? OnStatus;
    public event Action<int, StageResult>? OnStageComplete;
    public event Action<AnalysisResult>? OnPipelineComplete;
    public event Action<int, string>? OnStageError;

    public PipelineRunner(AppSettings settings)
    {
        _settings = settings;
    }

    public async Task<AnalysisResult> RunAsync(InventionInput input)
    {
        _cts = new CancellationTokenSource();
        _client = new AnthropicClient(_settings.ApiKey);

        var result = new AnalysisResult
        {
            Input = input,
            StartedAt = DateTime.Now
        };

        var previousOutputs = new Dictionary<int, string>();

        try
        {
            foreach (var stageDef in Stages)
            {
                _cts.Token.ThrowIfCancellationRequested();

                var stageResult = new StageResult
                {
                    StageNumber = stageDef.Number,
                    StageName = stageDef.Name,
                    Status = StageStatus.Running,
                    StartedAt = DateTime.Now
                };

                result.Stages.Add(stageResult);
                OnStageStart?.Invoke(stageDef.Number, stageDef.Name);

                try
                {
                    // Build prompts
                    var systemPrompt = PromptTemplates.GetSystemPrompt(stageDef.Number);
                    var userMessage = BuildUserMessage(stageDef.Number, input, previousOutputs);

                    // Choose model — research-heavy stages can use cheaper model
                    var model = (stageDef.Number == 2 && !string.IsNullOrWhiteSpace(_settings.ResearchModel))
                        ? _settings.ResearchModel
                        : _settings.Model;

                    stageResult.Model = model;

                    // Execute with streaming
                    var streamResult = await _client.StreamMessageAsync(
                        systemPrompt: systemPrompt,
                        userMessage: userMessage,
                        model: model,
                        maxTokens: _settings.MaxTokens,
                        useWebSearch: stageDef.UsesWebSearch,
                        webSearchMaxUses: stageDef.WebSearchMaxUses,
                        onToken: text => OnToken?.Invoke(text),
                        onStatus: status => OnStatus?.Invoke(status),
                        cancellationToken: _cts.Token);

                    stageResult.OutputText = streamResult.Text;
                    stageResult.RawText = streamResult.Text;
                    stageResult.WebSearchUsed = streamResult.WebSearchUsed;
                    stageResult.Status = StageStatus.Complete;
                    stageResult.CompletedAt = DateTime.Now;

                    previousOutputs[stageDef.Number] = streamResult.Text;

                    OnStageComplete?.Invoke(stageDef.Number, stageResult);

                    // Inter-stage delay to respect rate limits
                    if (stageDef.Number < Stages.Length && _settings.InterStageDelaySeconds > 0)
                    {
                        OnStatus?.Invoke($"Pausing {_settings.InterStageDelaySeconds}s before next stage...");
                        await Task.Delay(_settings.InterStageDelaySeconds * 1000, _cts.Token);
                    }
                }
                catch (OperationCanceledException)
                {
                    stageResult.Status = StageStatus.Cancelled;
                    stageResult.CompletedAt = DateTime.Now;
                    throw;
                }
                catch (Exception ex)
                {
                    stageResult.Status = StageStatus.Error;
                    stageResult.ErrorMessage = ex.Message;
                    stageResult.CompletedAt = DateTime.Now;
                    OnStageError?.Invoke(stageDef.Number, ex.Message);
                    throw;
                }
            }

            // The final stage output IS the comprehensive report
            result.FinalReport = previousOutputs.GetValueOrDefault(6, "");
            result.CompletedAt = DateTime.Now;
            OnPipelineComplete?.Invoke(result);

            return result;
        }
        finally
        {
            _client?.Dispose();
            _client = null;
            _cts?.Dispose();
            _cts = null;
        }
    }

    public void Cancel()
    {
        _cts?.Cancel();
    }

    private string BuildUserMessage(int stageNumber, InventionInput input, Dictionary<int, string> previousOutputs)
    {
        var narrative = input.ToNarrative();

        return stageNumber switch
        {
            1 => $"Analyze this invention:\n\n{narrative}",

            2 => $"## Invention (Technical Restatement from Stage 1)\n\n{previousOutputs.GetValueOrDefault(1, narrative)}\n\n" +
                 $"## Original Inventor Description\n\n{narrative}",

            3 => $"## Technical Restatement\n\n{previousOutputs.GetValueOrDefault(1, "")}\n\n" +
                 $"## Prior Art Found\n\n{previousOutputs.GetValueOrDefault(2, "No prior art search results available.")}\n\n" +
                 $"## Original Description\n\n{narrative}",

            4 => $"## Technical Restatement\n\n{previousOutputs.GetValueOrDefault(1, "")}\n\n" +
                 $"## Prior Art Found\n\n{previousOutputs.GetValueOrDefault(2, "")}\n\n" +
                 $"## Patentability Analysis\n\n{previousOutputs.GetValueOrDefault(3, "")}\n\n" +
                 $"## Original Description\n\n{narrative}",

            5 => $"## Technical Restatement\n\n{previousOutputs.GetValueOrDefault(1, "")}\n\n" +
                 $"## Prior Art Found\n\n{previousOutputs.GetValueOrDefault(2, "")}\n\n" +
                 $"## Patentability Analysis\n\n{previousOutputs.GetValueOrDefault(3, "")}\n\n" +
                 $"## AI & 3D Print Deep Dive\n\n{previousOutputs.GetValueOrDefault(4, "")}\n\n" +
                 $"## Original Description\n\n{narrative}",

            6 => BuildFinalReportInput(input, previousOutputs),

            _ => narrative
        };
    }

    private string BuildFinalReportInput(InventionInput input, Dictionary<int, string> previousOutputs)
    {
        var sb = new System.Text.StringBuilder();
        sb.AppendLine("## Original Invention Description");
        sb.AppendLine();
        sb.AppendLine(input.ToNarrative());
        sb.AppendLine();

        foreach (var stage in Stages.Where(s => s.Number < 6))
        {
            sb.AppendLine($"## Stage {stage.Number}: {stage.Name}");
            sb.AppendLine();
            sb.AppendLine(previousOutputs.GetValueOrDefault(stage.Number, "(Stage not completed)"));
            sb.AppendLine();
        }

        return sb.ToString();
    }
}
