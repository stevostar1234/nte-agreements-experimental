param([ValidateSet('Check','Validate','Deploy')][string]$Mode = 'Validate')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskTarget = Get-Content (Join-Path $taskRoot 'config-target.json') -Raw | ConvertFrom-Json
if ($taskTarget.orgId -ne '00DQH00000MA4KG2A1' -or $taskTarget.targetAlias -ne 'missioncommunity-safe') {
    throw 'This deployment script is restricted to the approved Megistos org.'
}
Push-Location $taskRoot
try {
    $taskOrgRaw = & sf data query --target-org $taskTarget.targetAlias --query 'SELECT Id, Name, OrganizationType, IsSandbox FROM Organization' --json
    if ($LASTEXITCODE -ne 0) { throw 'Could not verify the target org. No deployment was attempted.' }
    $taskOrgResult = ($taskOrgRaw -join "`n") | ConvertFrom-Json
    $taskOrg = $taskOrgResult.result.records | Select-Object -First 1
    if ($taskOrg.Id -ne '00DQH00000MA4KG2A1' -or $taskOrg.Name -ne 'Megistos') {
        throw 'The Salesforce alias points to another org. No deployment was attempted.'
    }
    Write-Host "Verified Megistos: $($taskOrg.Id) ($($taskOrg.OrganizationType))."
    if ($Mode -eq 'Check') { return }
    $taskArguments = @('project','deploy','start','--target-org',$taskTarget.targetAlias,'--source-dir','force-app/main/default','--test-level','RunSpecifiedTests','--tests','NTEAgreementSignatureTest','--tests','NTEAgreementWorkflowTest','--tests','NTEAgreementOperationsTest','--tests','NTEAgreementPresentationTest','--tests','NTEAgreementAcceptanceTest','--wait','10','--json')
    if ($Mode -eq 'Validate') { $taskArguments += '--dry-run' }
    $taskRaw = & sf @taskArguments
    $taskExitCode = $LASTEXITCODE
    $taskArtifacts = Join-Path $taskRoot 'artifacts'
    New-Item -ItemType Directory -Path $taskArtifacts -Force | Out-Null
    $taskReport = Join-Path $taskArtifacts ("deployment-{0}-{1}.json" -f $Mode.ToLowerInvariant(),(Get-Date -Format 'yyyyMMdd-HHmmss'))
    [System.IO.File]::WriteAllText($taskReport,($taskRaw -join "`n"))
    $taskResult = ($taskRaw -join "`n") | ConvertFrom-Json
    if ($taskExitCode -ne 0 -or $taskResult.result.status -ne 'Succeeded') {
        throw "Deployment did not report success. Inspect $taskReport before continuing."
    }
    Write-Output "$Mode succeeded: $($taskResult.result.id). Report: $taskReport"
} finally { Pop-Location }
