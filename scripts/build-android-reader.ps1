param([string]$Zig = 'zig')
$projectRoot = Split-Path -Parent $PSScriptRoot
& $Zig cc -target x86_64-linux-musl -static -Os -s (Join-Path $projectRoot 'src-tauri\reader\memory.c') -o (Join-Path $projectRoot 'src-tauri\reader\memory-x86_64')
if ($LASTEXITCODE -ne 0) { throw 'Android reader compilation failed' }
