import { Routes } from '@angular/router';
import { roleGuard } from './app/auth/guards/role.guard';
import { publicGuard } from './app/auth/guards/auth.guard';

export const appRoutes: Routes = [
    {
        path: '',
        canActivate: [publicGuard],
        loadComponent: () =>
            import('./app/auth/pages/login-page/login-page').then((m) => m.LoginPage),
    },
    {
        path: 'app',
        loadComponent: () => import('./app/layout/component/app.layout').then((m) => m.AppLayout),
        canActivate: [roleGuard], // Protege todo el Layout administrativo
        data: { roles: ['Analista', 'Coordinador', 'Administrador'] }, // Solo personal interno
        children: [
            {
                path: '',
                loadChildren: () => import('./app/admin/admin.routes'),
            },
        ],
    },
    {
        path: 'landing',
        loadComponent: () => import('./app/pages/landing/landing').then((m) => m.Landing),
    },

    // RUTA EXCLUSIVA PARA EL CHOFER (vista móvil)
    {
        path: 'driver',
        loadChildren: () => import('./app/driver/driver.routes'),
        canActivate: [roleGuard],
        data: { roles: ['Chofer'] },
    },

    { path: 'auth/login', redirectTo: '', pathMatch: 'full' },
    {
        path: 'notfound',
        loadComponent: () => import('./app/pages/notfound/notfound').then((m) => m.Notfound),
    },
    { path: 'auth', loadChildren: () => import('./app/auth/auth.routes') }, // Libre para loguearse
    { path: '**', redirectTo: '' },
];
