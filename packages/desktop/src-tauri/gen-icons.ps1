Add-Type -AssemblyName System.Drawing

$bmp32 = New-Object System.Drawing.Bitmap(32,32)
$g = [System.Drawing.Graphics]::FromImage($bmp32)
$g.Clear([System.Drawing.Color]::FromArgb(99,102,241))
$font = New-Object System.Drawing.Font("Arial",10)
$g.DrawString("AF",$font,[System.Drawing.Brushes]::White,2,8)
$bmp32.Save("icons\32x32.png")
$g.Dispose()

$bmp128 = New-Object System.Drawing.Bitmap(128,128)
$g2 = [System.Drawing.Graphics]::FromImage($bmp128)
$g2.Clear([System.Drawing.Color]::FromArgb(99,102,241))
$font2 = New-Object System.Drawing.Font("Arial",40)
$g2.DrawString("AF",$font2,[System.Drawing.Brushes]::White,15,35)
$bmp128.Save("icons\128x128.png")
$g2.Dispose()

$icon = [System.Drawing.Icon]::FromHandle($bmp32.GetHicon())
$fs = [System.IO.File]::Create("icons\icon.ico")
$icon.Save($fs)
$fs.Close()
$icon.Dispose()
$bmp32.Dispose()
$bmp128.Dispose()

Write-Host "Icons generated successfully"
