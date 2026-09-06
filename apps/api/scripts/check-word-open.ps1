param([Parameter(Mandatory=$true)][string]$ArtifactDirectory)
$ErrorActionPreference = 'Stop'
$wordTestRoot = [System.IO.Path]::GetFullPath($ArtifactDirectory)
$wordTempPrefix = Join-Path ([System.IO.Path]::GetTempPath()) 'bizovix-word-'
if (!$wordTestRoot.StartsWith($wordTempPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Only generated Word-test directories under Temp are allowed.'
}
$wordTestApp = New-Object -ComObject Word.Application
$wordTestOwned = $false
try {
  # Never operate on or quit a Word instance holding the user''s documents.
  if ($wordTestApp.Documents.Count -ne 0) { throw 'Word instance contains existing documents; leaving it untouched.' }
  $wordTestOwned = $true
  $wordTestApp.Visible = $false
  $wordTestApp.DisplayAlerts = 0
  $wordTestApp.AutomationSecurity = 3
  foreach ($wordTestFile in (Get-ChildItem -LiteralPath $wordTestRoot -Filter '*.docx' -File)) {
    $wordTestDoc = $null
    try {
      $wordTestDoc = $wordTestApp.Documents.Open($wordTestFile.FullName, $false, $true, $false, '', '', $false, '', '', 0, 0, $false)
      $wordTestDoc.Repaginate()
      $wordTestPdf = [System.IO.Path]::ChangeExtension($wordTestFile.FullName, '.pdf')
      $wordTestDoc.ExportAsFixedFormat($wordTestPdf, 17)
      Write-Output ('PASS Word open: ' + $wordTestFile.Name + ', pages=' + $wordTestDoc.ComputeStatistics(2))
    } finally {
      if ($null -ne $wordTestDoc) { $wordTestDoc.Close(0); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($wordTestDoc) }
    }
  }
} finally {
  if ($wordTestOwned) { $wordTestNoSave = 0; $wordTestApp.Quit([ref]$wordTestNoSave) }
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($wordTestApp)
}
