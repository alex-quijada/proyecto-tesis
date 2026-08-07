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
