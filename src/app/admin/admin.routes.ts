import { Routes } from '@angular/router';
import { roleGuard } from '../auth/guards/role.guard';

export default [
    {
        path: '',
        loadComponent: () => import('../pages/dashboard/dashboard').then((m) => m.Dashboard),
    },
    {
        path: 'vehiculos',
        loadComponent: () =>
            import('./pages/vehiculos/vehiculos.component').then((m) => m.VehiculosComponent),
    },
    {
        path: 'vehiculos/mantenimiento',
        loadComponent: () =>
            import('./pages/vehiculos/mantenimiento/mantenimiento.component').then(
                (m) => m.MantenimientoComponent,
            ),
    },
    {
        path: 'vehiculos/combustible',
        loadComponent: () =>
            import('./pages/vehiculos/combustible/combustible.component').then(
                (m) => m.CombustibleComponent,
            ),
    },
    {
        path: 'choferes',
        loadComponent: () =>
            import('./pages/choferes/choferes.component').then((m) => m.ChoferesComponent),
    },
    {
        path: 'clientes',
        loadComponent: () =>
            import('./pages/clientes/clientes.component').then((m) => m.ClientesComponent),
    },
    {
        path: 'usuarios',
        loadComponent: () =>
            import('./pages/usuarios/usuarios.component').then((m) => m.UsuariosComponent),
        canActivate: [roleGuard],
        data: { roles: ['Administrador'] },
    },
    {
        path: 'rutas/carga',
        loadComponent: () => import('./pages/rutas/rutas.component').then((m) => m.RutasComponent),
    },
    {
        path: 'rutas/optimizacion',
        loadComponent: () =>
            import('./pages/rutas/optimizacion/optimizacion-rutas.component').then(
                (m) => m.OptimizacionRutasComponent,
            ),
    },
    {
        path: 'rutas/seguimiento',
        loadComponent: () =>
            import('./pages/rutas/seguimiento/seguimiento.component').then(
                (m) => m.SeguimientoComponent,
            ),
    },
    {
        path: 'historial',
        loadComponent: () =>
            import('./pages/historial/historial-entregas.component').then(
                (m) => m.HistorialEntregasComponent,
            ),
    },
    {
        path: 'informes',
        loadChildren: () => import('./pages/informes/informes.routes'),
    },
] as Routes;
