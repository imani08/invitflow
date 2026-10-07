[CmdletBinding()]
param([string]$ProjectPath = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$taskName = 'InvitaFlow-Docker-SelfHeal'
$scriptPath = Join-Path $PSScriptRoot 'docker-self-heal.ps1'
$powershell = Join-Path $PSHOME 'powershell.exe'
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$scriptPath`" -ProjectPath `"$ProjectPath`""
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $ProjectPath
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 3) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Redémarre prudemment les conteneurs InvitaFlow persistants en panne.' -Force | Out-Null
Write-Output "Tâche $taskName installée. Elle tourne avec votre session Windows et s’ignore si Docker Desktop est arrêté."
