# AD authentication via Windows-integrated GSSAPI/Kerberos.
# Called by Node.js — credentials passed via args + env var (never in the script string).
#
# Usage:
#   $env:STO_AD_PASSWORD = "userpassword"
#   .\ad-auth.ps1 -Username "john.doe" -Domain "company.com"
#
# Exits 0 and writes JSON to stdout on success.
# Exits 1 and writes error to stderr on failure.

param(
  [Parameter(Mandatory)][string]$Username,
  [Parameter(Mandatory)][string]$Domain
)

$Password = $env:STO_AD_PASSWORD

if (-not $Password) {
  Write-Error "STO_AD_PASSWORD env var not set"
  exit 1
}

Add-Type -AssemblyName System.DirectoryServices.AccountManagement

try {
  # PrincipalContext uses GSSAPI/Kerberos automatically on a domain-joined machine.
  # No service account password is needed — Windows handles it.
  $ctx = New-Object System.DirectoryServices.AccountManagement.PrincipalContext(
    [System.DirectoryServices.AccountManagement.ContextType]::Domain,
    $Domain
  )

  # Validate the user's password
  $valid = $ctx.ValidateCredentials($Username, $Password)
  if (-not $valid) {
    Write-Error "INVALID_CREDENTIALS"
    exit 1
  }

  # Look up the user's profile and group memberships
  $user = [System.DirectoryServices.AccountManagement.UserPrincipal]::FindByIdentity($ctx, $Username)

  if ($null -eq $user) {
    Write-Error "USER_NOT_FOUND"
    exit 1
  }

  # GetGroups returns direct group memberships (fast).
  # If groups are nested, switch to GetAuthorizationGroups (slower but recursive).
  $groups = @($user.GetGroups() | ForEach-Object { $_.Name })

  $result = [ordered]@{
    displayName = if ($user.DisplayName) { $user.DisplayName } else { $Username }
    email       = if ($user.EmailAddress) { $user.EmailAddress } else { "" }
    groups      = $groups
  }

  Write-Output ($result | ConvertTo-Json -Compress)
  exit 0

} catch {
  Write-Error $_.Exception.Message
  exit 1
}
