[CmdletBinding()]
param(
    [string]$ProjectPath = (Split-Path -Parent $PSScriptRoot),
    [int]$UnhealthyChecks = 3,
    [int]$MaxAttempts = 3,
    [int]$CooldownMinutes = 60,
    [int]$HealthWaitSeconds = 90
)

$ErrorActionPreference = 'Stop'
$TaskName = 'InvitaFlow-Docker-SelfHeal'
$LongRunningServices = @(
    'web', 'admin', 'gateway', 'profile', 'events', 'guests', 'seating', 'designs',
    'ai-design', 'media', 'invitations', 'rendering', 'access', 'payments', 'wallet',
    'billing', 'notifications', 'analytics', 'audit', 'postgres', 'redis', 'rabbitmq',
    'keycloak', 'minio', 'mailpit', 'traefik', 'background-removal-provider',
    'background-removal-worker', 'clamav', 'prometheus', 'postgres-exporter',
    'redis-exporter', 'grafana', 'loki', 'tempo', 'otel-collector'
)
$OneShotJobs = @(
    'minio-bootstrap', 'keycloak-db-init', 'media-db-init', 'access-db-init',
    'api-audience-init', 'keycloak-legal-flow-init', 'keycloak-email-init',
    'postgres-exporter-db-init', 'analytics-db-init'
)
$StateDir = Join-Path $env:LOCALAPPDATA 'InvitaFlow\DockerSelfHeal'
$StatePath = Join-Path $StateDir 'state.json'
$LogPath = Join-Path $StateDir 'docker-self-heal.log'

function Write-Event([string]$Service, [string]$InitialState, [string]$Action, [string]$Result) {
    $entry = [ordered]@{
        timestamp = [DateTimeOffset]::Now.ToString('o')
        service = $Service
        initialState = $InitialState
        action = $Action
        result = $Result
    }
    Add-Content -LiteralPath $LogPath -Value ($entry | ConvertTo-Json -Compress) -Encoding utf8
}

function Invoke-Compose([string[]]$Arguments) {
    $output = & docker compose --project-directory $ProjectPath @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) { throw "docker compose failed for command: $($Arguments[0])" }
    return $output
}

function Get-ServiceContainers([string]$Service) {
    $jsonLines = Invoke-Compose @('ps', '--all', '--format', 'json', $Service)
    $result = @()
    foreach ($line in $jsonLines) {
        if (-not [string]::IsNullOrWhiteSpace($line)) {
            try { $result += ($line | ConvertFrom-Json) } catch { }
        }
    }
    return $result
}

function Get-ContainerState([string]$ContainerId) {
    $value = & docker inspect --format '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' $ContainerId 2>$null
    if ($LASTEXITCODE -ne 0) { return 'missing|none' }
    return [string]$value
}

function Wait-ForRecovery([string]$ContainerId) {
    $deadline = [DateTimeOffset]::Now.AddSeconds($HealthWaitSeconds)
    do {
        Start-Sleep -Seconds 5
        $state = Get-ContainerState $ContainerId
        $parts = $state -split '\|', 2
        if ($parts[0] -eq 'running' -and $parts[1] -in @('healthy', 'none')) { return $true }
    } while ([DateTimeOffset]::Now -lt $deadline)
    return $false
}

New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
if (-not (Test-Path -LiteralPath $StatePath)) { '{}' | Set-Content -LiteralPath $StatePath -Encoding utf8 }
$state = @{}
$loadedState = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
if ($loadedState) {
    foreach ($property in $loadedState.PSObject.Properties) {
        $value = $property.Value
        $state[$property.Name] = @{
            failures = [int]$value.failures
            attempts = [int]$value.attempts
            lastAttempt = [string]$value.lastAttempt
            since = [string]$value.since
            escalated = [bool]$value.escalated
        }
    }
}

try {
    & docker info --format '{{.ServerVersion}}' *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Event 'docker' 'unavailable' 'none' 'Docker Desktop indisponible; vérification ignorée.'
        exit 0
    }
} catch {
    Write-Event 'docker' 'unavailable' 'none' 'Docker Desktop indisponible; vérification ignorée.'
    exit 0
}

foreach ($service in $LongRunningServices) {
    if ($OneShotJobs -contains $service -or $service -match '(^|-)db-init$|(^|-)init$|bootstrap|migrat|provision') { continue }
    try {
        $containers = @(Get-ServiceContainers $service)
    } catch {
        continue
    }
    if ($containers.Count -eq 0) { continue }

    foreach ($container in $containers) {
        $id = [string]$container.ID
        if ([string]::IsNullOrWhiteSpace($id)) { continue }
        $initial = Get-ContainerState $id
        $parts = $initial -split '\|', 2
        $status = $parts[0]
        $health = $parts[1]
        $problem = $status -in @('exited', 'dead', 'restarting', 'missing') -or $health -eq 'unhealthy'
        $key = "${service}:$id"

        if (-not $problem) {
            if ($state.ContainsKey($key)) { $state.Remove($key) }
            continue
        }

        if (-not $state.ContainsKey($key)) { $state[$key] = @{ failures = 0; attempts = 0; lastAttempt = ''; since = [DateTimeOffset]::Now.ToString('o') } }
        $entry = $state[$key]
        $entry.failures = [int]$entry.failures + 1
        if ($entry.failures -lt $UnhealthyChecks) { continue }

        $lastAttempt = [DateTimeOffset]::MinValue
        if ($entry.lastAttempt) { [void][DateTimeOffset]::TryParse([string]$entry.lastAttempt, [ref]$lastAttempt) }
        if ($entry.attempts -ge $MaxAttempts) {
            if (-not $entry.escalated) {
                Write-Event $service $initial 'none' 'INTERVENTION_REQUISE: maximum de réparations atteint.'
                $entry.escalated = $true
            }
            continue
        }
        if ($lastAttempt -ne [DateTimeOffset]::MinValue -and [DateTimeOffset]::Now -lt $lastAttempt.AddMinutes($CooldownMinutes)) { continue }

        $action = if ($status -in @('exited', 'dead', 'missing')) { 'up -d --no-deps' } else { 'restart' }
        $entry.attempts = [int]$entry.attempts + 1
        $entry.lastAttempt = [DateTimeOffset]::Now.ToString('o')
        $entry.failures = 0
        try {
            if ($action -eq 'restart') { Invoke-Compose @('restart', $service) | Out-Null }
            else { Invoke-Compose @('up', '-d', '--no-deps', $service) | Out-Null }
            $recovered = Wait-ForRecovery $id
            $result = if ($recovered) { 'rétabli' } else { 'échec après attente de santé' }
            Write-Event $service $initial $action $result
            if ($recovered) { $entry.failures = 0; $entry.escalated = $false }
            elseif ($entry.attempts -ge $MaxAttempts) { Write-Event $service $initial 'none' 'INTERVENTION_REQUISE: réparations épuisées.'; $entry.escalated = $true }
        } catch {
            Write-Event $service $initial $action "échec de commande: $($_.Exception.Message)"
        }
    }
}

# Keep the scheduler state small and avoid retaining entries for deleted containers.
foreach ($key in @($state.Keys)) {
    if ($key -match ':(.+)$') {
        $id = $Matches[1]
        $exists = & docker inspect --format '{{.State.Status}}' $id 2>$null
        if ($LASTEXITCODE -ne 0) { $state.Remove($key) }
    }
}
$state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $StatePath -Encoding utf8
