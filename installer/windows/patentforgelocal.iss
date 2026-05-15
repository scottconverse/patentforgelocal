; PatentForge Windows Installer
; Built with Inno Setup 6.x
; https://jrsoftware.org/ishelp/
;
; Edition: pass /dEdition=Lean to ISCC to produce the cloud-only artifact
; (skips runtime/ollama bundling, writes Lean to config/edition.txt). When
; omitted the build defaults to Full and keeps the pre-merge behavior.
#ifndef Edition
  #define Edition "Full"
#endif
#if Edition != "Full" && Edition != "Lean"
  #error Edition must be "Full" or "Lean"
#endif

#define MyAppName "PatentForge"
#define MyAppVersion "0.5.0"
#define MyAppPublisher "Scott Converse"
#define MyAppURL "https://scottconverse.github.io/patentforgelocal/"
#define MyAppExeName "patentforgelocal-tray.exe"

[Setup]
AppId={{PATENTFORGELOCAL-A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=..\..\build
OutputBaseFilename=PatentForge-{#Edition}-{#MyAppVersion}-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
LicenseFile=..\..\LICENSE
SetupIconFile=..\assets\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
PrivilegesRequired=admin
DisableProgramGroupPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Executables
Source: "..\..\patentforgelocal-tray.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\patentforgelocal-backend.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\patentforgelocal-feasibility.exe"; DestDir: "{app}"; Flags: ignoreversion

; Prisma runtime files
Source: "..\..\patentforgelocal-backend-prisma\*"; DestDir: "{app}\patentforgelocal-backend-prisma"; Flags: ignoreversion recursesubdirs createallsubdirs

; Feasibility prompts
Source: "..\..\patentforgelocal-feasibility-prompts\*"; DestDir: "{app}\patentforgelocal-feasibility-prompts"; Flags: ignoreversion recursesubdirs createallsubdirs

; Feasibility native bindings (better-sqlite3 for context-mode FTS5)
Source: "..\..\patentforgelocal-feasibility-native\*"; DestDir: "{app}\patentforgelocal-feasibility-native"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist

; Portable Python 3.12
Source: "..\..\runtime\python\*"; DestDir: "{app}\runtime\python"; Flags: ignoreversion recursesubdirs createallsubdirs

; Ollama runtime (portable, bundled) — Full edition only.
; Lean ships without it; the tray reads config/edition.txt at startup and
; skips Ollama lifecycle management when this is absent.
#if Edition == "Full"
Source: "..\..\runtime\ollama\*"; DestDir: "{app}\runtime\ollama"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist
#endif

; Edition marker — tray + backend read this to decide whether to manage
; the local Ollama process and whether to render Local-mode UI panels.
Source: "..\marker\edition-{#Edition}.txt"; DestDir: "{app}\config"; DestName: "edition.txt"; Flags: ignoreversion

; Python services
Source: "..\..\services\claim-drafter\src\*"; DestDir: "{app}\services\claim-drafter\src"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\services\application-generator\src\*"; DestDir: "{app}\services\application-generator\src"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\services\compliance-checker\src\*"; DestDir: "{app}\services\compliance-checker\src"; Flags: ignoreversion recursesubdirs createallsubdirs

; Frontend static files (path matches tray FRONTEND_DIST_PATH)
Source: "..\..\frontend\dist\*"; DestDir: "{app}\frontend\dist"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
; User data directories — survive uninstall unless user explicitly deletes
Name: "{app}\data"; Flags: uninsneveruninstall
Name: "{app}\logs"; Flags: uninsneveruninstall
Name: "{app}\config"; Flags: uninsneveruninstall

; Model directory (persists on uninstall — user keeps their 18GB download)
Name: "{app}\models"; Flags: uninsneveruninstall

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch PatentForge"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Application files are removed automatically by the uninstaller.
; data/, config/, logs/ are handled by the [Code] section below.

[Code]
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
  begin
    if MsgBox('Do you want to remove your PatentForge data (projects, settings, database)?' + #13#10 +
              'This cannot be undone.',
              mbConfirmation, MB_YESNO) = IDYES then
    begin
      DelTree(ExpandConstant('{app}\data'), True, True, True);
      DelTree(ExpandConstant('{app}\config'), True, True, True);
      DelTree(ExpandConstant('{app}\logs'), True, True, True);
    end;
  end;
end;
