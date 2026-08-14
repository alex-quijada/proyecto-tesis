<#
.SYNOPSIS
  Recorre en el emulador Android la ruta REAL por calles que la app calculó con
  Google (ruta_detallada.path) y ESPERA en cada parada a que el chofer finalice
  la entrega (firma o incidencia) antes de avanzar a la siguiente.

.DESCRIPTION
  - Lee `ruta_detallada.path` del viaje en 'proceso' (o del -ViajeId indicado)
    y las coordenadas de sus paradas.
  - Alimenta `adb emu geo fix` punto a punto por el path → el circulito azul del
    SDK recorre las calles reales (no en línea recta).
  - En cada parada (detectada por distancia < ArriveMeters al punto) espera a
    que el sheet de entrega del WebView desaparezca (botón "Iniciar entrega" /
    "Finalizar entrega" ausente del DOM) antes de continuar.
  - Requiere: emulador corriendo, app abierta y navegando (viaje en 'proceso').

.PARAMETER ViajeId
  ID del viaje a recorrer. Si se omite, usa el último viaje en estado 'proceso'.

.PARAMETER Adb
  Ruta a adb.exe. Default: %LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe

.PARAMETER SecondsPerPoint
  Pausa entre cada `geo fix` (segundos). Default 0.4 → ~2 min para 329 puntos.

.PARAMETER Decimate
  Usar 1 de cada N puntos del path. Default 1 (todos).

.PARAMETER ArriveMeters
  Distancia a la parada para considerarla "alcanzada". Default 60.

.PARAMETER DwellSeconds
  Pausa tras llegar a la parada antes de vigilar el sheet. Default 6.

.PARAMETER TimeoutPerStopMin
  Máximo de espera por parada antes de continuar. Default 15.

.PARAMETER DryRun
  Solo resuelve viaje, path y paradas, descubre CDP y muestra un resumen.
#>
param(
    [string]$ViajeId = '',
    [string]$Adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
    [double]$SecondsPerPoint = 0.4,
    [int]$Decimate = 1,
    [int]$ArriveMeters = 60,
    [int]$DwellSeconds = 6,
    [int]$TimeoutPerStopMin = 15,
    [switch]$DryRun
)

$ErrorActionPreference = 'Continue'

# Llamar a supabase.js directo (evita el wrapper supabase.ps1 y su ruido en stderr).
$supabasePs = (Get-Command supabase -ErrorAction SilentlyContinue).Source
$supabaseJs = if ($supabasePs) {
    Join-Path (Split-Path $supabasePs) "node_modules\supabase\dist\supabase.js"
} else { '' }
if (-not $supabaseJs -or -not (Test-Path $supabaseJs)) { $supabaseJs = '' }

function Get-DistanceM([double]$lat1, [double]$lng1, [double]$lat2, [double]$lng2) {
    $R = 6371000.0
    $toRad = [Math]::PI / 180.0
    $dLat = ($lat2 - $lat1) * $toRad
    $dLng = ($lng2 - $lng1) * $toRad
    $a = [Math]::Sin($dLat / 2) * [Math]::Sin($dLat / 2) +
        [Math]::Cos($lat1 * $toRad) * [Math]::Cos($lat2 * $toRad) *
        [Math]::Sin($dLng / 2) * [Math]::Sin($dLng / 2)
    return $R * 2 * [Math]::Atan2([Math]::Sqrt($a), [Math]::Sqrt(1 - $a))
}

function Invoke-SqlJson([string]$sql) {
    # Reintenta una vez: la CLI puede anteponer banners al stdout.
    for ($i = 0; $i -lt 2; $i++) {
        if ($supabaseJs) {
            $raw = (& node $supabaseJs db query --linked -o json $sql 2>$null) | Out-String
        } else {
            $raw = (& supabase db query --linked -o json $sql 2>$null) | Out-String
        }
        try {
            $obj = $raw | ConvertFrom-Json
            if ($obj) { return $obj }
        } catch { }
        Start-Sleep -Seconds 1
    }
    throw "No se pudo obtener JSON de supabase db query."
}

function Get-WsUrl {
    $sock = (& $Adb shell cat /proc/net/unix 2>$null |
        Select-String -Pattern 'webview_devtools_remote' |
        ForEach-Object { ($_ -split '@')[-1].Trim() } |
        Select-Object -Last 1)
    if (-not $sock) { return '' }
    & $Adb forward --remove-all 2>$null | Out-Null
    & $Adb forward tcp:9222 localabstract:$sock 2>$null | Out-Null
    Start-Sleep -Milliseconds 400
    try {
        $r = Invoke-RestMethod -Uri 'http://localhost:9222/json' -TimeoutSec 5
        return [string]$r[0].webSocketDebuggerUrl
    } catch { return '' }
}

function Invoke-CdpEval([string]$ws, [string]$expr) {
    $client = [System.Net.WebSockets.ClientWebSocket]::new()
    $null = $client.ConnectAsync([Uri]$ws, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $exprJson = $expr | ConvertTo-Json -Compress
    $msg = '{"id":1,"method":"Runtime.evaluate","params":{"expression":' + $exprJson + ',"returnByValue":true}}'
    $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
    $null = $client.SendAsync([ArraySegment[byte]]::new($bytes), [WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    Start-Sleep -Milliseconds 400
    $buffer = New-Object byte[] 65536
    $sb = New-Object Text.StringBuilder
    do {
        $recv = $client.ReceiveAsync([ArraySegment[byte]]::new($buffer), [Threading.CancellationToken]::None).GetAwaiter().GetResult()
        $null = $sb.Append([Text.Encoding]::UTF8.GetString($buffer, 0, $recv.Count))
    } while (-not $recv.EndOfMessage)
    $client.Dispose()
    try { return ($sb.ToString() | ConvertFrom-Json).result.result.value } catch { return $null }
}

# ============ 1) Resolver viaje ============
if (-not $ViajeId) {
    Write-Host 'Buscando el viaje en estado "proceso"...'
    $det = Invoke-SqlJson "SELECT id_viaje FROM public.viajes WHERE estado='proceso' ORDER BY fecha_creacion DESC LIMIT 1;"
    $ViajeId = [string]$det[0].id_viaje
    if (-not $ViajeId) { Write-Error 'No hay viaje en "proceso". Iniciá el viaje en el Mapa primero (o pasá -ViajeId).'; exit 1 }
}
Write-Host "Viaje: $ViajeId"

# ============ 2) Path + paradas ============
$row = Invoke-SqlJson @"
SELECT
  (SELECT ruta_detallada->'path' FROM public.viajes WHERE id_viaje='$ViajeId') AS path,
  (SELECT jsonb_agg(jsonb_build_object('lat', s.latitud, 'lng', s.longitud, 'cliente', c.nombre_comercial) ORDER BY i.orden_visita)
     FROM public.itinerario_viaje i
     JOIN public.facturas f ON f.id_factura = i.id_factura
     JOIN public.sucursales_cliente s ON s.id = f.id_sucursal
     JOIN public.clientes c ON c.id_cliente = s.cliente_id
     WHERE i.id_viaje='$ViajeId') AS stops;
"@
$row = $row[0]
$path = @($row.path)
$stops = @($row.stops)

if ($path.Count -lt 2) { Write-Error 'El viaje no tiene ruta_detallada (path). Iniciá el viaje para que la app la calcule.'; exit 1 }
if ($stops.Count -lt 1) { Write-Error 'El viaje no tiene paradas con coordenadas.'; exit 1 }

if ($Decimate -gt 1) {
    $dec = @()
    for ($i = 0; $i -lt $path.Count; $i += $Decimate) { $dec += $path[$i] }
    $path = $dec
}

Write-Host ("Path: {0} puntos | Paradas: {1}" -f $path.Count, $stops.Count)
for ($i = 0; $i -lt $stops.Count; $i++) {
    Write-Host ("  {0}. {1} ({2}, {3})" -f ($i + 1), $stops[$i].cliente, $stops[$i].lat, $stops[$i].lng)
}

# ============ 3) CDP ============
$ws = Get-WsUrl
if ($ws) { Write-Host 'CDP WebView conectado (espera de firma habilitada).' }
else { Write-Warning 'CDP no disponible: la ruta avanzará sin esperar la firma.' }

if ($DryRun) { Write-Host 'DRY RUN — sin mover GPS.'; exit 0 }

# ============ 4) Recorrer el path ============
$stopIndex = 0
$arrived = @($false) * $stops.Count
$geoCount = 0
$nextLog = 0

foreach ($pt in $path) {
    & $Adb emu geo fix $pt.lng $pt.lat 2>$null | Out-Null
    $geoCount++

    if ($geoCount -ge $nextLog) {
        Write-Host ("  avanzando {0}/{1} ({2}%)" -f $geoCount, $path.Count, [int](100 * $geoCount / $path.Count))
        $nextLog = $geoCount + 40
    }

    # Detectar llegada a la próxima parada
    if ($stopIndex -lt $stops.Count -and -not $arrived[$stopIndex]) {
        $s = $stops[$stopIndex]
        $d = Get-DistanceM ([double]$pt.lat) ([double]$pt.lng) ([double]$s.lat) ([double]$s.lng)
        if ($d -le $ArriveMeters) {
            $arrived[$stopIndex] = $true
            Write-Host ("== LLEGASTE al punto {0}: {1} (a {2} m) ==" -f ($stopIndex + 1), $s.cliente, [int]$d)
            Start-Sleep -Seconds $DwellSeconds

            if ($ws) {
                $deadline = (Get-Date).AddMinutes($TimeoutPerStopMin)
                Write-Host '   Esperando a que finalices la entrega (firma/incidencia)...'
                while ($true) {
                    $sheet = Invoke-CdpEval $ws "!!([...document.querySelectorAll('button')].find(b => /Iniciar entrega|Finalizar entrega/.test(b.innerText)))"
                    if ($sheet -ne $true) { break }
                    if ((Get-Date) -gt $deadline) {
                        Write-Warning "   Timeout esperando la entrega del punto $($stopIndex+1). Continuando..."
                        break
                    }
                    Start-Sleep -Seconds 3
                }
                Write-Host "== Entrega del punto $($stopIndex+1) completada =="
            } else {
                Start-Sleep -Seconds 8
            }

            $stopIndex++
            if ($stopIndex -ge $stops.Count) {
                Write-Host '== Todas las entregas completadas =='
                break
            }
        }
    }

    Start-Sleep -Milliseconds ([int]($SecondsPerPoint * 1000))
}

Write-Host "Ruta recorrida con $geoCount geo fixes."
