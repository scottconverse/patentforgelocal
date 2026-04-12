using Markdig;

namespace PatentAnalyzer.Services;

/// <summary>
/// Converts markdown to styled HTML for display in WPF WebBrowser controls.
/// Dark theme to match the app, with proper table, heading, and list styling.
/// </summary>
public static class HtmlRenderer
{
    private static readonly MarkdownPipeline Pipeline = new MarkdownPipelineBuilder()
        .UseAdvancedExtensions()
        .Build();

    /// <summary>
    /// Render markdown to a full styled HTML document.
    /// Includes auto-scroll-to-bottom for streaming output.
    /// </summary>
    public static string RenderToHtml(string markdown)
    {
        var body = Markdown.ToHtml(markdown, Pipeline);

        // No JavaScript — WPF WebBrowser (IE engine) blocks local scripts with a security warning.
        // Auto-scroll is handled from C# code-behind instead.
        return $@"<!DOCTYPE html>
<html>
<head>
<meta charset=""utf-8"">
<meta http-equiv=""X-UA-Compatible"" content=""IE=edge"">
<meta http-equiv=""Content-Type"" content=""text/html; charset=utf-8"">
<!-- Mark of the Web — tells IE this is safe local content -->
<!-- saved from url=(0016)http://localhost -->
<style>
{Css}
</style>
</head>
<body>
{body}
<a name=""bottom""></a>
</body>
</html>";
    }

    /// <summary>
    /// Render markdown to just the body HTML (no wrapper document).
    /// Used for in-place DOM updates during streaming to avoid scroll reset.
    /// </summary>
    public static string RenderBodyHtml(string markdown)
    {
        return Markdown.ToHtml(markdown, Pipeline);
    }

    private const string Css = @"
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 14px;
    line-height: 1.7;
    color: #E0E0E0;
    background: #0D1117;
    padding: 24px 32px;
    max-width: 100%;
}

h1 {
    font-size: 26px;
    font-weight: 700;
    color: #58A6FF;
    border-bottom: 2px solid #30363D;
    padding-bottom: 10px;
    margin: 28px 0 16px 0;
}

h1:first-child { margin-top: 0; }

h2 {
    font-size: 21px;
    font-weight: 600;
    color: #79C0FF;
    border-bottom: 1px solid #21262D;
    padding-bottom: 8px;
    margin: 24px 0 12px 0;
}

h3 {
    font-size: 17px;
    font-weight: 600;
    color: #D2A8FF;
    margin: 20px 0 8px 0;
}

h4 {
    font-size: 15px;
    font-weight: 600;
    color: #E0E0E0;
    margin: 16px 0 6px 0;
}

p {
    margin: 8px 0;
    color: #C9D1D9;
}

strong {
    color: #E6EDF3;
    font-weight: 600;
}

em { color: #8B949E; }

a {
    color: #58A6FF;
    text-decoration: none;
}

a:hover { text-decoration: underline; }

/* Tables — clean and readable */
table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    font-size: 13px;
    border: 1px solid #30363D;
    border-radius: 6px;
    overflow: hidden;
}

thead { background: #161B22; }

th {
    padding: 10px 14px;
    text-align: left;
    font-weight: 600;
    color: #58A6FF;
    border-bottom: 2px solid #30363D;
    white-space: nowrap;
}

td {
    padding: 8px 14px;
    border-bottom: 1px solid #21262D;
    color: #C9D1D9;
    vertical-align: top;
}

tr:nth-child(even) td {
    background: #0D1117;
}

tr:nth-child(odd) td {
    background: #161B22;
}

tr:hover td {
    background: #1C2333;
}

/* Lists */
ul, ol {
    margin: 8px 0 8px 24px;
    color: #C9D1D9;
}

li {
    margin: 4px 0;
    padding-left: 4px;
}

li > ul, li > ol {
    margin: 4px 0 4px 20px;
}

/* Code */
code {
    background: #161B22;
    color: #79C0FF;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Cascadia Code', 'Consolas', monospace;
    font-size: 0.9em;
}

pre {
    background: #161B22;
    border: 1px solid #30363D;
    border-radius: 6px;
    padding: 16px;
    overflow-x: auto;
    margin: 12px 0;
}

pre code {
    background: none;
    padding: 0;
    color: #C9D1D9;
}

/* Blockquotes */
blockquote {
    border-left: 4px solid #58A6FF;
    padding: 10px 16px;
    margin: 12px 0;
    background: #161B22;
    color: #8B949E;
    font-style: italic;
    border-radius: 0 6px 6px 0;
}

blockquote p {
    color: #8B949E;
}

/* Horizontal rules */
hr {
    border: none;
    border-top: 1px solid #30363D;
    margin: 24px 0;
}

/* Stage divider headers */
h1:not(:first-child) {
    margin-top: 36px;
    padding-top: 20px;
    border-top: 2px solid #30363D;
}

/* Risk ratings */
strong:has(+ text) { }
";
}
