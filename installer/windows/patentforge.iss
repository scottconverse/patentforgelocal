; PatentForge Windows Installer
; Built with Inno Setup 6.x
; https://jrsoftware.org/ishelp/

#define MyAppName "PatentForge"
#define MyAppVersion "0.9.2"
#define MyAppPublisher "Scott Converse"
#define MyAppURL "https://scottconverse.github.io/patentforge/"
#define MyAppExeName "patentforge-tray.exe"

[Setup]
AppId={{PATENTFORGE-A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=..\..\build
OutputBaseFilename=PatentForge-{#MyAppVersion}-Setup
Compression=lzma2/ultra64
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
Source: "..\..\patentforge-tray.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\patentforge-backend.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\patentforge-feasibility.exe"; DestDir: "{app}"; Flags: ignoreversion

; Prisma runtime files
Source: "..\..\patentforge-backend-prisma\*"; DestDir: "{app}\patentforge-backend-prisma"; Flags: ignoreversion recursesubdirs createallsubdirs

; Feasibility prompts
Source: "..\..\patentforge-feasibility-prompts\*"; DestDir: "{app}\patentforge-feasibility-prompts"; Flags: ignoreversion recursesubdirs createallsubdirs

; Portable Python 3.12
Source: "..\..\runtime\python\*"; DestDir: "{app}\runtime\python"; Flags: ignoreversion recursesubdirs createallsubdirs

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
