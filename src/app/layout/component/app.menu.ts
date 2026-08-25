import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { AppMenuitem } from './app.menuitem';
import { AuthService } from '@/app/auth/service/auth.service';

@Component({
    selector: 'app-menu',
    standalone: true,
    imports: [CommonModule, AppMenuitem, RouterModule],
    template: `<ul class="layout-menu">
        @for (item of model; track item.label) {
            @if (!item.separator) {
                <li app-menuitem [item]="item" [root]="true"></li>
            } @else {
                <li class="menu-separator"></li>
            }
        }
    </ul> `,
})
export class AppMenu {
    private authService = inject(AuthService);

    model: MenuItem[] = [];

    ngOnInit() {
        const esAdmin =
            String(this.authService.getUserRole() || '').toLowerCase() === 'administrador';

        const model: MenuItem[] = [
            {
                label: 'Principal',
                path: '/principal',
                items: [{ label: 'Inicio', icon: 'pi pi-fw pi-home', routerLink: ['/app'] }],
            },
            {
                label: 'Operaciones de Logística',
                path: '/operaciones',
                items: [
                    {
                        label: 'Gestión de Rutas',
                        icon: 'pi pi-fw pi-map',
                        path: '/operaciones/rutas',
                        items: [
                            {
                                label: 'Asignación de Carga',
                                icon: 'pi pi-fw pi-box',
                                routerLink: ['/app/rutas/carga'],
                            },
                            {
                                label: 'Despliegue por Municipio',
                                icon: 'pi pi-fw pi-directions',
                                routerLink: ['/app/rutas/optimizacion'],
                            },
                            {
                                label: 'Monitoreo de Rutas',
                                icon: 'pi pi-fw pi-map-marker',
                                routerLink: ['/app/rutas/seguimiento'],
                            },
                        ],
                    },
                    {
                        label: 'Vehículos',
                        icon: 'pi pi-fw pi-truck',
                        path: '/operaciones/vehiculos',
                        items: [
                            {
                                label: 'Listado de Unidades',
                                icon: 'pi pi-fw pi-list',
                                routerLink: ['/app/vehiculos'],
                            },
                            {
                                label: 'Mantenimiento Preventivo',
                                icon: 'pi pi-fw pi-wrench',
                                routerLink: ['/app/vehiculos/mantenimiento'],
                            },
                            {
                                label: 'Control de Combustible',
                                icon: 'pi pi-fw pi-percentage',
                                routerLink: ['/app/vehiculos/combustible'],
                            },
                        ],
                    },
                    {
                        label: 'Choferes',
                        icon: 'pi pi-fw pi-id-card',
                        routerLink: ['/app/choferes'],
                    },
                    { label: 'Clientes', icon: 'pi pi-fw pi-users', routerLink: ['/app/clientes'] },
                ],
            },
            {
                label: 'Seguimiento y Control',
                path: '/seguimiento',
                items: [
                    {
                        label: 'Historial de Entregas',
                        icon: 'pi pi-fw pi-history',
                        routerLink: ['/app/historial'],
                    },
                    {
                        label: 'Informes y Reportes',
                        icon: 'pi pi-fw pi-file-pdf',
                        path: '/informes',
                        items: [
                            {
                                label: 'Reporte de Eficiencia',
                                icon: 'pi pi-fw pi-chart-line',
                                routerLink: ['/app/informes/eficiencia'],
                            },
                            {
                                label: 'Reporte de Operaciones',
                                icon: 'pi pi-fw pi-box',
                                routerLink: ['/app/informes/operaciones'],
                            },
                            {
                                label: 'Reporte de Incidencias',
                                icon: 'pi pi-fw pi-exclamation-triangle',
                                routerLink: ['/app/informes/incidencias'],
                            },
                            {
                                label: 'Reporte de Gastos',
                                icon: 'pi pi-fw pi-money-bill',
                                routerLink: ['/app/informes/gastos'],
                            },
                        ],
                    },
                ],
            },
        ];

        if (esAdmin) {
            model.push({
                label: 'Administración de Acceso',
                icon: 'pi pi-fw pi-lock',
                path: '/admin',
                items: [
                    {
                        label: 'Gestión de Usuarios',
                        icon: 'pi pi-fw pi-user-edit',
                        routerLink: ['/app/usuarios'],
                    },
                ],
            });
        }

        this.model = model;
    }
}
