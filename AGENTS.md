# AGENTS.md — Sakai19

## Tech stack

- **Angular 21+** — standalone components, zoneless change detection (`provideZonelessChangeDetection`)
- **PrimeNG 21** with PrimeUI Aura theme (`app-dark` class toggles dark mode)
- **Tailwind CSS v4** via `@tailwindcss/postcss` (PostCSS plugin)
- **Supabase** — Auth, Database (public schema), 2 Edge Functions (Deno 2)
- **Mapbox GL** (v3), **Chart.js** (v4.4), **Quill** (v2)
- **Vercel** deploy with SPA rewrites (`vercel.json`)

## Commands

| Command | Action |
|---------|--------|
| `ng serve` | Dev server at localhost:4200 |
| `ng build` | Production build to `dist/sakai-ng` |
| `ng build --configuration development` | Dev build (uses env replacement) |
| `ng test` | Karma + Jasmine unit tests |
| `npm run format` | Prettier: `--write **/*.{js,mjs,ts,mts,d.ts,html} --cache` |

## Architecture

### Route zones (all lazy-loaded)

| Path | Guard | Roles |
|------|-------|-------|
| `/` (default) | none | Login page |
| `/app` | `roleGuard` | Analista, Coordinador, Administrador |
| `/driver` | `roleGuard` | Chofer |
| `/auth/*` | none | Error, Access, Login pages |
| `/landing` | none | Public landing |

Role is read from `user.user_metadata['nombre_rol']` (Supabase user_metadata).

### Entrypoint

`src/main.ts` bootstraps `AppComponent` standalone with `appConfig` from `src/app.config.ts`.

### Data layer

- **Mock data** for rapid prototyping: `src/app/admin/pages/*/data/*-mock.ts`
- **Real data** through `AuthService` which wraps Supabase RPCs (`obtener_choferes`, `obtener_datos_adicionales_usuarios`) and direct `.from('table').select()` calls
- User creation/update goes through **Edge Functions** (`registrar-usuario`, `actualizar-usuario`) — admin-only, authorized by Bearer token

### State

Angular `signal()` / `computed()` throughout. No NgRx or services for local state.

### Styles

- Global: `src/assets/styles.scss` + `src/assets/tailwind.css`
- Component: SCSS (configured in `angular.json`)
- Dark mode: `<html class="app-dark">` — toggled via `LayoutService`

### Supabase local dev

```bash
supabase start        # starts Postgres + Studio + Edge Functions
supabase functions serve  # hot-reload Edge Functions
supabase db reset     # re-run migrations + seed
```

Config in `supabase/config.toml` (project_id: `proyecto-tesis`). Edge Functions in `supabase/functions/`, single migration in `supabase/migrations/`.

## Environment files

| File | Use |
|------|-----|
| `src/environments/environment.ts` | Production (gitignored) |
| `src/environments/environment.development.ts` | Dev (gitignored) |
| `*.example.ts` | Template — copy to the non-example file |

Contains `supabaseUrl`, `supabaseKey`, `mapboxKey`.

## Key conventions

- **TS strict mode** enabled — full strictness in `tsconfig.json`
- **`@/*` path alias** maps to `src/*` (used in imports like `@/environments/environment`)
- **Prettier**: `printWidth: 100`, `singleQuote: true`, Angular parser for HTML
- **EditorConfig**: 4-space indent, single quotes for TS
- **`git submodule`**: `src/assets` is a submodule of `cetincakiroglu/sakai-assets`
- **Generated files gitignored**: `dist/`, `.angular/cache/`, environment files

## OpenCode skills in use

- `angular-developer` — Angular patterns, PrimeNG, signals, routes
- `supabase` — Auth, Edge Functions, client lib
- `supabase-postgres-best-practices` — RPCs, migrations, RLS

## Mock-based prototyping

Most admin CRUD pages currently use mock data arrays. To move to real data, replace `*-mock.ts` imports in the component with `AuthService` Supabase calls. The mock interfaces (`Vehiculo`, `Usuario`, `Chofer`, `Cliente`, `GuiaDespacho`) serve as the domain model contracts.

## Anchored Summary — Session progress

### Auth / Sesión
- **JWT TTL ampliado a 8h (28800s)**: `supabase/config.toml` → `[auth] jwt_expiry = 28800` (local + push remoto vía `supabase config push`; se desactivó `storage.vector` en config.toml porque el remoto está en plan free y el push de storage fallaba con 402). Nota: config.toml NO incluye auth JWT TTL configurable por CLI de lectura; se aplica a tokens nuevos (re-login o siguiente refresh).
- **Cierre de sesión prematuro**: el único punto que fuerza logout es `onAuthStateChange` → `TOKEN_REFRESH_FAILED` → `cerrarSesionExpirada()` (auth.service.ts). Causas: carrera multi-pestaña (refresh token rotation) o caída de red durante el refresh. Fix: `recuperarSesionOExpirar()` reintenta refresh y re-chequea `getSession()` antes de cerrar (solo cierra si no hay sesión vigente).
- **Diagnóstico**: `AuthService` loguea eventos (`[Auth] fecha | EVENTO | expira:`), TTL real del JWT decodificado (`exp-iat`, `[Auth] Access token: TTL=... min`), y `cerrarSesionExpirada(reason)` guarda el motivo en `sessionStorage['ultimo_cierre_sesion']`. Login page muestra "Motivo:" del cierre cuando `sesionExpirada=true`.
- UI usuarios: confirm dialogs usan `acceptLabel` contextual (Desactivar/Reactivar/Desactivar Todo); el diálogo de usuario ya no permite asignar activo/inactivo (se gestiona por botones de fila).
- **Gestión de Usuarios solo administrador**: ruta `/app/usuarios` con `canActivate: [roleGuard]` + `data: { roles: ['Administrador'] }` (admin.routes.ts); los no-admin redirigen a `/app`. El menú (`app.menu.ts`) construye `model` según `getUserRole()` y solo incluye la sección "Administración de Acceso" cuando el rol es Administrador.

### Layout
- **Optimización de Rutas** page: two-column layout with Cronograma Semanal (left, w-80) and Guías + Mapa (right, flex-1). Cronograma days arranged in a 2-column grid using `grid grid-cols-2`.

### Database / Supabase
- Migration `00026`: `cronograma_semanal` table with RLS.
- Migration `00027`: `obtener_cronograma_semanal` RPC.
- `CronogramaService` (`src/app/admin/services/cronograma.service.ts`) — loads/saves cronograma from DB.
- `MunicipioService` (`src/app/admin/services/municipio.service.ts`) — fetches distinct municipios via `obtener_municipios` RPC.
- `CRONOGRAMA_DEFAULT` seeded with real UUIDs from `obtener_municipios` output.
- **Viajes acumulables** (pushed to remote): ciclo `programado` (abierto/reutilizable, facturas→`embarque`) → `proceso` (cerrado al "Salir" del chofer, facturas→`proceso`) → `finalizado`/`cancelado`. El admin **agrega guías** a un viaje abierto del chofer; la ruta optimizada solo se calcula al cerrarlo.
- Migrations pushed: `00033_fix_roles_case_sensitive.sql` (roles PascalCase + RLS case-insensitive), `00034_viajes_acumular_estados.sql` (DROP `viajes.municipio`; RPCs `crear_viaje` sin municipio/fechas, `iniciar_viaje`, `obtener_viaje_chofer`, `obtener_viajes`; `historial_estados_factura` en ambos), `00035_obtener_guias_chofer.sql` (RPCs móvil chofer; **renombrada de `00034` para evitar colisión de versión**), `00036_align_viajes_id_vehiculo_uuid.sql` (remoto tenía `viajes.id_vehiculo` uuid con FK a `vehiculos`; se estandariza a uuid + casts `::uuid` en RPCs), `00037_ensure_viajes_columns.sql` (remoto no tenía `fecha_creacion`/`created_at` en `viajes`; se agregan con `ADD COLUMN IF NOT EXISTS`).
- **Drift local/remoto detectado**: el remoto fue creado manualmente con `viajes.id_vehiculo` uuid (+ FK) y sin `fecha_creacion`; local (00030) lo tenía TEXT con `fecha_creacion`. Los RPCs de 00034 asumían TEXT y reventaban (`operator text = uuid`). Verificado vía PostgREST: `obtener_viajes`, `obtener_viaje_chofer`, `crear_viaje`, `iniciar_viaje` responden correctamente.
- RPCs de viajes exponen facturas con `latitud`/`longitud` (JOIN `sucursales_cliente`) y `monto_dolares`, más `chofer`/`placa_vehiculo`.
- `00038_fix_usuarios_rls_case_insensitive.sql` (pushed): las policies RLS de `public.usuarios` (creadas manualmente en remoto) comparaban roles en minúscula (`'administrador'`), pero 00033 normalizó los roles a PascalCase. Un admin ya no pasaba ninguna policy SELECT salvo "Users can view own data" → solo veía 1 usuario. Se recrearon las policies con `LOWER()` (SELECT, INSERT, UPDATE, DELETE).
- `00039_calcular_vencimientos.sql` (pushed): **vencimientos calculados en BD**. Certificado médico = expedición + 5 años; licencia = expedición + 10 años. Triggers `trg_calcular_vencimiento_certificado` / `trg_calcular_vencimiento_licencia` (BEFORE INSERT OR UPDATE) + backfill. El formulario ya no pide la fecha de vencimiento: se quitó de `usuario-dialog` (se muestra calculada como solo lectura), de las Edge Functions `registrar-usuario`/`actualizar-usuario` y de `auth.service` (`registrarUsuarioPorRol`/`actualizarUsuarioPorRol`).
- `00040_obtener_ultimo_acceso.sql` (pushed): `obtener_datos_adicionales_usuarios` devuelve `ultimo_acceso` (`auth.users.last_sign_in_at`) vía LEFT JOIN a `auth.users` (SECURITY DEFINER). `auth.service.listarUsuarios` lo mapea a `usuario.ultimoAcceso` (columna "Último Acceso" de Gestión de Usuarios).
- `00043_unicidad_datos_criticos.sql` (pushed): **restricciones UNIQUE en datos críticos**. `clientes.numero_doc` (UNIQUE), `clientes.correo` (índice parcial `WHERE correo IS NOT NULL AND correo <> ''`), `facturas.num_factura` (UNIQUE), `guias_carga.codigo_guia` (UNIQUE). `usuarios` cedula/email, `vehiculos.placa` y `licencias_conducir.licencia_numero` ya existían. Limpieza previa de duplicados de prueba en remoto: se eliminó "Guao de Prueba, C.A." (duplicaba `numero_doc`), `correo=''` → NULL, y de las 7 guías `batch/out/84777` (importación repetida 07-08/08-01/08-02) se conservó la más reciente (08-02) con sus facturas, borrando el resto (facturas 17→5, guías 9→3, clientes 11→10). Verificado vía `supabase db query --linked`.
- **Manejo de duplicados en front**: helper `src/app/services/errores.util.ts` (numero_doc→"El número de documento ya existe.", correo→"El correo ya existe."), `VehiculoService` (placa→"La placa ya está registrada."), `RutaService` (codigo_guia→"El código de guía ya existe.", num_factura→"El número de factura ya existe."; también se captura el error del upsert de facturas en `actualizarGuia` que antes se ignoraba). `AuthService.traducirErrorUsuario` (email→"El email ya está registrado.", cédula→"La cédula ya está registrada.", licencia→"El número de licencia ya está registrado.") aplicado en `registrarUsuarioPorRol`/`actualizarUsuarioPorRol`/`doInsert`. Edge Functions desplegadas: `registrar-usuario` pre-valida cédula y licencia duplicadas antes de `createUser` (la cédula no podía traducirse del error de GoTrue porque el fallo ocurre en el trigger `on_auth_user_created` y GoTrue solo reporta "Database error saving new user") y traduce email en `createError`; `actualizar-usuario` traduce email/cédula/licencia.
- `00042_normalizar_catalogos_vehiculos.sql` (pushed): el remoto tenía los catálogos de vehículos en minúsculas y un typo en `tipos_cajas.nombre_caja` = `'refrijerado'` (el pipe `tipoCajaLabel` mostraba "No Definido" en el refrigerado). Se corrige el typo y se normalizan a mayúsculas `tipos_cajas` (SECA/PLATAFORMA/REFRIGERADO/ARTICULADO), `tipos_vehiculos` (CARRO/MOTO/CAMION) y `estados_vehiculos` (OPERATIVO/MANTENIMIENTO/INACTIVO). RPCs ya eran case-insensitive (00005) y el FK es por UUID → sin pérdida de datos. Sin cambios de frontend.
- **Zoneless + estado async en diálogos**: con `provideZonelessChangeDetection`, escribir `errorMessage`/`saving`/`loading` como propiedades planas dentro de continuaciones async (tras `await`) NO dispara change detection hasta el siguiente evento (el mensaje de error salía solo al tocar el formulario y el botón quedaba en loading). Se convirtieron a `signal()` en: `vehiculo-dialog`, `cliente-dialog` (`saving`), `sucursal-dialog` (`saving`), `usuario-dialog` y `guia-dialog`. Los templates invocan `errorMessage()`/`saving()`/`loading()` (las señales NO se auto-desenvuelven en bindings de `@Input` como `[text]`/`[loading]`/`*ngIf`/`@if`). `chofer-dialog`/`ruta-dialog`/`combustible-dialog`/`mantenimiento-dialog` conservan propiedades planas porque sus `save()` son síncronos.
- `00041_desactivar_usuarios.sql` (pushed): **soft-delete de usuarios**. RPCs SECURITY DEFINER `desactivar_usuario(p_id)` (activo=false + `auth.users.banned_until='infinity'`) y `reactivar_usuario(p_id)` (activo=true + limpia ban); `obtener_choferes` ahora filtra `activo = true`. `auth.service` reemplazó `eliminarUsuario` por `desactivarUsuario`/`reactivarUsuario`, `login()` chequea `activo=false` tras `signInWithPassword` (signOut + error "Tu usuario está desactivado..."), y `listarUsuarios` mapea el `activo` real. UI: `usuarios.component` usa `toggleEstadoUsuario` (botón Desactivar/Reactivar por fila + `desactivarSelectedUsuarios`); `choferes.component` usa `deleteChofer`/`deleteSelectedChoferes` ahora desactivan (icono `pi-user-minus`).
- `00045_roles_desactivar_reactivar.sql` (pushed): **autorización por rol en los RPCs** `desactivar_usuario`/`reactivar_usuario` (antes ejecutables por cualquier `authenticated`). Validan `auth.uid()` → `usuarios.roles.nombre_rol`; solo personal interno (Administrador, Analista, Coordinador) puede desactivar/reactivar, con `RAISE EXCEPTION` si se deniega. La funcionalidad (activo=false + banned_until='infinity', bloquea login) se mantiene; así el desactivar de choferes y de usuarios es idéntico y lo pueden hacer analista/admin.

### Google Maps integration
- Replaced Mapbox GL JS with **Google Maps JavaScript API** (`@googlemaps/js-api-loader`).
- **GoogleMapsOptimizationService** (`src/app/admin/services/google-maps-optimization.service.ts`) — handles map init, markers, directions, route optimization.
- Warehouse coordinates from environment (`WH_COORDS`).
- All facturas (not just one per guía) plotted as numbered delivery markers (blue circle icons).
- Marker system: warehouse marker (brown home icon) + numbered markers for deliveries.
- All markers turn blue when guías are selected; single route polyline shown.
- **Optimize Route** button calls `computeRoute()` (not Directions API optimizeWaypoints) to show a single polyline connecting waypoints in order.
- `computeRoute()` also used by `mi-ruta` (chofer) y `verRutaViaje` (admin) para dibujar la ruta optimizada persistida de un viaje cerrado.
- Environment config: replaced `mapboxKey` with `googleMapsKey` + `WH_COORDS` in both `environment.ts` and `environment.development.ts`.

### Optimization page component
- `OptimizacionRutasComponent` (`src/app/admin/pages/rutas/optimizacion/`):
  - Loads cronograma, municipios, guías pendientes on init
  - Day editing: drag-and-drop reorder, add/remove municipios per day
  - Guía selection (checkbox), filter by chofer
  - "Agregar a viaje" — `confirmarCrearViajes` acumula facturas en un viaje `programado` abierto del chofer (crea o reutiliza vía `crear_viaje`, que devuelve `{ nuevo, viaje }`)
  - Panel "Viajes" con estado + conteos de facturas y "Ver ruta" (`verRutaViaje`) solo cuando el viaje está cerrado (`facturas_proceso > 0`)
  - "Optimizar Ruta" — plots selected guías' facturas on the map
  - Layout: left column (cronograma, 2-column grid) + right column (guías + map)

### Chofer — `mi-ruta`
- `MiRutaComponent` (`src/app/driver/pages/mi-ruta/`) con datos reales vía `obtener_viaje_chofer`.
- "Salir / Iniciar viaje": optimiza la ruta (`computeRoute`), llama `iniciar_viaje` con el orden óptimo y pasa al tab mapa (marcadores numerados + polyline).
- Reordenar paradas (drag) y firma por entrega (`finalizar_entrega` en el futuro; hoy `FINALIZADO` local).

### Conectividad / offline
- `ConnectivityService` (`src/app/services/connectivity.service.ts`) — `isOnline` signal; escucha eventos `online`/`offline`, **envuelve `window.fetch`** global (marca offline ante `TypeError: Failed to fetch`, ignora `AbortError`) y hace health check cada 10s contra `supabaseUrl/rest/v1/` mientras está offline (`checkNow()` para reintentar).
- `AppConnectivityBanner` (`src/app/layout/component/app.connectivity-banner.ts`) — banner fijo superior "Sin conexión a internet" con botón Reintentar + toast "Conexión restablecida" al volver online. Montado en `AppComponent` (visible en todas las rutas).
