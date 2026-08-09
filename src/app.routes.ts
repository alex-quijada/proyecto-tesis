import { Routes } from '@angular/router';
import { AppLayout } from './app/layout/component/app.layout';
import { Landing } from './app/pages/landing/landing';
import { Notfound } from './app/pages/notfound/notfound';
import { roleGuard } from './app/auth/guards/role.guard';

export const appRoutes: Routes = [
    {
        path: '',
        loadComponent: () =>
            import('./app/auth/pages/login-page/login-page').then((m) => m.LoginPage),
    },
    {
        path: 'app',
        component: AppLayout,
        canActivate: [roleGuard], // Protégé todo el Layout administrativo
        data: { roles: ['Analista', 'Coordinador', 'Administrador'] }, // Solo personal interno
        children: [
            {
                path: '',
                loadChildren: () => import('./app/admin/admin.routes'),
            },
            { path: 'uikit', loadChildren: () => import('./app/pages/uikit/uikit.routes') },
            { path: 'pages', loadChildren: () => import('./app/pages/pages.routes') },
        ],
    },
    { path: 'landing', component: Landing },

    // RUTA EXCLUSIVA PARA EL CHOFER (vista móvil)
    {
        path: 'driver',
        loadChildren: () => import('./app/driver/driver.routes'),
        canActivate: [roleGuard],
        data: { roles: ['Chofer'] },
    },

    { path: 'auth/login', redirectTo: '', pathMatch: 'full' },
    { path: 'notfound', component: Notfound },
    { path: 'auth', loadChildren: () => import('./app/auth/auth.routes') }, // Libre para loguearse
    { path: '**', redirectTo: '' },
];
