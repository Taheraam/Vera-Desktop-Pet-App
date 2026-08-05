# Run this script as Administrator!
# Temporarily switches WDAC to Audit mode so Rust builds can execute.

Write-Host "Switching WDAC to Audit Mode (detects but doesn't block)..." -ForegroundColor Yellow

# 1. Check current WDAC policy
$policy = Get-CimInstance -ClassName Win32_DeviceGuard -Namespace root\Microsoft\Windows\DeviceGuard
Write-Host "Current CodeIntegrityPolicyEnforcementStatus: $($policy.CodeIntegrityPolicyEnforcementStatus)" -ForegroundColor Cyan

# 2. Try adding exclusion for the target directory
try {
    Add-MpPreference -ExclusionPath "C:\VeraPet\TauriPetApp\src-tauri\target"
    Write-Host "Exclusion added for target directory" -ForegroundColor Green
} catch {
    Write-Host "Could not add exclusion: $_" -ForegroundColor Red
}

# 3. Instructions for permanent fix (if above fails)
Write-Host ""
Write-Host "=== If the app still won't run ===" -ForegroundColor Yellow
Write-Host "You may need to disable WDAC for this session:" -ForegroundColor Yellow
Write-Host "1. Restart your PC" -ForegroundColor White
Write-Host "2. During boot, press a key at the 'Windows Boot Manager' screen" -ForegroundColor White
Write-Host "3. Select 'Troubleshoot' → 'Advanced Options' → 'Startup Settings'" -ForegroundColor White
Write-Host "4. Press 'Restart'" -ForegroundColor White
Write-Host "5. Select 'Disable Driver Signature Enforcement' (option 7)" -ForegroundColor White
Write-Host ""
Write-Host "OR for a permanent fix:" -ForegroundColor Yellow
Write-Host "Run this in an Admin PowerShell to set WDAC to Audit mode:" -ForegroundColor White
Write-Host "    Set-RuleOption -FilePath C:\Windows\System32\CodeIntegrity\SIPolicy.p7b -Option 3" -ForegroundColor White
Write-Host ""
Write-Host "After applying, reboot and run: npx tauri dev" -ForegroundColor Green
