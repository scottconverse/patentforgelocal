using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;
using PatentAnalyzer.Models;
using PatentAnalyzer.Services;
using HtmlRenderer = PatentAnalyzer.Services.HtmlRenderer;

namespace PatentAnalyzer;

public partial class MainWindow : Window
{
    private AppSettings _settings = new();
    private PipelineRunner? _runner;
    private AnalysisResult? _currentResult;
    private bool _isRunning;
    private DateTime _runStartTime;
    private DispatcherTimer? _timerTick;
    private DispatcherTimer? _activityTick;
    private int _activityDots;
    private readonly List<Border> _stageIndicators = new();
    private readonly List<TextBlock> _stageLabels = new();
    private readonly List<TextBlock> _stageTimers = new();

    // Markdown accumulation for streaming render
    private readonly StringBuilder _outputMarkdown = new();
    private string _reportMarkdown = "";
    private string? _lastSavedPath;
    private DispatcherTimer? _htmlRefreshTick;
    private bool _htmlDirty;
    private bool _outputBrowserReady; // true after first Navigate completes

    // Placeholder event handler tracking for cleanup
    private readonly List<(TextBox Field, RoutedEventHandler GotFocus, RoutedEventHandler LostFocus)> _placeholderHandlers = new();

    public MainWindow()
    {
        InitializeComponent();
    }

    private void Window_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            // Clamp window size to screen if it exceeds available area
            var screenWidth = SystemParameters.PrimaryScreenWidth;
            var screenHeight = SystemParameters.PrimaryScreenHeight;
            if (Width > screenWidth * 0.95) Width = screenWidth * 0.85;
            if (Height > screenHeight * 0.95) Height = screenHeight * 0.85;

            _settings = ConfigManager.Load();

            if (string.IsNullOrWhiteSpace(_settings.OutputDirectory))
                _settings.OutputDirectory = ConfigManager.GetDefaultOutputDirectory();

            BuildStageIndicators();
            SetupPlaceholders();
            InitializeWebViews();

            // If no API key, show settings immediately
            if (string.IsNullOrWhiteSpace(_settings.ApiKey))
            {
                ShowSettingsDialog(isFirstRun: true);
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Startup error:\n\n{ex}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void Window_Closing(object sender, System.ComponentModel.CancelEventArgs e)
    {
        // Cancel any running analysis and stop all timers
        _runner?.Cancel();
        _timerTick?.Stop();
        _htmlRefreshTick?.Stop();
        _activityTick?.Stop();

        // Unsubscribe placeholder event handlers
        foreach (var (field, gotFocus, lostFocus) in _placeholderHandlers)
        {
            field.GotFocus -= gotFocus;
            field.LostFocus -= lostFocus;
        }
        _placeholderHandlers.Clear();
    }

    #region Placeholder Text

    /// <summary>
    /// Sets up placeholder/guidance text for all input fields.
    /// Uses the Tag property as the placeholder text source.
    /// </summary>
    private void SetupPlaceholders()
    {
        var fields = new[] { TxtTitle, TxtDescription, TxtProblem, TxtHowItWorks,
                             TxtAI, TxtThreeDPrint, TxtNovel, TxtAlternatives,
                             TxtBuilt, TxtProtect, TxtNotes };

        var primaryBrush = (SolidColorBrush)FindResource("TextPrimaryBrush");
        var dimBrush = (SolidColorBrush)FindResource("TextDimBrush");

        foreach (var field in fields)
        {
            if (field.Tag is string placeholder && !string.IsNullOrEmpty(placeholder))
            {
                // Set initial placeholder
                field.Text = placeholder;
                field.Foreground = dimBrush;
                field.FontStyle = FontStyles.Italic;

                RoutedEventHandler gotFocus = (s, e) =>
                {
                    var tb = (TextBox)s!;
                    if (tb.FontStyle == FontStyles.Italic && tb.Text == (string)tb.Tag)
                    {
                        tb.Text = "";
                        tb.Foreground = primaryBrush;
                        tb.FontStyle = FontStyles.Normal;
                    }
                };

                RoutedEventHandler lostFocus = (s, e) =>
                {
                    var tb = (TextBox)s!;
                    if (string.IsNullOrWhiteSpace(tb.Text))
                    {
                        tb.Text = (string)tb.Tag;
                        tb.Foreground = dimBrush;
                        tb.FontStyle = FontStyles.Italic;
                    }
                };

                field.GotFocus += gotFocus;
                field.LostFocus += lostFocus;
                _placeholderHandlers.Add((field, gotFocus, lostFocus));
            }
        }
    }

    /// <summary>
    /// Gets the actual user text from a field, returning empty string if it's still showing placeholder.
    /// </summary>
    private string GetFieldText(TextBox field)
    {
        if (field.FontStyle == FontStyles.Italic && field.Text == (string)field.Tag)
            return "";
        return field.Text.Trim();
    }

    /// <summary>
    /// Clears a field back to its placeholder state.
    /// </summary>
    private void ClearField(TextBox field)
    {
        if (field.Tag is string placeholder && !string.IsNullOrEmpty(placeholder))
        {
            field.Text = placeholder;
            field.Foreground = (SolidColorBrush)FindResource("TextDimBrush");
            field.FontStyle = FontStyles.Italic;
        }
        else
        {
            field.Clear();
        }
    }

    #endregion

    #region Stage Indicators

    private void BuildStageIndicators()
    {
        StagePanel.Children.Clear();
        _stageIndicators.Clear();
        _stageLabels.Clear();
        _stageTimers.Clear();

        // Add the header back
        var header = new TextBlock
        {
            Text = "ANALYSIS STAGES",
            FontSize = 11,
            FontWeight = FontWeights.Bold,
            Foreground = (SolidColorBrush)FindResource("TextDimBrush"),
            Margin = new Thickness(0, 0, 0, 12)
        };
        StagePanel.Children.Add(header);

        foreach (var stage in PipelineRunner.Stages)
        {
            var indicator = new Border
            {
                Background = (SolidColorBrush)FindResource("BgCardBrush"),
                CornerRadius = new CornerRadius(8),
                Padding = new Thickness(12, 10, 12, 10),
                Margin = new Thickness(0, 0, 0, 6),
                BorderBrush = (SolidColorBrush)FindResource("BorderBrush"),
                BorderThickness = new Thickness(1)
            };

            var grid = new Grid();
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(28) });
            grid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            grid.RowDefinitions.Add(new RowDefinition());
            grid.RowDefinitions.Add(new RowDefinition());

            // Stage number circle
            var numCircle = new Border
            {
                Width = 22,
                Height = 22,
                CornerRadius = new CornerRadius(11),
                Background = new SolidColorBrush((Color)FindResource("StagePending")),
                VerticalAlignment = VerticalAlignment.Center
            };
            var numText = new TextBlock
            {
                Text = stage.Number.ToString(),
                FontSize = 11,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            numCircle.Child = numText;
            Grid.SetColumn(numCircle, 0);
            Grid.SetRowSpan(numCircle, 2);
            grid.Children.Add(numCircle);

            // Stage name
            var nameText = new TextBlock
            {
                Text = stage.Name,
                FontSize = 12,
                FontWeight = FontWeights.Medium,
                Foreground = (SolidColorBrush)FindResource("TextSecondaryBrush"),
                VerticalAlignment = VerticalAlignment.Bottom,
                TextTrimming = TextTrimming.CharacterEllipsis
            };
            Grid.SetColumn(nameText, 1);
            Grid.SetRow(nameText, 0);
            grid.Children.Add(nameText);

            // Timer / status text
            var timerText = new TextBlock
            {
                Text = "Pending",
                FontSize = 10,
                Foreground = (SolidColorBrush)FindResource("TextDimBrush"),
                VerticalAlignment = VerticalAlignment.Top,
                Margin = new Thickness(0, 2, 0, 0)
            };
            Grid.SetColumn(timerText, 1);
            Grid.SetRow(timerText, 1);
            grid.Children.Add(timerText);

            indicator.Child = grid;
            StagePanel.Children.Add(indicator);

            _stageIndicators.Add(indicator);
            _stageLabels.Add(nameText);
            _stageTimers.Add(timerText);
        }
    }

    private void UpdateStageIndicator(int stageNumber, StageStatus status, string? timeText = null)
    {
        int idx = stageNumber - 1;
        if (idx < 0 || idx >= _stageIndicators.Count) return;

            var indicator = _stageIndicators[idx];
            var label = _stageLabels[idx];
            var timer = _stageTimers[idx];

            // Find the number circle
            var grid = (Grid)indicator.Child;
            var numCircle = (Border)grid.Children[0];

            switch (status)
            {
                case StageStatus.Pending:
                    numCircle.Background = new SolidColorBrush((Color)FindResource("StagePending"));
                    label.Foreground = (SolidColorBrush)FindResource("TextSecondaryBrush");
                    indicator.BorderBrush = (SolidColorBrush)FindResource("BorderBrush");
                    timer.Text = "Pending";
                    break;

                case StageStatus.Running:
                    numCircle.Background = (SolidColorBrush)FindResource("AccentBrush");
                    label.Foreground = (SolidColorBrush)FindResource("TextPrimaryBrush");
                    indicator.BorderBrush = (SolidColorBrush)FindResource("AccentBrush");
                    timer.Text = "Working ●●●";
                    timer.Foreground = (SolidColorBrush)FindResource("AccentBrush");
                    // Start activity animation for this stage
                    StartActivityAnimation(timer);
                    break;

                case StageStatus.Complete:
                    numCircle.Background = (SolidColorBrush)FindResource("SuccessBrush");
                    label.Foreground = (SolidColorBrush)FindResource("TextPrimaryBrush");
                    indicator.BorderBrush = (SolidColorBrush)FindResource("SuccessBrush");
                    timer.Text = timeText ?? "Done";
                    timer.Foreground = (SolidColorBrush)FindResource("SuccessBrush");
                    break;

                case StageStatus.Error:
                    numCircle.Background = (SolidColorBrush)FindResource("ErrorBrush");
                    label.Foreground = (SolidColorBrush)FindResource("TextPrimaryBrush");
                    indicator.BorderBrush = (SolidColorBrush)FindResource("ErrorBrush");
                    timer.Text = timeText ?? "Error";
                    timer.Foreground = (SolidColorBrush)FindResource("ErrorBrush");
                    break;

                case StageStatus.Cancelled:
                    numCircle.Background = (SolidColorBrush)FindResource("WarningBrush");
                    timer.Text = "Cancelled";
                    timer.Foreground = (SolidColorBrush)FindResource("WarningBrush");
                    break;
            }
    }

    private void StartActivityAnimation(TextBlock timerLabel)
    {
        _activityTick?.Stop();
        _activityDots = 0;
        _activityTick = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(400) };
        _activityTick.Tick += (_, _) =>
        {
            _activityDots = (_activityDots + 1) % 4;
            var dots = _activityDots switch
            {
                0 => "Working ●○○○",
                1 => "Working ●●○○",
                2 => "Working ●●●○",
                _ => "Working ●●●●"
            };
            timerLabel.Text = dots;
        };
        _activityTick.Start();
    }

    private void StopActivityAnimation()
    {
        _activityTick?.Stop();
        _activityTick = null;
    }

    private void ResetStageIndicators()
    {
        for (int i = 0; i < PipelineRunner.Stages.Length; i++)
        {
            UpdateStageIndicator(i + 1, StageStatus.Pending);
        }
    }

    #endregion

    #region Run Analysis

    private async void BtnAnalyze_Click(object sender, RoutedEventArgs e)
    {
        // Validate
        if (string.IsNullOrWhiteSpace(_settings.ApiKey))
        {
            ShowSettingsDialog(isFirstRun: true);
            return;
        }

        if (string.IsNullOrWhiteSpace(GetFieldText(TxtTitle)) || string.IsNullOrWhiteSpace(GetFieldText(TxtDescription)))
        {
            MessageBox.Show("Please provide at least a Title and Description for your invention.",
                "Missing Information", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        // Warn on extremely long input that could exceed API context limits
        var totalInputLength = new[] { TxtTitle, TxtDescription, TxtProblem, TxtHowItWorks,
            TxtAI, TxtThreeDPrint, TxtNovel, TxtAlternatives, TxtBuilt, TxtProtect, TxtNotes }
            .Sum(f => GetFieldText(f).Length);
        if (totalInputLength > 50_000)
        {
            var result = MessageBox.Show(
                $"Your input is very long ({totalInputLength:N0} characters). This may exceed API limits or produce truncated results. Continue anyway?",
                "Long Input Warning", MessageBoxButton.YesNo, MessageBoxImage.Warning);
            if (result != MessageBoxResult.Yes) return;
        }

        try
        {
        // Build input
        var input = new InventionInput
        {
            Title = GetFieldText(TxtTitle),
            Description = GetFieldText(TxtDescription),
            ProblemSolved = GetFieldText(TxtProblem),
            HowItWorks = GetFieldText(TxtHowItWorks),
            AiComponents = GetFieldText(TxtAI),
            ThreeDPrintComponents = GetFieldText(TxtThreeDPrint),
            WhatIsNovel = GetFieldText(TxtNovel),
            CurrentAlternatives = GetFieldText(TxtAlternatives),
            WhatIsBuilt = GetFieldText(TxtBuilt),
            WhatToProtect = GetFieldText(TxtProtect),
            AdditionalNotes = GetFieldText(TxtNotes)
        };

        // Switch to output tab
        MainTabs.SelectedItem = TabOutput;

        // UI state
        SetRunningState(true);
        _outputMarkdown.Clear();
        _reportMarkdown = "";
        _lastSavedPath = null;
        _htmlDirty = false;
        BtnNewAnalysis.Visibility = Visibility.Collapsed;
        ResetStageIndicators();

        // Load initial HTML shell into the output browser
        _outputBrowserReady = false;
        if (_outputWebViewReady)
        {
            var initialHtml = HtmlRenderer.RenderToHtml("# Starting Analysis...\n\nPreparing pipeline...");
            BrowserOutput.NavigateToString(initialHtml);
            _outputBrowserReady = true;
        }

        // Start HTML refresh timer — updates formatted view every 1.5s during streaming
        _htmlRefreshTick?.Stop();
        _htmlRefreshTick = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(1500) };
        _htmlRefreshTick.Tick += (_, _) =>
        {
            if (_htmlDirty)
            {
                _htmlDirty = false;
                RefreshOutputBrowser();
            }
        };
        _htmlRefreshTick.Start();

        // Start timer
        _runStartTime = DateTime.Now;
        _timerTick = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        _timerTick.Tick += (_, _) =>
        {
            var elapsed = DateTime.Now - _runStartTime;
            TxtTimer.Text = $"{elapsed:mm\\:ss}";
        };
        _timerTick.Start();

        // Create pipeline
        _runner = new PipelineRunner(_settings);

        _runner.OnStageStart += (num, name) =>
        {
            UpdateStageIndicator(num, StageStatus.Running);
            TxtStatus.Text = $"Stage {num}/6: {name}";
            _outputMarkdown.AppendLine();
            _outputMarkdown.AppendLine($"---");
            _outputMarkdown.AppendLine($"# Stage {num}: {name}");
            _outputMarkdown.AppendLine();
            _htmlDirty = true;
        };

        _runner.OnToken += (text) =>
        {
            _outputMarkdown.Append(text);
            _htmlDirty = true;
        };

        _runner.OnStatus += (status) =>
        {
            TxtStatus.Text = status;
        };

        _runner.OnStageComplete += (num, result) =>
        {
            StopActivityAnimation();
            UpdateStageIndicator(num, StageStatus.Complete, $"Done — {result.DurationSeconds:F0}s");

            // Add end-of-stage marker so user knows this stage is done, not the whole analysis
            var stageName = PipelineRunner.Stages.FirstOrDefault(s => s.Number == num)?.Name ?? $"Stage {num}";
            _outputMarkdown.AppendLine();
            _outputMarkdown.AppendLine($"---");
            _outputMarkdown.AppendLine($"**— END OF STAGE {num}: {stageName.ToUpperInvariant()} —**");
            _outputMarkdown.AppendLine();
            _htmlDirty = true;
        };

        _runner.OnStageError += (num, error) =>
        {
            StopActivityAnimation();
            UpdateStageIndicator(num, StageStatus.Error, "Failed");
            _outputMarkdown.AppendLine();
            _outputMarkdown.AppendLine($"## Error in Stage {num}");
            _outputMarkdown.AppendLine();
            _outputMarkdown.AppendLine($"**{error}**");
            _htmlDirty = true;
        };

        _runner.OnPipelineComplete += (result) =>
        {
            _currentResult = result;
            _reportMarkdown = result.FinalReport;
            TxtStatus.Text = "Analysis complete!";
            BtnSaveReport.IsEnabled = true;
            BtnOpenFolder.IsEnabled = true;
            BtnOpenHtml.IsEnabled = true;

            // Final refresh of output view
            RefreshOutputBrowser();

            // Render the final report
            RenderReportHtml(_reportMarkdown);

            var totalTime = (result.CompletedAt - result.StartedAt)?.TotalMinutes ?? 0;
            TxtOutputInfo.Text = $"Analysis completed in {totalTime:F1} minutes";

            // Auto-save
            try
            {
                _lastSavedPath = ReportExporter.SaveAll(result, _settings.OutputDirectory);
                TxtOutputInfo.Text += $"  \u2014  Saved to {_lastSavedPath}";
                TxtReportPath.Text = $"📂 {_lastSavedPath}";
                TxtReportInfo.Text = $"Report saved to: {_lastSavedPath}";
            }
            catch (Exception ex)
            {
                TxtOutputInfo.Text += $"  \u2014  Auto-save failed: {ex.Message}";
            }

            // Switch to the report tab
            MainTabs.SelectedItem = TabReport;
        };

        await _runner.RunAsync(input);

        } // end outer try
        catch (OperationCanceledException)
        {
            TxtStatus.Text = "Analysis cancelled.";
            TxtOutputInfo.Text = "Cancelled by user.";
        }
        catch (Exception ex)
        {
            TxtStatus.Text = $"Error: {ex.Message}";
            _outputMarkdown.AppendLine($"\n\n## Error\n\n**{ex.Message}**");
            RefreshOutputBrowser();

            if (ex.Message.Contains("401") || ex.Message.Contains("authentication"))
            {
                MessageBox.Show("API key is invalid. Please check your settings.",
                    "Authentication Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            else
            {
                MessageBox.Show($"Analysis failed:\n\n{ex.Message}",
                    "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        finally
        {
            SetRunningState(false);
            _timerTick?.Stop();
            _timerTick = null;
            _htmlRefreshTick?.Stop();
            _htmlRefreshTick = null;
            StopActivityAnimation();
        }
    }

    private void BtnCancel_Click(object sender, RoutedEventArgs e)
    {
        _runner?.Cancel();
        TxtStatus.Text = "Cancelling...";

        // Stop the activity animation immediately
        StopActivityAnimation();

        // Mark any running stages as cancelled
        if (_currentResult != null)
        {
            foreach (var stage in _currentResult.Stages.Where(s => s.Status == StageStatus.Running))
            {
                stage.Status = StageStatus.Cancelled;
                UpdateStageIndicator(stage.StageNumber, StageStatus.Cancelled);
            }
        }
        else
        {
            // No result yet — find running stage from indicators
            for (int i = 0; i < PipelineRunner.Stages.Length; i++)
            {
                if (i < _stageTimers.Count && _stageTimers[i].Text.StartsWith("Working"))
                    UpdateStageIndicator(i + 1, StageStatus.Cancelled);
            }
        }
    }

    private void SetRunningState(bool running)
    {
        _isRunning = running;
        BtnAnalyze.IsEnabled = !running;
        BtnCancel.Visibility = running ? Visibility.Visible : Visibility.Collapsed;
        BtnCancelTop.Visibility = running ? Visibility.Visible : Visibility.Collapsed;
        BtnClear.IsEnabled = !running;
        BtnSettings.IsEnabled = !running;

        // Show "New Analysis" button when NOT running (after a run completes or is cancelled)
        if (!running && _outputMarkdown.Length > 0)
            BtnNewAnalysis.Visibility = Visibility.Visible;
    }

    #endregion

    #region HTML Rendering (WebView2)

    private bool _outputWebViewReady;
    private bool _reportWebViewReady;

    private async void InitializeWebViews()
    {
        try
        {
            // Initialize both WebView2 controls with shared user data folder in temp
            var userDataFolder = Path.Combine(Path.GetTempPath(), "PatentAnalyzer-WebView2");

            var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
            await BrowserOutput.EnsureCoreWebView2Async(env);
            await BrowserReport.EnsureCoreWebView2Async(env);

            _outputWebViewReady = true;
            _reportWebViewReady = true;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"WebView2 init failed: {ex.Message}");

            // Disable analysis — it's useless without a renderer
            BtnAnalyze.IsEnabled = false;
            TxtStatus.Text = "WebView2 runtime required";

            // Show the user what's wrong and how to fix it
            MessageBox.Show(
                "Patent Analyzer requires the Microsoft Edge WebView2 Runtime to display analysis results.\n\n" +
                "It is pre-installed on most Windows 10/11 systems, but yours appears to be missing.\n\n" +
                "Download it from:\nhttps://developer.microsoft.com/en-us/microsoft-edge/webview2/\n\n" +
                "After installing, restart Patent Analyzer.",
                "WebView2 Runtime Required",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
    }

    private void RenderReportHtml(string markdown)
    {
        try
        {
            if (!_reportWebViewReady) return;
            var html = HtmlRenderer.RenderToHtml(markdown);
            BrowserReport.NavigateToString(html);
        }
        catch { /* Ignore render errors */ }
    }

    /// <summary>
    /// Updates the output browser with current markdown content.
    /// Uses NavigateToString for the first call, then ExecuteScriptAsync
    /// to update innerHTML and scroll to bottom on subsequent calls.
    /// </summary>
    private async void RefreshOutputBrowser()
    {
        try
        {
            if (!_outputWebViewReady) return;

            if (!_outputBrowserReady)
            {
                // First time: full navigation to establish the HTML shell
                var html = HtmlRenderer.RenderToHtml(_outputMarkdown.ToString());
                BrowserOutput.NavigateToString(html);
                _outputBrowserReady = true;
                return;
            }

            // Subsequent calls: update body innerHTML via script — preserves scroll context
            var bodyHtml = HtmlRenderer.RenderBodyHtml(_outputMarkdown.ToString());
            var escaped = System.Text.Json.JsonSerializer.Serialize(bodyHtml);
            await BrowserOutput.ExecuteScriptAsync(
                $"document.body.innerHTML = {escaped}; window.scrollTo(0, document.body.scrollHeight);");
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"RefreshOutputBrowser error: {ex.Message}");
        }
    }

    #endregion

    #region Save / Export

    private void BtnSaveReport_Click(object sender, RoutedEventArgs e)
    {
        // Save the final report if available, otherwise save the streaming output
        var content = !string.IsNullOrWhiteSpace(_reportMarkdown)
            ? _reportMarkdown
            : _outputMarkdown.ToString();
        SaveOutputToFile(content, "patent-analysis-report");
    }

    private void BtnOpenFolder_Click(object sender, RoutedEventArgs e)
    {
        var path = _lastSavedPath ?? _settings.OutputDirectory;
        if (!string.IsNullOrWhiteSpace(path))
        {
            try
            {
                if (Directory.Exists(path))
                    Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
                else if (File.Exists(path))
                    Process.Start(new ProcessStartInfo("explorer.exe", $"/select,\"{path}\""));
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Could not open folder: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
    }

    private void TxtReportPath_Click(object sender, System.Windows.Input.MouseButtonEventArgs e)
    {
        BtnOpenFolder_Click(sender, e);
    }

    private void BtnOpenHtml_Click(object sender, RoutedEventArgs e)
    {
        if (string.IsNullOrWhiteSpace(_reportMarkdown)) return;

        try
        {
            var tempPath = Path.Combine(Path.GetTempPath(), $"patent-report-{DateTime.Now:yyyyMMdd-HHmm}.html");
            var html = ReportExporter.ConvertToStyledHtml(_reportMarkdown, _currentResult?.Input.Title ?? "Patent Analysis Report");
            File.WriteAllText(tempPath, html);
            Process.Start(new ProcessStartInfo(tempPath) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Could not open HTML report: {ex.Message}",
                "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void BtnCopyOutput_Click(object sender, RoutedEventArgs e)
    {
        var text = _outputMarkdown.ToString();
        if (!string.IsNullOrWhiteSpace(text))
        {
            Clipboard.SetText(text);
            TxtOutputInfo.Text = "Copied to clipboard.";
        }
    }

    private void BtnCopyReport_Click(object sender, RoutedEventArgs e)
    {
        if (!string.IsNullOrWhiteSpace(_reportMarkdown))
        {
            Clipboard.SetText(_reportMarkdown);
            TxtReportInfo.Text = "Copied to clipboard.";
        }
    }

    private void SaveOutputToFile(string content, string defaultName)
    {
        var dialog = new SaveFileDialog
        {
            FileName = $"{DateTime.Now:yyyy-MM-dd}_{defaultName}.md",
            DefaultExt = ".md",
            Filter = "Markdown (*.md)|*.md|Text (*.txt)|*.txt|All files (*.*)|*.*",
            InitialDirectory = _settings.OutputDirectory
        };

        if (dialog.ShowDialog() == true)
        {
            try
            {
                ReportExporter.SaveReport(content, dialog.FileName);
                MessageBox.Show($"Saved to:\n{dialog.FileName}",
                    "Saved", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Save failed: {ex.Message}",
                    "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
    }

    #endregion

    #region Settings

    private void BtnSettings_Click(object sender, RoutedEventArgs e)
    {
        ShowSettingsDialog(isFirstRun: false);
    }

    private void ShowSettingsDialog(bool isFirstRun)
    {
        var dialog = new Window
        {
            Title = isFirstRun ? "Welcome — Configure Patent Analyzer" : "Settings",
            Width = 520,
            Height = 700,
            Background = (SolidColorBrush)FindResource("BgDarkBrush"),
            WindowStartupLocation = WindowStartupLocation.CenterOwner,
            Owner = this,
            ResizeMode = ResizeMode.CanResizeWithGrip
        };

        var scrollViewer = new ScrollViewer
        {
            VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled
        };

        var panel = new StackPanel { Margin = new Thickness(30) };

        if (isFirstRun)
        {
            panel.Children.Add(new TextBlock
            {
                Text = "Welcome to Patent Analyzer",
                FontSize = 20,
                FontWeight = FontWeights.Bold,
                Foreground = (SolidColorBrush)FindResource("TextPrimaryBrush"),
                Margin = new Thickness(0, 0, 0, 4)
            });
            panel.Children.Add(new TextBlock
            {
                Text = "Enter your Anthropic API key to get started.",
                Foreground = (SolidColorBrush)FindResource("TextDimBrush"),
                FontSize = 13,
                Margin = new Thickness(0, 0, 0, 20)
            });
        }

        // API Key (PasswordBox for security)
        AddSettingLabel(panel, "ANTHROPIC API KEY *");
        var pwdApiKey = new PasswordBox
        {
            Password = _settings.ApiKey,
            Background = new SolidColorBrush(Color.FromRgb(15, 25, 35)),
            Foreground = new SolidColorBrush(Color.FromRgb(232, 232, 232)),
            CaretBrush = new SolidColorBrush(Color.FromRgb(74, 144, 217)),
            BorderBrush = new SolidColorBrush(Color.FromRgb(42, 58, 74)),
            FontSize = 13,
            FontFamily = new FontFamily("Consolas"),
            Padding = new Thickness(10, 8, 10, 8),
            Margin = new Thickness(0, 0, 0, 4)
        };
        panel.Children.Add(pwdApiKey);

        // Model
        AddSettingLabel(panel, "ANALYSIS MODEL");
        var cmbModel = new ComboBox
        {
            Background = new SolidColorBrush((Color)FindResource("BgInput")),
            Foreground = Brushes.Black,
            FontSize = 13,
            Height = 32,
            Margin = new Thickness(0, 0, 0, 4)
        };
        foreach (var m in AppSettings.AvailableModels) cmbModel.Items.Add(m);
        cmbModel.SelectedItem = _settings.Model;
        if (cmbModel.SelectedIndex < 0) cmbModel.SelectedIndex = 0;
        panel.Children.Add(cmbModel);

        // Research Model
        AddSettingLabel(panel, "RESEARCH MODEL (for prior art — can be cheaper)");
        var cmbResearch = new ComboBox
        {
            Background = new SolidColorBrush((Color)FindResource("BgInput")),
            Foreground = Brushes.Black,
            FontSize = 13,
            Height = 32,
            Margin = new Thickness(0, 0, 0, 4)
        };
        cmbResearch.Items.Add("(same as analysis model)");
        foreach (var m in AppSettings.AvailableModels) cmbResearch.Items.Add(m);
        cmbResearch.SelectedItem = string.IsNullOrWhiteSpace(_settings.ResearchModel)
            ? "(same as analysis model)" : _settings.ResearchModel;
        if (cmbResearch.SelectedIndex < 0) cmbResearch.SelectedIndex = 0;
        panel.Children.Add(cmbResearch);

        // Output Directory
        AddSettingLabel(panel, "OUTPUT DIRECTORY");
        var dirPanel = new DockPanel { Margin = new Thickness(0, 0, 0, 4) };
        var txtDir = new TextBox
        {
            Text = _settings.OutputDirectory,
            Background = new SolidColorBrush((Color)FindResource("BgInput")),
            Foreground = (SolidColorBrush)FindResource("TextPrimaryBrush"),
            CaretBrush = (SolidColorBrush)FindResource("AccentBrush"),
            BorderBrush = (SolidColorBrush)FindResource("BorderBrush"),
            FontSize = 12,
            Padding = new Thickness(8, 6, 8, 6),
            VerticalContentAlignment = VerticalAlignment.Center
        };
        var btnBrowse = new Button
        {
            Content = "...",
            Width = 36,
            Background = new SolidColorBrush((Color)FindResource("BgCard")),
            Foreground = (SolidColorBrush)FindResource("TextSecondaryBrush"),
            BorderThickness = new Thickness(1),
            BorderBrush = (SolidColorBrush)FindResource("BorderBrush"),
            Margin = new Thickness(4, 0, 0, 0)
        };
        btnBrowse.Click += (_, _) =>
        {
            var dlg = new OpenFolderDialog
            {
                InitialDirectory = txtDir.Text,
                Title = "Select output directory"
            };
            if (dlg.ShowDialog() == true)
                txtDir.Text = dlg.FolderName;
        };
        DockPanel.SetDock(btnBrowse, Dock.Right);
        dirPanel.Children.Add(btnBrowse);
        dirPanel.Children.Add(txtDir);
        panel.Children.Add(dirPanel);

        // Max Tokens
        AddSettingLabel(panel, "MAX TOKENS PER STAGE");
        var txtMaxTokens = AddSettingTextBox(panel, _settings.MaxTokens.ToString());

        // Save button
        var btnSave = new Button
        {
            Content = "Save Settings",
            Style = (Style)FindResource("PrimaryButton"),
            HorizontalAlignment = HorizontalAlignment.Right,
            Margin = new Thickness(0, 24, 0, 0)
        };
        btnSave.Click += (_, _) =>
        {
            _settings.ApiKey = pwdApiKey.Password.Trim();
            _settings.Model = cmbModel.SelectedItem?.ToString() ?? "claude-haiku-4-5-20251001";
            var research = cmbResearch.SelectedItem?.ToString();
            _settings.ResearchModel = research == "(same as analysis model)" ? "" : research ?? "";
            _settings.OutputDirectory = txtDir.Text.Trim();
            if (int.TryParse(txtMaxTokens.Text, out var mt)) _settings.MaxTokens = mt;

            ConfigManager.Save(_settings);
            dialog.Close();
        };
        panel.Children.Add(btnSave);

        scrollViewer.Content = panel;
        dialog.Content = scrollViewer;
        dialog.ShowDialog();
    }

    private static void AddSettingLabel(StackPanel panel, string text)
    {
        panel.Children.Add(new TextBlock
        {
            Text = text,
            FontSize = 11,
            FontWeight = FontWeights.Medium,
            Foreground = new SolidColorBrush(Color.FromRgb(160, 160, 176)),
            Margin = new Thickness(0, 12, 0, 4)
        });
    }

    private static TextBox AddSettingTextBox(StackPanel panel, string value)
    {
        var txt = new TextBox
        {
            Text = value,
            Background = new SolidColorBrush(Color.FromRgb(15, 25, 35)),
            Foreground = new SolidColorBrush(Color.FromRgb(232, 232, 232)),
            CaretBrush = new SolidColorBrush(Color.FromRgb(74, 144, 217)),
            BorderBrush = new SolidColorBrush(Color.FromRgb(42, 58, 74)),
            FontSize = 13,
            Padding = new Thickness(10, 8, 10, 8),
            Margin = new Thickness(0, 0, 0, 4)
        };

        panel.Children.Add(txt);
        return txt;
    }

    #endregion

    #region Utility

    private void BtnNewAnalysis_Click(object sender, RoutedEventArgs e)
    {
        // Reset everything for a fresh analysis
        _outputMarkdown.Clear();
        _reportMarkdown = "";
        _lastSavedPath = null;
        _currentResult = null;
        _htmlDirty = false;
        _outputBrowserReady = false;

        ResetStageIndicators();

        TxtStatus.Text = "Ready";
        TxtTimer.Text = "";
        TxtOutputInfo.Text = "";
        TxtReportInfo.Text = "";
        TxtReportPath.Text = "";

        BtnSaveReport.IsEnabled = false;
        BtnOpenFolder.IsEnabled = false;
        BtnOpenHtml.IsEnabled = false;
        BtnNewAnalysis.Visibility = Visibility.Collapsed;

        // Navigate browsers to blank
        if (_outputWebViewReady)
            BrowserOutput.NavigateToString("<html><body style='background:#0D1117'></body></html>");
        if (_reportWebViewReady)
            BrowserReport.NavigateToString("<html><body style='background:#0D1117'></body></html>");

        // Switch to input tab
        MainTabs.SelectedIndex = 0;
    }

    private void BtnClear_Click(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show("Clear all fields?", "Confirm", MessageBoxButton.YesNo) == MessageBoxResult.Yes)
        {
            var fields = new[] { TxtTitle, TxtDescription, TxtProblem, TxtHowItWorks,
                                 TxtAI, TxtThreeDPrint, TxtNovel, TxtAlternatives,
                                 TxtBuilt, TxtProtect, TxtNotes };
            foreach (var field in fields)
                ClearField(field);
        }
    }

    private void BtnOpenOutput_Click(object sender, RoutedEventArgs e)
    {
        var dir = _settings.OutputDirectory;
        if (string.IsNullOrWhiteSpace(dir)) dir = ConfigManager.GetDefaultOutputDirectory();

        try
        {
            Directory.CreateDirectory(dir);
            Process.Start(new ProcessStartInfo(dir) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Could not open output folder: {ex.Message}",
                "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    #endregion
}
