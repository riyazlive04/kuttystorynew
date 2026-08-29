# Long-lived OS-input helper for the KuttyStory demo recording.
#
# Playwright drives the *page*. It cannot touch the browser's own chrome, and
# its virtual mouse never moves the real Windows cursor - so a screen recording
# of a Playwright run shows a frozen arrow while the page clicks itself. This
# helper covers that gap: the Node driver keeps one instance alive and writes
# one command per line to its stdin.
#
#   RECT <pid>    -> "OK <left> <top> <width> <height>" for that process's window
#   FOCUS <pid>   -> bring that window to the foreground
#   MOVE <x> <y>  -> move the real cursor (physical pixels)
#   KEYS <string> -> SendKeys into whatever is focused (used for the address bar)
#   QUIT
#
# Every command answers with a line starting "OK", so the driver can stay in
# lockstep instead of guessing at sleeps.

$ErrorActionPreference = 'Stop'

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class KsNative {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@

# Without this the cursor coordinates we are handed (CSS pixels x devicePixelRatio,
# i.e. physical) would be re-scaled again by Windows on a HiDPI display.
[void][KsNative]::SetProcessDPIAware()
Add-Type -AssemblyName System.Windows.Forms

$shell = New-Object -ComObject WScript.Shell

# Chromium's window does not exist the instant the process does, so poll briefly
# rather than failing the whole recording on a startup race.
function Get-MainWindow([int]$procId) {
  for ($i = 0; $i -lt 100; $i++) {
    $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($p) {
      $p.Refresh()
      if ($p.MainWindowHandle -ne [IntPtr]::Zero) { return $p.MainWindowHandle }
    }
    Start-Sleep -Milliseconds 100
  }
  return [IntPtr]::Zero
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $line = $line.Trim()
  if ($line -eq '') { continue }

  $parts = $line.Split(@(' '), 2, [System.StringSplitOptions]::None)
  $cmd = $parts[0]
  $arg = ''
  if ($parts.Length -gt 1) { $arg = $parts[1] }

  try {
    switch ($cmd) {
      'RECT' {
        $h = Get-MainWindow ([int]$arg)
        $r = New-Object KsNative+RECT
        [void][KsNative]::GetWindowRect($h, [ref]$r)
        [Console]::Out.WriteLine("OK $($r.Left) $($r.Top) $($r.Right - $r.Left) $($r.Bottom - $r.Top)")
      }
      'FOCUS' {
        $procId = [int]$arg
        $h = Get-MainWindow $procId
        [void][KsNative]::ShowWindow($h, 5)
        # SetForegroundWindow alone is often refused for a background caller;
        # AppActivate first makes the request stick.
        try { [void]$shell.AppActivate($procId) } catch { }
        [void][KsNative]::SetForegroundWindow($h)
        [Console]::Out.WriteLine('OK')
      }
      'MOVE' {
        $xy = $arg.Split(' ')
        [void][KsNative]::SetCursorPos([int]$xy[0], [int]$xy[1])
        [Console]::Out.WriteLine('OK')
      }
      'KEYS' {
        [System.Windows.Forms.SendKeys]::SendWait($arg)
        [Console]::Out.WriteLine('OK')
      }
      'QUIT' {
        [Console]::Out.WriteLine('OK')
        [Console]::Out.Flush()
        exit 0
      }
      default { [Console]::Out.WriteLine("OK ignored:$cmd") }
    }
  } catch {
    # Never die mid-recording over one bad nudge - report and carry on.
    [Console]::Out.WriteLine("OK error:$($_.Exception.Message -replace '\s+', ' ')")
  }
  [Console]::Out.Flush()
}
