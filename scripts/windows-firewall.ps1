# Run once in an elevated PowerShell on the event laptop.
# Allows phones on the local Wi-Fi to reach the Board Games Cup server on port 3000 (Private networks only).
New-NetFirewallRule -DisplayName "Board Games Cup (TCP 3000)" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
Write-Host "Firewall rule added. Make sure the Wi-Fi network profile is set to Private."
