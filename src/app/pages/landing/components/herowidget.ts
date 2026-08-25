import { Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { RippleModule } from 'primeng/ripple';
import { RouterModule } from '@angular/router';

@Component({
    selector: 'hero-widget',
    standalone: true,
    imports: [ButtonModule, RippleModule, RouterModule],
    template: `
        <div
            id="hero"
            class="flex flex-col pt-8 px-6 lg:px-20 overflow-hidden bg-gradient-to-b from-primary/10 via-surface-0 to-surface-0 dark:from-primary-950/30 dark:via-surface-900 dark:to-surface-900"
        >
            <div class="mx-auto max-w-5xl text-center mt-6 md:mt-12">
                <!-- Badge de Versión / Proyecto -->
                <div
                    class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-semibold mb-6 shadow-xs"
                >
                    <span class="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                    <span>BrandIA v1.0 • Optimización Logística y Despacho</span>
                </div>

                <h1
                    class="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-surface-900 dark:text-surface-0 leading-tight tracking-tight"
                >
                    Distribución Inteligente y Secuenciación de Rutas en
                    <span class="text-primary block mt-2">Nueva Esparta</span>
                </h1>

                <p
                    class="font-normal text-lg sm:text-xl md:text-2xl leading-relaxed mt-6 text-surface-600 dark:text-surface-300 max-w-3xl mx-auto"
                >
                    Plataforma web y móvil para la planificación de carga, cálculo de rutas óptimas con
                    Google Maps, seguimiento en tiempo real y gestión integral de flota vehicular.
                </p>

                <!-- Botones CTA -->
                <div class="flex flex-wrap items-center justify-center gap-4 mt-8">
                    <p-button
                        label="Ingresar al Panel"
                        icon="pi pi-arrow-right"
                        iconPos="right"
                        routerLink="/"
                        [rounded]="true"
                        size="large"
                        severity="primary"
                    />
                    <p-button
                        label="Ver Módulos del Sistema"
                        icon="pi pi-compass"
                        (onClick)="scrollAModulos()"
                        [rounded]="true"
                        [outlined]="true"
                        size="large"
                        severity="secondary"
                    />
                </div>

                <!-- Tarjetas de Métricas Rápidas -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-14 max-w-4xl mx-auto">
                    <div
                        class="p-4 rounded-2xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 shadow-xs"
                    >
                        <div class="text-3xl font-extrabold text-primary">11</div>
                        <div class="text-xs sm:text-sm text-muted-color mt-1 font-medium">
                            Municipios Cubiertos
                        </div>
                    </div>
                    <div
                        class="p-4 rounded-2xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 shadow-xs"
                    >
                        <div class="text-3xl font-extrabold text-emerald-500">100%</div>
                        <div class="text-xs sm:text-sm text-muted-color mt-1 font-medium">
                            Trazabilidad de Entregas
                        </div>
                    </div>
                    <div
                        class="p-4 rounded-2xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 shadow-xs"
                    >
                        <div class="text-3xl font-extrabold text-blue-500">GPS</div>
                        <div class="text-xs sm:text-sm text-muted-color mt-1 font-medium">
                            Monitoreo en Tiempo Real
                        </div>
                    </div>
                    <div
                        class="p-4 rounded-2xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 shadow-xs"
                    >
                        <div class="text-3xl font-extrabold text-amber-500">PDF</div>
                        <div class="text-xs sm:text-sm text-muted-color mt-1 font-medium">
                            Extracción Automatizada
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `,
})
export class HeroWidget {
    scrollAModulos() {
        document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
    }
}
