import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { AppMenuitem } from './app.menuitem';

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
    model: MenuItem[] = [];

    ngOnInit() {
        this.model = [
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
                                label: 'Optimización de Rutas',
                                icon: 'pi pi-fw pi-directions',
                                routerLink: ['/app/rutas/optimizacion'],
                            },
                            {
                                label: 'Monitoreo en Tiempo Real',
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
                                icon: 'pi pi-fw pi-file',
                                routerLink: ['/app/informes/eficiencia'],
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
            {
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
            },
            /*
            // CÓDIGO ORIGINAL DE LA PLANTILLA SAKAI (COMENTADO)
            {
                label: 'Home',
                items: [{ label: 'Inico', icon: 'pi pi-fw pi-home', routerLink: ['/'] }]
            },
            {
                label: 'UI Components',
                items: [
                    { label: 'Form Layout', icon: 'pi pi-fw pi-id-card', routerLink: ['/uikit/formlayout'] },
                    { label: 'Input', icon: 'pi pi-fw pi-check-square', routerLink: ['/uikit/input'] },
                    { label: 'Button', icon: 'pi pi-fw pi-mobile', class: 'rotated-icon', routerLink: ['/uikit/button'] },
                    { label: 'Table', icon: 'pi pi-fw pi-table', routerLink: ['/uikit/table'] },
                    { label: 'List', icon: 'pi pi-fw pi-list', routerLink: ['/uikit/list'] },
                    { label: 'Tree', icon: 'pi pi-fw pi-share-alt', routerLink: ['/uikit/tree'] },
                    { label: 'Panel', icon: 'pi pi-fw pi-tablet', routerLink: ['/uikit/panel'] },
                    { label: 'Overlay', icon: 'pi pi-fw pi-clone', routerLink: ['/uikit/overlay'] },
                    { label: 'Media', icon: 'pi pi-fw pi-image', routerLink: ['/uikit/media'] },
                    { label: 'Menu', icon: 'pi pi-fw pi-bars', routerLink: ['/uikit/menu'] },
                    { label: 'Message', icon: 'pi pi-fw pi-comment', routerLink: ['/uikit/message'] },
                    { label: 'File', icon: 'pi pi-fw pi-file', routerLink: ['/uikit/file'] },
                    { label: 'Chart', icon: 'pi pi-fw pi-chart-bar', routerLink: ['/uikit/charts'] },
                    { label: 'Timeline', icon: 'pi pi-fw pi-calendar', routerLink: ['/uikit/timeline'] },
                    { label: 'Misc', icon: 'pi pi-fw pi-circle', routerLink: ['/uikit/misc'] }
                ]
            },
            {
                label: 'Pages',
                icon: 'pi pi-fw pi-briefcase',
                path: '/pages',
                items: [
                    { label: 'Landing', icon: 'pi pi-fw pi-globe', routerLink: ['/landing'] },
                    {
                        label: 'Auth',
                        icon: 'pi pi-fw pi-user',
                        path: '/auth',
                        items: [
                            { label: 'Login', icon: 'pi pi-fw pi-sign-in', routerLink: ['/auth/login'] },
                            { label: 'Error', icon: 'pi pi-fw pi-times-circle', routerLink: ['/auth/error'] },
                            { label: 'Access Denied', icon: 'pi pi-fw pi-lock', routerLink: ['/auth/access'] }
                        ]
                    },
                    { label: 'Crud', icon: 'pi pi-fw pi-pencil', routerLink: ['/pages/crud'] },
                    { label: 'Not Found', icon: 'pi pi-fw pi-exclamation-circle', routerLink: ['/pages/notfound'] },
                    { label: 'Empty', icon: 'pi pi-fw pi-circle-off', routerLink: ['/pages/empty'] }
                ]
            },
            {
                label: 'Hierarchy',
                path: '/hierarchy',
                items: [
                    {
                        label: 'Submenu 1',
                        icon: 'pi pi-fw pi-bookmark',
                        path: '/hierarchy/submenu_1',
                        items: [
                            {
                                label: 'Submenu 1.1',
                                icon: 'pi pi-fw pi-bookmark',
                                path: '/hierarchy/submenu_1/submenu_1_1',
                                items: [
                                    { label: 'Submenu 1.1.1', icon: 'pi pi-fw pi-bookmark' },
                                    { label: 'Submenu 1.1.2', icon: 'pi pi-fw pi-bookmark' },
                                    { label: 'Submenu 1.1.3', icon: 'pi pi-fw pi-bookmark' }
                                ]
                            },
                            {
                                label: 'Submenu 1.2',
                                icon: 'pi pi-fw pi-bookmark',
                                path: '/hierarchy/submenu_1/submenu_1_2',
                                items: [{ label: 'Submenu 1.2.1', icon: 'pi pi-fw pi-bookmark' }]
                            }
                        ]
                    },
                    {
                        label: 'Submenu 2',
                        icon: 'pi pi-fw pi-bookmark',
                        path: '/hierarchy/submenu_2',
                        items: [
                            {
                                label: 'Submenu 2.1',
                                icon: 'pi pi-fw pi-bookmark',
                                path: '/hierarchy/submenu_2/submenu_2_1',
                                items: [
                                    { label: 'Submenu 2.1.1', icon: 'pi pi-fw pi-bookmark' },
                                    { label: 'Submenu 2.1.2', icon: 'pi pi-fw pi-bookmark' }
                                ]
                            },
                            {
                                label: 'Submenu 2.2',
                                icon: 'pi pi-fw pi-bookmark',
                                path: '/hierarchy/submenu_2/submenu_2_2',
                                items: [{ label: 'Submenu 2.2.1', icon: 'pi pi-fw pi-bookmark' }]
                            }
                        ]
                    }
                ]
            }
            */
        ];
    }
}
