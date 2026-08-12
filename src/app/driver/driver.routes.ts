import { Routes } from '@angular/router';
import { DriverLayout } from './layout/driver-layout';

export default [
    {
        path: '',
        component: DriverLayout,
        children: [
            {
                path: '',
                pathMatch: 'full',
                redirectTo: 'home',
            },
            {
                path: 'home',
                data: { animation: 'home' },
                loadComponent: () =>
                    import('./pages/home/home.component').then((m) => m.HomeComponent),
            },
            {
                path: 'guia/:id',
                data: { animation: 'guia' },
                loadComponent: () =>
                    import('./pages/guia-detalle/guia-detalle.component').then(
                        (m) => m.GuiaDetalleComponent,
                    ),
            },
            {
                path: 'ruta',
                data: { animation: 'ruta' },
                loadComponent: () =>
                    import('./pages/ruta/ruta.component').then((m) => m.RutaComponent),
            },
            {
                path: 'mapa',
                data: { animation: 'mapa' },
                loadComponent: () =>
                    import('./pages/viajes/mi-ruta.component').then((m) => m.MiRutaComponent),
            },
            {
                path: 'historial',
                data: { animation: 'historial' },
                loadComponent: () =>
                    import('./pages/historial/historial.component').then(
                        (m) => m.HistorialComponent,
                    ),
            },
            {
                path: 'perfil',
                data: { animation: 'perfil' },
                loadComponent: () =>
                    import('./pages/perfil/perfil.component').then((m) => m.PerfilComponent),
            },
        ],
    },
] as Routes;
