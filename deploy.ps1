# Deploy ONLY to the linked phonepe-word-of-honor project (Spark Mindz Vercel).
# Do not use `vercel --name ...` — that creates a new project every time.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".vercel/project.json")) {
  Write-Host "Linking to phonepe-word-of-honor..."
  npx --yes vercel@latest link --yes --team sparkmindzteams-projects --project phonepe-word-of-honor
}

$proj = Get-Content ".vercel/project.json" | ConvertFrom-Json
if ($proj.projectName -ne "phonepe-word-of-honor") {
  throw "Linked project is '$($proj.projectName)'. Expected 'phonepe-word-of-honor'."
}

Write-Host "Deploying to $($proj.projectName) ($($proj.projectId))..."
npx --yes vercel@latest deploy --prod --yes
Write-Host "Live: https://phonepe-word-of-honor.vercel.app"
