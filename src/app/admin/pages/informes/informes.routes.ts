import { Routes } from '@angular/router';

export default [
    {
        path: '',
        loadComponent: () => import('./informes-hub.component').then((m) => m.InformesHubComponent),
    },
    {
        path: 'eficiencia',
        loadComponent: () =>
            import('./eficiencia/eficiencia.component').then((m) => m.EficienciaComponent),
    },
    {
        path: 'operaciones',
        loadComponent: () =>
            import('./operaciones/operaciones.component').then((m) => m.OperacionesComponent),
    },
    {
        path: 'incidencias',
        loadComponent: () =>
            import('./incidencias/incidencias.component').then((m) => m.IncidenciasComponent),
    },
    {
        path: 'gastos',
        loadComponent: () => import('./gastos/gastos.component').then((m) => m.GastosComponent),
    },
] as Routes;
