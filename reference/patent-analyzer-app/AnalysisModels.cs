namespace PatentAnalyzer.Models;

/// <summary>
/// User's invention input — everything we collect before running the pipeline.
/// </summary>
public class InventionInput
{
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string ProblemSolved { get; set; } = "";
    public string HowItWorks { get; set; } = "";
    public string AiComponents { get; set; } = "";
    public string ThreeDPrintComponents { get; set; } = "";
    public string WhatIsNovel { get; set; } = "";
    public string CurrentAlternatives { get; set; } = "";
    public string WhatIsBuilt { get; set; } = "";
    public string WhatToProtect { get; set; } = "";
    public string AdditionalNotes { get; set; } = "";

    /// <summary>
    /// Build a single combined narrative from all fields for use in prompts.
    /// </summary>
    public string ToNarrative()
    {
        var parts = new List<string>();

        void Add(string label, string value)
        {
            if (!string.IsNullOrWhiteSpace(value))
                parts.Add($"**{label}:** {value.Trim()}");
        }

        Add("Invention Title", Title);
        Add("Description", Description);
        Add("Problem Solved", ProblemSolved);
        Add("How It Works", HowItWorks);
        Add("AI / ML Components", AiComponents);
        Add("3D Printing / Physical Design Components", ThreeDPrintComponents);
        Add("What I Believe Is Novel", WhatIsNovel);
        Add("Current Alternatives / Prior Solutions", CurrentAlternatives);
        Add("What Has Been Built So Far", WhatIsBuilt);
        Add("What I Want Protected", WhatToProtect);
        Add("Additional Notes", AdditionalNotes);

        return string.Join("\n\n", parts);
    }
}

/// <summary>
/// Tracks the state and output of a single pipeline stage.
/// </summary>
public class StageResult
{
    public int StageNumber { get; set; }
    public string StageName { get; set; } = "";
    public StageStatus Status { get; set; } = StageStatus.Pending;
    public string OutputText { get; set; } = "";
    public string RawText { get; set; } = "";
    public string Model { get; set; } = "";
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public double DurationSeconds => (CompletedAt - StartedAt)?.TotalSeconds ?? 0;
    public bool WebSearchUsed { get; set; }
    public string? ErrorMessage { get; set; }
}

public enum StageStatus
{
    Pending,
    Running,
    Complete,
    Error,
    Cancelled
}

/// <summary>
/// Complete pipeline run result.
/// </summary>
public class AnalysisResult
{
    public InventionInput Input { get; set; } = new();
    public List<StageResult> Stages { get; set; } = new();
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string FinalReport { get; set; } = "";
}

/// <summary>
/// Pipeline stage definition — what each stage does.
/// </summary>
public class StageDefinition
{
    public int Number { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public bool UsesWebSearch { get; set; }
    public int WebSearchMaxUses { get; set; } = 10;
    // Prompts are embedded in PromptTemplates.cs, not loaded from files
}

/// <summary>
/// Application settings persisted to config.json.
/// </summary>
public class AppSettings
{
    public string ApiKey { get; set; } = "";
    public string Model { get; set; } = "claude-haiku-4-5-20251001";
    public string ResearchModel { get; set; } = "";
    public string OutputDirectory { get; set; } = "";
    public string Theme { get; set; } = "Dark";
    public int InterStageDelaySeconds { get; set; } = 5;
    public int MaxTokens { get; set; } = 32000;

    public static readonly string[] AvailableModels = new[]
    {
        "claude-sonnet-4-20250514",
        "claude-opus-4-20250514",
        "claude-haiku-4-5-20251001"
    };
}
