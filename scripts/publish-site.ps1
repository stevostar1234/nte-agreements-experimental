param()
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Push-Location $taskRoot
try {
    $taskRemote = & git remote get-url origin
    if ($LASTEXITCODE -ne 0 -or $taskRemote -ne 'https://github.com/stevostar1234/nte-agreements-experimental.git') { throw 'Publishing is restricted to the experimental NTE repository.' }
    if ((& git branch --show-current) -ne 'main') { throw 'Publish from the reviewed main branch.' }
    if (& git status --porcelain) { throw 'Commit reviewed source changes before publishing.' }
    & npm test
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed; nothing was published.' }
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed; nothing was published.' }
    if (& git status --porcelain) { throw 'The build changed generated files. Review and commit them before publishing.' }
    $taskSiteCommit = & git subtree split --prefix public
    if ($LASTEXITCODE -ne 0 -or $taskSiteCommit -notmatch '^[0-9a-f]{40}$') { throw 'Could not isolate the public site.' }
    & git push origin ('{0}:refs/heads/gh-pages' -f $taskSiteCommit)
    if ($LASTEXITCODE -ne 0) { throw 'Site push failed. No force push was attempted.' }
    Write-Output 'Published public/ to the experimental gh-pages branch. Check the GitHub Pages deployment for completion.'
} finally { Pop-Location }
