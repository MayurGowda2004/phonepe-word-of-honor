# Deploy ONLY to the linked phonepe-kiosk project.
# Do not use `vercel --name ...` — that creates a new project every time.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".vercel/project.json")) {
  Write-Host "Linking to phonepe-kiosk..."
  npx --yes vercel@latest link --project phonepe-kiosk --yes
}

$proj = Get-Content ".vercel/project.json" | ConvertFrom-Json
if ($proj.projectName -ne "phonepe-kiosk") {
  throw "Linked project is '$($proj.projectName)'. Expected 'phonepe-kiosk'."
}

Write-Host "Deploying to $($proj.projectName) ($($proj.projectId))..."
npx --yes vercel@latest deploy --prod --yes
Write-Host "Live: https://phonepe-kiosk.vercel.app"
