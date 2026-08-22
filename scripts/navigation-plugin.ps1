# Mueve/restaura el plugin local de Navigation SDK alrededor del build Android.
#
# NavigationSdkPlugin.java es un archivo LOCAL (no rastreado en git) que vive en
# android/app/src/main/java/com/tesis/driver/. En la rama `main` su compilación
# falla porque no existe la dependencia del Navigation SDK; en
# `feature/navigation-sdk` se necesita presente.
#
# Uso:
#   .\scripts\navigation-plugin.ps1 -Save    # mueve el plugin a backup (antes del build en main)
#   .\scripts\navigation-plugin.ps1 -Restore # devuelve el plugin (para volver a la rama feature)

param(
    [switch]$Save,
    [switch]$Restore
)

$plugin = Join-Path $PSScriptRoot '..\android\app\src\main\java\com\tesis\driver\NavigationSdkPlugin.java'
$backup = Join-Path $env:TEMP 'NavigationSdkPlugin.java.backup'

if ($Save) {
    if (Test-Path -LiteralPath $plugin) {
        if (-not (Test-Path -LiteralPath $backup)) {
            Copy-Item -LiteralPath $plugin -Destination $backup -Force
            Write-Output "[navigation-plugin] plugin guardado en backup: $backup"
        }
        Remove-Item -LiteralPath $plugin -Force
        Write-Output "[navigation-plugin] plugin retirado del proyecto (main no lo compila)."
    } else {
        Write-Output "[navigation-plugin] no hay plugin presente; nada que retirar."
    }
} elseif ($Restore) {
    if (Test-Path -LiteralPath $backup) {
        $dir = Split-Path -Parent $plugin
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Copy-Item -LiteralPath $backup -Destination $plugin -Force
        Write-Output "[navigation-plugin] plugin restaurado en: $plugin"
    } else {
        Write-Output "[navigation-plugin] no hay backup; nada que restaurar."
    }
} else {
    Write-Output "Uso: .\scripts\navigation-plugin.ps1 -Save | -Restore"
    exit 1
}