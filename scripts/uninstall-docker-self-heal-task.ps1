[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$taskName = 'InvitaFlow-Docker-SelfHeal'
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Output "Tâche $taskName désinstallée."
} else {
    Write-Output "Aucune tâche $taskName n’est installée."
}
