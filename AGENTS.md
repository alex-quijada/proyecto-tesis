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
