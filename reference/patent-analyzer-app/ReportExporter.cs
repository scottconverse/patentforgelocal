using System.IO;
using System.Text;
using PatentAnalyzer.Models;
using Markdig;

namespace PatentAnalyzer.Services;

/// <summary>
/// Exports analysis results to Markdown, HTML, and individual stage files.
/// </summary>
public static class ReportExporter
{
    /// <summary>
    /// Save the complete analysis to a directory.
    /// Creates: final report (.md + .html), individual stage outputs, and a summary.
    /// </summary>
    public static string SaveAll(AnalysisResult result, string outputDirectory)
    {
        var timestamp = result.StartedAt.ToString("yyyy-MM-dd_HHmm");
        var safeName = SanitizeFileName(result.Input.Title);
        var folderName = $"{timestamp}_{safeName}";
        var outputPath = Path.Combine(outputDirectory, folderName);

        Directory.CreateDirectory(outputPath);

        // 1. Save final comprehensive report as Markdown
        var reportMdPath = Path.Combine(outputPath, $"{timestamp}_Patent-Analysis-Report.md");
        File.WriteAllText(reportMdPath, result.FinalReport, Encoding.UTF8);

        // 2. Save final report as HTML (styled)
        var reportHtmlPath = Path.Combine(outputPath, $"{timestamp}_Patent-Analysis-Report.html");
        var html = ConvertToStyledHtml(result.FinalReport, result.Input.Title);
        File.WriteAllText(reportHtmlPath, html, Encoding.UTF8);

        // 3. Save individual stage outputs
        foreach (var stage in result.Stages.Where(s => s.Status == StageStatus.Complete))
        {
            var stageFileName = $"{timestamp}_Stage-{stage.StageNumber:D2}_{SanitizeFileName(stage.StageName)}.md";
            var stagePath = Path.Combine(outputPath, stageFileName);
            var stageContent = $"# Stage {stage.StageNumber}: {stage.StageName}\n\n" +
                              $"**Model:** {stage.Model}\n" +
                              $"**Duration:** {stage.DurationSeconds:F1}s\n" +
                              $"**Web Search:** {(stage.WebSearchUsed ? "Yes" : "No")}\n\n" +
                              $"---\n\n{stage.OutputText}";
            File.WriteAllText(stagePath, stageContent, Encoding.UTF8);
        }

        // 4. Save analysis summary / metadata
        var summaryPath = Path.Combine(outputPath, $"{timestamp}_analysis-summary.md");
        var summary = BuildSummary(result);
        File.WriteAllText(summaryPath, summary, Encoding.UTF8);

        return outputPath;
    }

    /// <summary>
    /// Save just the final report to a specific file.
    /// </summary>
    public static void SaveReport(string content, string filePath)
    {
        var dir = Path.GetDirectoryName(filePath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);

        File.WriteAllText(filePath, content, Encoding.UTF8);

        // Also save HTML version alongside
        if (filePath.EndsWith(".md", StringComparison.OrdinalIgnoreCase))
        {
            var htmlPath = Path.ChangeExtension(filePath, ".html");
            var html = ConvertToStyledHtml(content, "Patent Analysis Report");
            File.WriteAllText(htmlPath, html, Encoding.UTF8);
        }
    }

    private static string BuildSummary(AnalysisResult result)
    {
        var sb = new StringBuilder();
        sb.AppendLine("# Analysis Summary");
        sb.AppendLine();
        sb.AppendLine($"**Invention:** {result.Input.Title}");
        sb.AppendLine($"**Started:** {result.StartedAt:yyyy-MM-dd HH:mm:ss}");
        sb.AppendLine($"**Completed:** {result.CompletedAt:yyyy-MM-dd HH:mm:ss}");
        sb.AppendLine($"**Total Duration:** {(result.CompletedAt - result.StartedAt)?.TotalMinutes:F1} minutes");
        sb.AppendLine();
        sb.AppendLine("## Stage Results");
        sb.AppendLine();
        sb.AppendLine("| Stage | Name | Status | Duration | Model | Web Search |");
        sb.AppendLine("|-------|------|--------|----------|-------|------------|");

        foreach (var stage in result.Stages)
        {
            sb.AppendLine($"| {stage.StageNumber} | {stage.StageName} | {stage.Status} | {stage.DurationSeconds:F1}s | {stage.Model} | {(stage.WebSearchUsed ? "Yes" : "No")} |");
        }

        sb.AppendLine();
        sb.AppendLine("## Invention Input");
        sb.AppendLine();
        sb.AppendLine(result.Input.ToNarrative());

        return sb.ToString();
    }

    public static string ConvertToStyledHtml(string markdown, string title)
    {
        var pipeline = new MarkdownPipelineBuilder()
            .UseAdvancedExtensions()
            .Build();

        var htmlBody = Markdown.ToHtml(markdown, pipeline);

        return $@"<!DOCTYPE html>
<html lang=""en"">
<head>
    <meta charset=""utf-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1"">
    <title>{System.Net.WebUtility.HtmlEncode(title)}</title>
    <style>
        :root {{
            --bg: #ffffff;
            --text: #1a1a2e;
            --heading: #16213e;
            --accent: #0f3460;
            --border: #e0e0e0;
            --code-bg: #f5f5f5;
            --table-header: #0f3460;
            --table-header-text: #ffffff;
            --table-stripe: #f8f9fa;
            --risk-high: #d32f2f;
            --risk-medium: #f57c00;
            --risk-low: #388e3c;
        }}
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            line-height: 1.7;
            color: var(--text);
            background: var(--bg);
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 30px;
        }}
        h1 {{
            font-size: 28px;
            color: var(--heading);
            border-bottom: 3px solid var(--accent);
            padding-bottom: 12px;
            margin: 32px 0 16px 0;
        }}
        h2 {{
            font-size: 22px;
            color: var(--accent);
            border-bottom: 1px solid var(--border);
            padding-bottom: 8px;
            margin: 28px 0 12px 0;
        }}
        h3 {{
            font-size: 18px;
            color: var(--heading);
            margin: 20px 0 8px 0;
        }}
        p {{ margin: 8px 0; }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0;
            font-size: 14px;
        }}
        th {{
            background: var(--table-header);
            color: var(--table-header-text);
            padding: 10px 12px;
            text-align: left;
            font-weight: 600;
        }}
        td {{
            padding: 8px 12px;
            border-bottom: 1px solid var(--border);
        }}
        tr:nth-child(even) td {{
            background: var(--table-stripe);
        }}
        code {{
            background: var(--code-bg);
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Cascadia Code', 'Consolas', monospace;
            font-size: 0.9em;
        }}
        pre {{
            background: var(--code-bg);
            padding: 16px;
            border-radius: 6px;
            overflow-x: auto;
            margin: 12px 0;
        }}
        pre code {{
            background: none;
            padding: 0;
        }}
        blockquote {{
            border-left: 4px solid var(--accent);
            padding: 8px 16px;
            margin: 12px 0;
            background: var(--table-stripe);
            font-style: italic;
        }}
        ul, ol {{
            margin: 8px 0 8px 24px;
        }}
        li {{
            margin: 4px 0;
        }}
        hr {{
            border: none;
            border-top: 2px solid var(--border);
            margin: 24px 0;
        }}
        strong {{ color: var(--heading); }}
        em {{ color: #555; }}
        @media print {{
            body {{ max-width: none; padding: 20px; }}
            h1, h2 {{ page-break-after: avoid; }}
            table {{ page-break-inside: avoid; }}
        }}
    </style>
</head>
<body>
{htmlBody}
</body>
</html>";
    }

    private static string SanitizeFileName(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "untitled";

        var invalid = Path.GetInvalidFileNameChars();
        var sanitized = new string(name.Select(c => invalid.Contains(c) ? '-' : c).ToArray());

        // Trim and limit length
        sanitized = sanitized.Trim('-', ' ');
        if (sanitized.Length > 50) sanitized = sanitized[..50];

        return string.IsNullOrWhiteSpace(sanitized) ? "untitled" : sanitized;
    }
}
