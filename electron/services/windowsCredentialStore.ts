/** @fileoverview Synchronous Windows Credential Manager bridge for profile-password verifiers.
 *
 *  Electron's `safeStorage` on Windows uses DPAPI (`CryptProtectData`), which
 *  encrypts to the current user profile but does not store in the Windows
 *  Credential Manager vault. This module provides a tightly-scoped PowerShell
 *  bridge that calls `CredWriteW` / `CredReadW` / `CredDeleteW` so that master
 *  and profile password verifiers can be stored in Credential Manager when
 *  available.
 *
 *  SECURITY NOTES:
 *    - The secret is passed to PowerShell via stdin, never on the command line.
 *    - The target name is sanitized (alphanumeric, underscore, period, colon,
 *      hyphen).
 *    - The bridge is disabled on non-Windows platforms and when PowerShell is
 *      not available.
 *    - Callers must still treat the retrieved value as sensitive.
 */

import { spawnSync } from "node:child_process";

const IS_WINDOWS = process.platform === "win32";

/** Maximum time to wait for a PowerShell credential operation. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Characters allowed in a credential target name. */
const VALID_TARGET_RE = /^[a-zA-Z0-9_.:-]{1,256}$/;

function sanitizeTarget(target: string): string {
  if (typeof target !== "string" || target.length === 0) {
    throw new Error("Credential target name must be a non-empty string.");
  }
  if (!VALID_TARGET_RE.test(target)) {
    throw new Error(
      "Credential target name contains disallowed characters. Only alphanumeric, underscore, period, colon, and hyphen are permitted.",
    );
  }
  return target;
}

function escapePsString(value: string): string {
  // Escape single quotes by doubling them for PowerShell single-quoted strings.
  return value.replace(/'/g, "''");
}

/** Returns true when running on Windows. PowerShell availability is checked at call time. */
export function isWindowsCredentialStoreAvailable(): boolean {
  return IS_WINDOWS;
}

interface PowerShellResult {
  status: number;
  stdout: string;
  stderr: string;
  error?: Error;
}

function runPowerShell(script: string, stdin?: string, timeoutMs = DEFAULT_TIMEOUT_MS): PowerShellResult {
  try {
    // The script is passed as a -Command argument so that stdin remains
    // available for Read-Host inside the script. The secret (when present) is
    // piped via stdin and never becomes part of the command text.
    const result = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        input: stdin,
        windowsHide: true,
        encoding: "utf-8",
        timeout: timeoutMs,
        killSignal: "SIGTERM",
      },
    );
    return {
      status: result.status ?? -1,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      error: result.error,
    };
  } catch (err) {
    return {
      status: -1,
      stdout: "",
      stderr: "",
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/** Writes or overwrites a generic credential in Windows Credential Manager. */
export function writeWindowsCredential(target: string, secret: string): void {
  if (!IS_WINDOWS) {
    throw new Error("Windows Credential Manager is only available on Windows.");
  }
  const t = sanitizeTarget(target);
  if (typeof secret !== "string") {
    throw new Error("Credential secret must be a string.");
  }

  // The secret is passed via stdin so it never appears in process listings.
  const script = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class CredManager {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class CREDENTIAL {
    public uint Flags;
    public uint Type;
    public string TargetName;
    public string Comment;
    public long LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool CredWriteW(IntPtr credential, uint flags);
}
'@
$target = '${escapePsString(t)}'
$secure = Read-Host -AsSecureString
$BSTR = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($BSTR)
  $bytes = [Encoding]::Unicode.GetBytes($plain)
  $ptr = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
  [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)
  $cred = New-Object CredManager+CREDENTIAL
  $cred.Type = 1
  $cred.TargetName = $target
  $cred.CredentialBlobSize = $bytes.Length
  $cred.CredentialBlob = $ptr
  $cred.Persist = 2
  $credPtr = [Runtime.InteropServices.Marshal]::AllocHGlobal([Runtime.InteropServices.Marshal]::SizeOf($cred))
  [Runtime.InteropServices.Marshal]::StructureToPtr($cred, $credPtr, $false)
  $ok = [CredManager]::CredWriteW($credPtr, 0)
  if (-not $ok) { throw "CredWriteW failed" }
} finally {
  if ($BSTR -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR) }
  if ($ptr -ne $null) { [Runtime.InteropServices.Marshal]::FreeHGlobal($ptr) }
  if ($credPtr -ne $null) { [Runtime.InteropServices.Marshal]::FreeHGlobal($credPtr) }
}
`;

  const result = runPowerShell(script, secret);
  if (result.status !== 0) {
    throw new Error(
      `Failed to write Windows credential: ${result.error?.message || result.stderr || result.stdout || "unknown error"}`,
    );
  }
}

/** Reads a generic credential from Windows Credential Manager. Returns null if absent. */
export function readWindowsCredential(target: string): string | null {
  if (!IS_WINDOWS) {
    throw new Error("Windows Credential Manager is only available on Windows.");
  }
  const t = sanitizeTarget(target);

  const script = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class CredManager {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class CREDENTIAL {
    public uint Flags;
    public uint Type;
    public string TargetName;
    public string Comment;
    public long LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool CredReadW(string target, uint type, uint reservedFlag, out IntPtr credential);
  [DllImport("advapi32.dll", SetLastError = true)]
  public static extern void CredFree(IntPtr buffer);
}
'@
$target = '${escapePsString(t)}'
$credPtr = [IntPtr]::Zero
try {
  $ok = [CredManager]::CredReadW($target, 1, 0, [ref]$credPtr)
  if (-not $ok) {
    $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    if ($err -eq 1168) { exit 0 }
    throw "CredReadW failed: $err"
  }
  $cred = [Runtime.InteropServices.Marshal]::PtrToStructure($credPtr, [Type][CredManager+CREDENTIAL])
  $bytes = New-Object byte[] $cred.CredentialBlobSize
  [Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $cred.CredentialBlobSize)
  $plain = [Encoding]::Unicode.GetString($bytes)
  Write-Output -NoEnumerate $plain
} finally {
  if ($credPtr -ne [IntPtr]::Zero) { [CredManager]::CredFree($credPtr) }
}
`;

  const result = runPowerShell(script);
  if (result.status !== 0) {
    throw new Error(
      `Failed to read Windows credential: ${result.error?.message || result.stderr || result.stdout || "unknown error"}`,
    );
  }
  const trimmed = result.stdout.trimEnd();
  if (trimmed.length === 0) return null;
  return trimmed;
}

/** Deletes a generic credential from Windows Credential Manager. */
export function deleteWindowsCredential(target: string): void {
  if (!IS_WINDOWS) {
    throw new Error("Windows Credential Manager is only available on Windows.");
  }
  const t = sanitizeTarget(target);

  const script = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class CredManager {
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool CredDeleteW(string target, uint type, uint reservedFlag);
}
'@
$target = '${escapePsString(t)}'
$ok = [CredManager]::CredDeleteW($target, 1, 0)
if (-not $ok) {
  $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  if ($err -ne 1168) { throw "CredDeleteW failed: $err" }
}
`;

  const result = runPowerShell(script);
  if (result.status !== 0) {
    throw new Error(
      `Failed to delete Windows credential: ${result.error?.message || result.stderr || result.stdout || "unknown error"}`,
    );
  }
}
