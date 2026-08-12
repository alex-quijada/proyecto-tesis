# PLAN — Versión Android con Capacitor + Google Maps SDK nativo

Proyecto: Sakai19 (Angular 21, PrimeNG, Supabase)
Fecha: 2026-08-10
Estado: EN EJECUCIÓN
  - [x] Fase 0 — Consola de Google Cloud (completa — clave Android registrada)
  - [x] Fase 1 — Bootstrap de Capacitor (completa)
  - [x] Fase 2 — Mapa del chofer → SDK nativo (completa, verificado en APK debug)
  - [x] Fase 3 — Entornos + admin (envs completos; verificación visual del admin pendiente)
  - [x] Fase 4 — APK debug (instalado y lanzado en dispositivo)
  - [ ] Fase 4b — APK release firmado (keystore + signingConfig + SHA-1 release) — PENDIENTE (hacer al final, cuando las funciones nuevas estén listas)

---

## OBJETIVO

Empaquetar la app completa (admin + chofer) como APK de Android con Capacitor 8
y usar el SDK nativo de Google Maps para el mapa del chofer (`/driver/mapa`).
Directions + autocomplete Places siguen usando la Google Maps JS API dentro del
WebView (sin cambios en su lógica).

---

## DIAGNÓSTICO ACTUAL

- No existe Capacitor: no hay `capacitor.config.ts`, ni carpeta `android/`, ni deps.
- El mapa usa Google Maps JS API (`google.maps.*`) en 7+ archivos:
  `mi-ruta.component.ts`, `navigation.service.ts`, `ruta.component.ts`, `map.ts`
  (admin), `dashboard.ts`, `google-search.service.ts` (Places),
  `google-maps-optimization.service.ts` (Directions).
- Entorno ya listo:
  - Java 17 (Capacitor 8 soporta 17+; recomienda 21)
  - Android Studio instalado (`Program Files\Android\Android Studio`)
  - SDK en `%LOCALAPPDATA%\Android\Sdk` (platform android-35; Capacitor 8 usa
    compileSdk 36 -> Gradle lo descarga)
  - debug keystore SHA-1: `C6:A9:5F:D0:C2:A4:0A:64:50:B4:DC:C7:F5:4B:86:7F:43:7B:2E:02`
  - `tsconfig.json` ya tiene `skipLibCheck: true` (lo pide el plugin nativo)
- Versiones a instalar:
  - `@capacitor/core` 8.5.0
  - `@capacitor/cli` 8.5.0
  - `@capacitor/android` 8.5.0
  - `@capacitor/google-maps` 8.0.1 (envuelve Maps SDK nativo Android/iOS, con
    implementación web -> misma API en navegador y nativo)
  - `@capacitor/geolocation` 8.2.1

---

## NOTA CRÍTICA: BILLING Y CLAVES API

- Si la Maps JS API ya funciona hoy en el navegador, el billing YA está activo
  (Google lo exige desde 2018). El SDK nativo factura bajo la misma cuenta.
- UNA CLAVE NO PUEDE ESTAR RESTRINGIDA A LA VEZ A WEB (referrer) Y A ANDROID
  (SHA-1). Se necesitan DOS claves:

  - `googleMapsKey` (actual `AIzaSyBsWW8wQrG_ZT0kxUz04abKG1gXrbPjg_I`) -> JS API
    (web + WebView del APK)
    - Verificar restricción de referrer: debe incluir el origin del WebView de
      Capacitor (`https://localhost`) o Directions/Places fallarán en el APK.
      Si está limitada a un dominio, agregar `localhost` / el dominio de deploy.
  - `androidGoogleMapsKey` (NUEVA, se crea en consola) -> Maps SDK nativo
    - Restricción: Android apps
    - Package name (ej. `com.tesis.sakai`) + SHA-1 debug
      (`C6:A9:5F:D0:C2:A4:0A:64:50:B4:DC:C7:F5:4B:86:7F:43:7B:2E:02`)
    - API habilitada: "Maps SDK for Android"
    - Agregar también SHA-1 del keystore release cuando exista.

---

## FASE 0 — Consola de Google Cloud (MANUAL, ~15 min) — COMPLETA

Pasos que hace la persona (no automatizables):

1. Confirmar billing activo en Google Cloud Console.
2. Crear `androidGoogleMapsKey` restringida a Android (package + SHA-1 debug)
   con "Maps SDK for Android" habilitado.
3. Revisar la restricción de `googleMapsKey`: agregar referrer `https://localhost`
   (y dominio de deploy) si Directions/Places deben funcionar dentro del APK.
4. Anotar el valor de `androidGoogleMapsKey` para pegarlo en `environment.*.ts`.

Entregable: `androidGoogleMapsKey` lista.

---

## FASE 1 — Bootstrap de Capacitor (dificultad 20/100) — COMPLETA

1. Instalar dependencias:

   ```bash
   npm i @capacitor/core @capacitor/cli @capacitor/android
   npm i @capacitor/google-maps @capacitor/geolocation
   ```

2. Inicializar:

   ```bash
   npx cap init "Sakai19" "com.tesis.sakai" --web-dir dist/sakai-ng
   ```

   (`appId "com.tesis.sakai"` es propuesta; ajustable antes de generar)

3. Agregar plataforma Android:

   ```bash
   npx cap add android
   ```

   -> crea `capacitor.config.ts` y carpeta `android/`.

4. `capacitor.config.ts`: verificar `appId`, `appName`, `webDir "dist/sakai-ng"`.

5. `AndroidManifest.xml` (`android/app/src/main/`):

   ```xml
   <uses-permission android:name="android.permission.INTERNET" />
   <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
   <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
   ```

   Dentro de `<application>`:

   ```xml
   <meta-data android:name="com.google.android.geo.API_KEY"
              android:value="ANDROID_GOOGLE_MAPS_KEY" />
   ```

6. `package.json`: agregar script:

   ```json
   "build:android": "ng build && npx cap sync android"
   ```

7. Compilar el primer APK debug (la app corre, mapa aún sin migrar):

   ```bash
   ng build
   npx cap sync android
   npx cap open android   # o gradlew assembleDebug
   ```

Verificación: la app abre en emulador/dispositivo, login con Supabase funciona,
Directions/Places funcionan en el WebView.

---

## FASE 2 — Migrar el mapa del chofer al SDK nativo (dificultad 45/100) — COMPLETA

> Nota de ejecución: `appId` usado fue `com.tesis.driver` (NO `com.tesis.sakai`).
> Ver `DECISIONES ABIERTAS` al final.

Objetivo: `/driver/mapa` (`mi-ruta.component`) usa `@capacitor/google-maps`
tanto en nativo (Maps SDK) como en navegador (una sola implementación vía el
plugin).

Archivos:

- `src/app/driver/pages/viajes/mi-ruta.component.ts` / `.html`
- `src/app/driver/services/navigation.service.ts`

1. **HTML**: reemplazar `<div #mapaElement>` por `<capacitor-google-map>` con
   estilos `width`/`height` (el elemento no tiene tamaño por defecto).

2. **TS — creación del mapa**:

   ```ts
   import { GoogleMap } from '@capacitor/google-maps';

   const apiKey = Capacitor.isNativePlatform()
       ? environment.androidGoogleMapsKey
       : environment.googleMapsKey;

   const mapa = await GoogleMap.create({
       id: 'mi-ruta-chofer',
       element: mapaEl.nativeElement,
       apiKey,
       config: { center: { lat: warehouseLat, lng: warehouseLng }, zoom: 10 },
   });
   ```

3. **Migrar dibujado al API del plugin**:
   - `addMarkers()` para almacén (icono morado) y entregas numeradas (icono ámbar).
   - `addPolylines()` con UNA polyline por leg (los `legs` de calles ya
     persistidos en `viajes.ruta_detallada`) -> se conserva la ruta por calles
     y por tramos.
   - `fitBounds({ coordinate1, coordinate2, padding })` para el encuadre.
   - `setCamera()` para "seguir al chofer" (sustituye `panTo`).

4. **Marcador del chofer (LIMITACIÓN del plugin)**:
   - No existe mover marker; hay que `removeMarker` + `addMarker`.
   - Modo GPS: usar `enableCurrentLocation(true)` (punto azul nativo) y no
     dibujar marcador propio.
   - Modo simulación: recrear el marcador con throttle (~1 s) para no saturar
     el bridge (el movimiento será menos suave que en web).

5. **GPS nativo**:
   - `navigation.service.ts`: en `iniciarGps()`, si
     `Capacitor.isNativePlatform()` usar `@capacitor/geolocation.watchPosition()`;
     si no, `navigator.geolocation`.
   - La lógica de navegación (pasos, llegadas, re-ruteo, simulación) NO cambia.

6. **Lo que NO cambia**:
   - `GoogleMapsOptimizationService` (Directions) -> JS API en el WebView.
   - `google-search.service.ts` (autocomplete Places) -> JS API en el WebView.
   - `ruta.component.ts` (`/driver/ruta`) si decide conservar su mapa JS mientras.

Verificación: `/driver/mapa` funciona en navegador (`ng serve`) y en el APK con
el SDK nativo; se ven los tramos por calles; el GPS sigue la posición real.

---

## FASE 3 — Admin y detalles (dificultad 15/100) — COMPLETA (envs)

1. `dashboard.ts` y `map.ts` (admin) siguen con la JS API (funcionan en el
   WebView). Solo verificación visual.

2. Entornos: agregar `androidGoogleMapsKey` a:
   - `src/environments/environment.ts` ✅
   - `src/environments/environment.development.ts` ✅
   - `environment.example.ts` y `environment.development.example.ts` ✅
     (con placeholder `"your-android-google-maps-key"`)

3. `tsconfig`: `skipLibCheck` ya está; agregar tipos del plugin si hiciera falta.

---

## FASE 4 — APK final (dificultad 20/100) — DEBUG LISTA / RELEASE PENDIENTE

1. Build web + sync:

   ```bash
   ng build
   npx cap sync android
   ```

2. Debug (instalable en el dispositivo): ✅

   ```bash
   npx cap run android
   # o: cd android && gradlew assembleDebug
   ```

   APK: `android/app/build/outputs/apk/debug/app-debug.apk`

   Verificado: instalado (`adb install -r`) y lanzado en dispositivo
   (`R5CX61KZLKP`). Logcat: `MapsInitializer: loadedRenderer: LATEST`.
   En `/driver/mapa` el **bottom sheet** inferior es colapsable
   (`sheetExpandido`): colapsado solo header "Puntos de entrega", expandido
   lista + selector modo + botón de acción. El botón "Iniciar viaje / Iniciar
   simulación" **respeta el orden actual** de las paradas (no reordena ni
   persiste orden; eso vive en `/driver/ruta`).

3. Release firmado (para distribuir): PENDIENTE
   - Generar keystore release (`keytool`).
   - Configurar `signingConfigs` en `android/app/build.gradle`.
   - Agregar SHA-1 release a `androidGoogleMapsKey` en la consola.
   - `gradlew assembleRelease` -> APK firmado.

---

## ARCHIVOS QUE SE TOCAN

Nuevos:

- `capacitor.config.ts`
- `android/` (proyecto nativo generado por Capacitor)

Modificados:

- `package.json` (deps + script `"build:android"`)
- `src/environments/environment.ts` / `environment.development.ts` / `*.example.ts`
  (`androidGoogleMapsKey`)
- `src/app/driver/pages/viajes/mi-ruta.component.ts` / `.html` (mapa nativo)
- `src/app/driver/services/navigation.service.ts` (GPS vía Capacitor)
- `android/app/src/main/AndroidManifest.xml` (permisos + API key)
- `tsconfig.app.json` (tipos del plugin, solo si es necesario)
- `package.json` (+ `@angular/animations@21.0.6` para las transiciones de ruta del driver)

Sin cambios:

- `src/index.html` (script de la JS API se mantiene)
- `src/app/admin/pages/map/map/google-maps-optimization.service.ts` (Directions)
- `src/app/admin/pages/clientes/service/google-search.service.ts` (Places)
- `src/app/admin/pages/map/map/map.ts` y `dashboard.ts` (JS API)

---

## RIESGOS Y MITIGACIONES

1. **Billing** -> si la JS API ya funciona, billing está activo. No bloqueante.
2. **Clave JS restringida por referrer** -> Directions/Places fallarían dentro
   del APK. Se corrige en Fase 0 agregando `https://localhost` al referrer.
3. **compileSdk 36** (solo hay android-35) -> Gradle lo descarga; requiere
   aceptar licencias (carpeta `licenses` ya existe). Opción: instalar
   `android-36` por SDK Manager antes de compilar.
4. **Marcador del chofer animado** -> en nativo se recrea cada ~1 s (menos
   suave que en web). Aceptable para la tesis; se puede optimizar luego.
5. **Java 17 vs 21** -> Capacitor 8 soporta 17+; si Gradle se queja, instalar
   JDK 21 o subir `JAVA_HOME`.

---

## ORDEN DE EJECUCIÓN

1. Fase 0 (manual, requiere persona) -> desbloquea el resto — **PENDIENTE**
2. Fase 1 (bootstrap + primer APK) -> base funcionando — **COMPLETA**
3. Fase 2 (mapa nativo del chofer) -> feature principal — **COMPLETA**
4. Fase 3 (envs + verificación admin) -> pulido — **COMPLETA (envs); verificación admin pendiente**
5. Fase 4 (APK debug / release) -> entregable final — **debug COMPLETA; release pendiente**

## DECISIONES ABIERTAS (confirmar antes de ejecutar)

- `appId` definitivo: ¿`com.tesis.sakai`? (afecta clave Android en Fase 0)
  → **RESUELTO**: se usa `com.tesis.driver` (ya configurado en
  `capacitor.config.ts`, `android/app/build.gradle`, manifest y script
  `deploy:android`). La restricción de la clave Android en Google Cloud debe
  usar package `com.tesis.driver`.
- ¿Migrar también el mapa del admin a nativo o dejarlo en JS API? (recomendado:
  dejarlo en JS API)
  → **RESUELTO**: se deja en JS API (funciona en el WebView).
- ¿El marcador del chofer en nativo: aceptar throttle ~1 s o invertir más
  trabajo en una transición suave?
  → **RESUELTO**: se acepta throttle ~1 s (GPS real usa `enableCurrentLocation`,
  punto azul nativo; el throttle aplica solo a simulación).

---

## ERRORES Y LECCIONES APRENDIDAS — NO REPETIR

0. **`effect()` NO puede crearse dentro de `afterNextRender`** → `NG0203:
   effect() can only be used within an injection context`. Los callbacks de
   `afterNextRender` no preservan el contexto de inyección para `effect()`.
   Crear los `effect()` en el constructor (o inicializador de campo); usar
   `afterNextRender` solo para acceso al DOM (p. ej. añadir clase
   `mapa-nativo`). Detectado en `mi-ruta.component.ts` en la prueba en
   dispositivo (el mapa se creaba igual, pero Angular registraba el error).

1. **SVG NO soportado en markers nativos.** El plugin en Android carga
   `iconUrl` solo desde `https://` o la carpeta `public/` de assets y no
   decodifica SVG (degradación silenciosa al marcador default con warning).
   NO usar data URIs. Para colores sin assets usar `tintColor`
   (`{r,g,b,a}`); en web mapea al `PinElement.background`+`glyph` y en nativo
   al hue del marker default.

2. **Transparencia del WebView (Android) es obligatoria.** El mapa nativo se
   dibuja DEBAJO del WebView; si `body` o el layout tiene fondo opaco, el mapa
   no se ve. Fix: quitar el fondo del wrapper de la ruta (`DriverLayout`,
   signal `fondoMapa` por ruta), y `html.mapa-nativo body { background-color:
   transparent !important }` con clase en `<html>` (se agrega en
   `afterNextRender` y se limpia en destroy). "No veo el mapa en Android" →
   revisar esto primero (es la nota oficial del plugin).

3. **`webDir` debe apuntar a la salida real.** Angular 21 emite
   `dist/sakai-ng/browser` (incluso en `--configuration development`), NO
   `dist/sakai-ng`. Con `webDir` incorrecto, `cap sync` copia assets vacíos y
   el APK queda en blanco. Verificar siempre el `Output location:` del build.

4. **Los markers nativos no se mueven.** No hay `setPosition`; hay que
   `removeMarker` + `addMarker`. En simulación (tick de 200 ms) sin throttle se
   satura el bridge → throttle ~1 s en nativo. GPS real: mejor
   `enableCurrentLocation(true)` (punto azul nativo) y no dibujar marker propio;
   llamar `enableCurrentLocation(false)` al volver a simulación.

5. **`CUSTOM_ELEMENTS_SCHEMA` obligatorio.** Angular standalone no conoce
   `<capacitor-google-map>`; sin `schemas: [CUSTOM_ELEMENTS_SCHEMA]` el
   template falla al compilar. El elemento viene sin tamaño → CSS
   `display:block; width/height:100%`.

6. **Crear el mapa con tamaño 0.** `GoogleMap.create` usa
   `getBoundingClientRect`; si el elemento no tiene tamaño (p. ej. todavía
   oculto), el mapa queda mal posicionado. Patrón `initMapa`: retry cada 150 ms
   hasta `clientHeight > 0`.

7. **Id de mapa único + destroy.** Al navegar fuera y volver, reusar el mismo
   `id` puede colisionar; usar id fijo (`mi-ruta-chofer`) y `mapa.destroy()` en
   `onDestroy` para evitar fugas/mapas fantasma.

8. **Fase 0 no se salta.** El APK abre y el SDK inicializa aunque
   `androidGoogleMapsKey` no esté registrada, pero el mapa no muestra tiles y NO
   hay crash claro en logcat. Si el web funciona y el APK no muestra el mapa,
   revisar la consola de Google Cloud: clave con restricción **Android apps**,
   package `com.tesis.driver`, SHA-1 debug
   `C6:A9:5F:D0:C2:A4:0A:64:50:B4:DC:C7:F5:4B:86:7F:43:7B:2E:02`, API
   "Maps SDK for Android".

9. **`triggerEvent` es benigno (NO perseguir).** Al reinstalar con
   `adb install -r` el WebView restaura la sesión previa: aparece
   `Uncaught TypeError: reading 'triggerEvent'` y el `MapsInitializer` puede
   correr antes que Angular. No crashea. Para logs limpios: `adb uninstall
   com.tesis.driver` antes de reinstalar.

10. **El build de desarrollo queda en el APK.** `ng build --configuration
    development` deja "Angular running in development mode" y mayor tamaño.
    Para el APK definitivo usar `npm run build` (producción).

11. **GPS nativo requiere permiso en runtime.** Además de los
    `uses-permission` del manifest, hay que pedir permiso en runtime
    (`Geolocation.requestPermissions({ permissions: ['location'] })` antes de
    `watchPosition`) o el punto azul no aparece y las actualizaciones fallan
    silenciosamente.

12. **`appId` debe ser consistente en todos lados.** `com.tesis.driver` en
    `capacitor.config.ts`, `android/app/build.gradle`, manifest, script
    `deploy:android` y restricción de la clave en Google Cloud. Cambiarlo a
    mitad de camino rompe la clave y el deploy.
