import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'footer-widget',
    standalone: true,
    imports: [CommonModule, RouterModule],
    template: `
        <div
            class="py-12 px-6 lg:px-20 mx-0 mt-16 border-t border-surface-200 dark:border-surface-800"
        >
            <div class="grid grid-cols-12 gap-8 items-start">
                <div class="col-span-12 md:col-span-4">
                    <a class="flex items-center gap-3 mb-4 cursor-pointer" routerLink="/">
                        <div
                            class="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-surface-0 shadow-md"
                        >
                            <i class="pi pi-truck text-xl"></i>
                        </div>
                        <span
                            class="text-surface-900 dark:text-surface-0 font-bold text-2xl tracking-tight"
                            >BrandIA®</span
                        >
                    </a>
                    <p
                        class="text-surface-600 dark:text-surface-400 text-sm leading-relaxed max-w-sm"
                    >
                        Sistema integral para la planificación de carga, secuenciación geoespacial
                        de entregas y monitoreo de flota en el Estado Nueva Esparta, Venezuela.
                    </p>
                    <div class="text-xs text-muted-color mt-4 font-medium">
                        Proyecto de Grado • Ingeniería de Sistemas
                    </div>
                </div>

                <div class="col-span-12 md:col-span-8">
                    <div class="grid grid-cols-12 gap-6">
                        <div class="col-span-6 sm:col-span-4">
                            <h5
                                class="font-bold text-base mb-4 text-surface-900 dark:text-surface-0"
                            >
                                Módulos Principales
                            </h5>
                            <ul
                                class="space-y-2 text-sm text-surface-600 dark:text-surface-400 list-none p-0 m-0"
                            >
                                <li>
                                    <a
                                        routerLink="/"
                                        class="hover:text-primary transition-colors cursor-pointer"
                                        >Gestión de Rutas</a
                                    >
                                </li>
                                <li>
                                    <a
                                        routerLink="/"
                                        class="hover:text-primary transition-colors cursor-pointer"
                                        >Monitoreo GPS</a
                                    >
                                </li>
                                <li>
                                    <a
                                        routerLink="/"
                                        class="hover:text-primary transition-colors cursor-pointer"
                                        >Control de Flota</a
                                    >
                                </li>
                                <li>
                                    <a
                                        routerLink="/"
                                        class="hover:text-primary transition-colors cursor-pointer"
                                        >Combustible y Taller</a
                                    >
                                </li>
                            </ul>
                        </div>

                        <div class="col-span-6 sm:col-span-4">
                            <h5
                                class="font-bold text-base mb-4 text-surface-900 dark:text-surface-0"
                            >
                                Cobertura Regional
                            </h5>
                            <ul
                                class="space-y-2 text-sm text-surface-600 dark:text-surface-400 list-none p-0 m-0"
                            >
                                <li><span>Municipio Mariño</span></li>
                                <li><span>Municipio Maneiro</span></li>
                                <li><span>Municipio Arismendi</span></li>
                                <li><span>+ 8 Municipios Insulares</span></li>
                            </ul>
                        </div>

                        <div class="col-span-12 sm:col-span-4">
                            <h5
                                class="font-bold text-base mb-4 text-surface-900 dark:text-surface-0"
                            >
                                Acceso al Sistema
                            </h5>
                            <p class="text-xs text-surface-600 dark:text-surface-400 mb-3">
                                Inicie sesión con sus credenciales institucionales.
                            </p>
                            <a
                                routerLink="/"
                                class="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                            >
                                <span>Iniciar Sesión</span>
                                <i class="pi pi-arrow-right text-xs"></i>
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <div
                class="border-t border-surface-200 dark:border-surface-800 mt-12 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-color"
            >
                <div>© 2026 BrandIA Logística. Todos los derechos reservados.</div>
                <div>Isla de Margarita, Estado Nueva Esparta, Venezuela.</div>
            </div>
        </div>
    `,
})
export class FooterWidget {}
