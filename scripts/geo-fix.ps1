<#
.SYNOPSIS
  Mueve el GPS del emulador a una ubicación puntual (control manual de la ruta).

.DESCRIPTION
  Envía `adb emu geo fix <lng> <lat>` (ojo: primero longitud, después latitud).
  Con el viaje en 'proceso' y la app en el Mapa, ~1-2 s después de fijar una
  parada la app detecta la llegada → la factura pasa a 'espera' y aparece el
  sheet "Iniciar entrega". Hacés la entrega a tu ritmo y luego fijás la siguiente.

.EXAMPLE
  .\scripts\geo-fix.ps1 -Stop parada1     # MINIMARKET LA TRINITARIA
  .\scripts\geo-fix.ps1 -Stop parada2     # Distribuidora Los Robles
  .\scripts\geo-fix.ps1 -Stop parada3     # DONDE GABO
  .\scripts\geo-fix.ps1 -Stop almacen     # vuelve al almacén
  .\scripts\geo-fix.ps1 -Lat 10.9 -Lng -63.87
#>
param(
    [string]$Stop = '',
    [double]$Lat = 0,
    [double]$Lng = 0,
    [string]$Adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
)

$stops = @{
    almacen = @{ lat = 10.955366952502162; lng = -63.87237058140661; nombre = 'Almacén' }
    parada1 = @{ lat = 10.8960855; lng = -64.0646284; nombre = 'MINIMARKET LA TRINITARIA' }
    parada2 = @{ lat = 10.9963; lng = -63.8337; nombre = 'Distribuidora Los Robles' }
    parada3 = @{ lat = 10.9595079; lng = -63.8540627; nombre = 'DONDE GABO' }
}

if ($Stop) {
    $s = $stops[$Stop.ToLower()]
    if (-not $s) { Write-Error "Parada desconocida: $Stop (usa almacen|parada1|parada2|parada3)"; exit 1 }
    $Lat = $s.lat
    $Lng = $s.lng
    $nombre = $s.nombre
} else {
    if ($Lat -eq 0 -and $Lng -eq 0) { Write-Error 'Usa -Stop o -Lat/-Lng.'; exit 1 }
    $nombre = "($Lat, $Lng)"
}

& $Adb emu geo fix $Lng $Lat | Out-Null
Write-Host "GPS fijado → $nombre  (lat $Lat, lng $Lng)"
Write-Host 'Espera 1-2 s y revisa el sheet en la app.'
