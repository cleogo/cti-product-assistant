<#
    Desktop alert for Claude Code.

    Called two ways:

      1. Automatically, by the hooks in .claude/settings.json
         (Stop -> "done", Notification -> "attention").

      2. Deliberately, by Claude mid-implementation when it hits something
         the user has to decide:

            powershell -NoProfile -ExecutionPolicy Bypass `
              -File .claude/hooks/notify.ps1 `
              -Kind attention -Message "M2 seed is 429ing at record 400"

    Uses only built-in Windows assemblies -- no BurntToast, no install step.
#>
param(
    [ValidateSet('done', 'attention', 'blocked')]
    [string]$Kind = 'done',

    [string]$Message = ''
)

$ErrorActionPreference = 'SilentlyContinue'

switch ($Kind) {
    'done' {
        $title = 'Claude - phase step finished'
        $icon  = [System.Windows.Forms.ToolTipIcon]::Info
        $sound = [System.Media.SystemSounds]::Asterisk
        if (-not $Message) { $Message = 'Ready for your review.' }
    }
    'attention' {
        $title = 'Claude needs you'
        $icon  = [System.Windows.Forms.ToolTipIcon]::Warning
        $sound = [System.Media.SystemSounds]::Exclamation
        if (-not $Message) { $Message = 'Waiting on your input.' }
    }
    'blocked' {
        $title = 'Claude is blocked'
        $icon  = [System.Windows.Forms.ToolTipIcon]::Error
        $sound = [System.Media.SystemSounds]::Hand
        if (-not $Message) { $Message = 'Implementation stopped. Decision needed.' }
    }
}

# Balloon text is truncated hard by the shell; keep it short.
if ($Message.Length -gt 200) { $Message = $Message.Substring(0, 197) + '...' }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$sound.Play()

$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Information
$notify.BalloonTipIcon  = $icon
$notify.BalloonTipTitle = $title
$notify.BalloonTipText  = $Message
$notify.Visible = $true
$notify.ShowBalloonTip(5000)

# The balloon dies with the process, so hold briefly. Kept short on purpose --
# the Stop hook blocks the session for this long.
Start-Sleep -Seconds 3

$notify.Visible = $false
$notify.Dispose()

# Append to a log so a missed balloon is still recoverable.
$logDir = Join-Path $PSScriptRoot '..'
$log    = Join-Path $logDir 'notifications.log'
"{0}  [{1}]  {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Kind, $Message |
    Add-Content -Path $log -Encoding utf8

exit 0
