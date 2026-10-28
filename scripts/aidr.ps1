# Windows launcher for an encrypted config: asks for the passphrase (hidden),
# runs watcher.js with the given flags, then clears the passphrase.
# Usage: .\scripts\aidr.ps1 --preview --only "Spokeo,Radaris"
#        .\scripts\aidr.ps1 setup    (re-run setup with the current config loaded)

$secure = Read-Host -AsSecureString 'Config passphrase'
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $env:AIDR_PASSPHRASE = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  if ($args.Count -gt 0 -and $args[0] -eq 'setup') {
    node (Join-Path $PSScriptRoot '..\setup.js')
  } else {
    node (Join-Path $PSScriptRoot '..\watcher.js') @args
  }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Item Env:AIDR_PASSPHRASE -ErrorAction SilentlyContinue
}
