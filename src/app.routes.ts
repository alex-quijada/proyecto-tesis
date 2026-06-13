import { Routes } from '@angular/router';
import { AppLayout } from './app/layout/component/app.layout';
import { Dashboard } from './app/pages/dashboard/dashboard';
import { Documentation } from './app/pages/documentation/documentation';
import { Landing } from './app/pages/landing/landing';
import { Notfound } from './app/pages/notfound/notfound';
import { roleGuard } from './app/auth/guards/role.guard';

export const appRoutes: Routes = [
    {
        path: '',
        component: AppLayout,
        canActivate: [roleGuard], // Protégé todo el Layout administrativo
        data: { roles: ['Analista', 'Coordinador', 'Administrador'] }, // Solo personal interno
        children: [
            { path: '', component: Dashboard },
            {
                path: 'vehiculos',
                loadComponent: () =>
                    import('./app/admin/pages/vehiculos/vehiculos.component').then(
                        (m) => m.VehiculosComponent,
                    ),
            },
            {
                path: 'vehiculos/mantenimiento',
                loadComponent: () =>
                    import('./app/admin/pages/vehiculos/mantenimiento/mantenimiento.component').then(
                        (m) => m.MantenimientoComponent,
                    ),
            },
            {
                path: 'vehiculos/combustible',
                loadComponent: () =>
                    import('./app/admin/pages/vehiculos/combustible/combustible.component').then(
                        (m) => m.CombustibleComponent,
                    ),
            },
            {
                path: 'choferes',
                loadComponent: () =>
                    import('./app/admin/pages/choferes/choferes.component').then(
                        (m) => m.ChoferesComponent,
                    ),
            },
            {
                path: 'clientes',
                loadComponent: () =>
                    import('./app/admin/pages/clientes/clientes.component').then(
                        (m) => m.ClientesComponent,
                    ),
            },
            {
                path: 'usuarios',
                loadComponent: () =>
                    import('./app/admin/pages/usuarios/usuarios.component').then(
                        (m) => m.UsuariosComponent,
                    ),
            },
            {
                path: 'rutas/carga',
                loadComponent: () =>
                    import('./app/admin/pages/rutas/rutas.component').then((m) => m.RutasComponent),
            },
            { path: 'uikit', loadChildren: () => import('./app/pages/uikit/uikit.routes') },
            { path: 'documentation', component: Documentation },
            { path: 'pages', loadChildren: () => import('./app/pages/pages.routes') },
        ],
    },
    { path: 'landing', component: Landing },

    // RUTA EXCLUSIVA PARA EL CHOFER (vista móvil)
    {
        path: 'driver',
        loadComponent: () =>
            import('./app/driver/pages/home-page/home-page').then((m) => m.HomePage),
        canActivate: [roleGuard],
        data: { roles: ['Chofer'] },
    },

    { path: 'notfound', component: Notfound },
    { path: 'auth', loadChildren: () => import('./app/auth/auth.routes') }, // Libre para loguearse
    { path: '**', redirectTo: 'auth' },
];
