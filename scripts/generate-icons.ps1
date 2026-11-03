$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'public\icons'
New-Item -ItemType Directory -Path $iconDirectory -Force | Out-Null
# Raster versions of the existing moon-and-star identity; no external image service.
foreach ($icon in @(@{Size=180;Name='apple-touch-icon.png'},@{Size=192;Name='icon-192.png'},@{Size=512;Name='icon-512.png'})) {
  $bitmap = New-Object System.Drawing.Bitmap($icon.Size, $icon.Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#20232f'))
  $graphics.ScaleTransform(($icon.Size / 64.0), ($icon.Size / 64.0))
  $gold = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#e5ce9e'))
  $background = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#20232f'))
  $lilac = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#c5b9e8'))
  $graphics.FillEllipse($gold, 10, 12, 42, 42)
  $graphics.FillEllipse($background, 25, 2, 44, 44)
  $points = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(46,12), [System.Drawing.PointF]::new(47.5,16.5),
    [System.Drawing.PointF]::new(52,18), [System.Drawing.PointF]::new(47.5,19.5),
    [System.Drawing.PointF]::new(46,24), [System.Drawing.PointF]::new(44.5,19.5),
    [System.Drawing.PointF]::new(40,18), [System.Drawing.PointF]::new(44.5,16.5)
  )
  $graphics.FillPolygon($lilac, $points)
  $bitmap.Save((Join-Path $iconDirectory $icon.Name), [System.Drawing.Imaging.ImageFormat]::Png)
  $gold.Dispose(); $background.Dispose(); $lilac.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
