import { Routes } from '@angular/router';

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
    },
    {
        path: 'rutas/carga',
        loadComponent: () => import('./pages/rutas/rutas.component').then((m) => m.RutasComponent),
    },
] as Routes;
