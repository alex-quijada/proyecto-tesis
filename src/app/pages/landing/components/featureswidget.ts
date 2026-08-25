import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'features-widget',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div id="features" class="py-12 px-6 lg:px-20 mx-0 lg:mx-20">
            <div class="grid grid-cols-12 gap-6 justify-center">
                <div class="col-span-12 text-center mt-10 mb-8">
                    <span
                        class="text-primary font-semibold text-sm tracking-wider uppercase bg-primary/10 px-3 py-1 rounded-full"
                        >Arquitectura Funcional</span
                    >
                    <div
                        class="text-surface-900 dark:text-surface-0 font-bold mt-3 mb-2 text-3xl sm:text-4xl"
                    >
                        Módulos Clave del Sistema
                    </div>
                    <span class="text-muted-color text-lg sm:text-xl max-w-2xl mx-auto block"
                        >Herramientas diseñadas para resolver la logística de última milla de extremo a
                        extremo.</span
                    >
                </div>

                <!-- Módulo 1: Asignación y Carga de Guías -->
                <div class="col-span-12 md:col-span-6 lg:col-span-4 p-2">
                    <div
                        class="p-6 bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 h-full rounded-2xl shadow-xs hover:border-primary/50 transition-all"
                    >
                        <div
                            class="flex items-center justify-center bg-blue-100 dark:bg-blue-950/50 mb-4 w-14 h-14 rounded-2xl text-blue-600 dark:text-blue-400"
                        >
                            <i class="pi pi-box text-2xl!"></i>
                        </div>
                        <h4 class="text-xl font-bold text-surface-900 dark:text-surface-0 mb-2">
                            Asignación y Extracción PDF
                        </h4>
                        <p class="text-surface-600 dark:text-surface-300 leading-relaxed text-sm">
                            Procesamiento automatizado de facturas y guías desde PDFs de distribuidores,
                            vinculando clientes, montos y límites de carga.
                        </p>
                    </div>
                </div>

                <!-- Módulo 2: Optimización de Rutas -->
                <div class="col-span-12 md:col-span-6 lg:col-span-4 p-2">
                    <div
                        class="p-6 bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 h-full rounded-2xl shadow-xs hover:border-primary/50 transition-all"
                    >
                        <div
                            class="flex items-center justify-center bg-purple-100 dark:bg-purple-950/50 mb-4 w-14 h-14 rounded-2xl text-purple-600 dark:text-purple-400"
                        >
                            <i class="pi pi-directions text-2xl!"></i>
                        </div>
                        <h4 class="text-xl font-bold text-surface-900 dark:text-surface-0 mb-2">
                            Optimización Geoespacial
                        </h4>
                        <p class="text-surface-600 dark:text-surface-300 leading-relaxed text-sm">
                            Secuenciación de visitas con Google Maps, agrupando entregas por municipio y
                            respetando ventanas de recepción horaria.
                        </p>
                    </div>
                </div>

                <!-- Módulo 3: App Chofer -->
                <div class="col-span-12 md:col-span-6 lg:col-span-4 p-2">
                    <div
                        class="p-6 bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 h-full rounded-2xl shadow-xs hover:border-primary/50 transition-all"
                    >
                        <div
                            class="flex items-center justify-center bg-emerald-100 dark:bg-emerald-950/50 mb-4 w-14 h-14 rounded-2xl text-emerald-600 dark:text-emerald-400"
                        >
                            <i class="pi pi-mobile text-2xl!"></i>
                        </div>
                        <h4 class="text-xl font-bold text-surface-900 dark:text-surface-0 mb-2">
                            App Móvil del Chofer
                        </h4>
                        <p class="text-surface-600 dark:text-surface-300 leading-relaxed text-sm">
                            Vista táctil adaptada para Android con navegación paso a paso, reporte fotográfico
                            de incidencias y soporte sin conexión.
                        </p>
                    </div>
                </div>

                <!-- Módulo 4: Monitoreo en Vivo -->
                <div class="col-span-12 md:col-span-6 lg:col-span-4 p-2">
                    <div
                        class="p-6 bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 h-full rounded-2xl shadow-xs hover:border-primary/50 transition-all"
                    >
                        <div
                            class="flex items-center justify-center bg-amber-100 dark:bg-amber-950/50 mb-4 w-14 h-14 rounded-2xl text-amber-600 dark:text-amber-400"
                        >
                            <i class="pi pi-map-marker text-2xl!"></i>
                        </div>
                        <h4 class="text-xl font-bold text-surface-900 dark:text-surface-0 mb-2">
                            Monitoreo en Tiempo Real
                        </h4>
                        <p class="text-surface-600 dark:text-surface-300 leading-relaxed text-sm">
                            Seguimiento GPS de la flota en mapa interactivo con Supabase Realtime, telemetría
                            de velocidad y estado de cada viaje activo.
                        </p>
                    </div>
                </div>

                <!-- Módulo 5: Mantenimiento Preventivo -->
                <div class="col-span-12 md:col-span-6 lg:col-span-4 p-2">
                    <div
                        class="p-6 bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 h-full rounded-2xl shadow-xs hover:border-primary/50 transition-all"
                    >
                        <div
                            class="flex items-center justify-center bg-cyan-100 dark:bg-cyan-950/50 mb-4 w-14 h-14 rounded-2xl text-cyan-600 dark:text-cyan-400"
                        >
                            <i class="pi pi-wrench text-2xl!"></i>
                        </div>
                        <h4 class="text-xl font-bold text-surface-900 dark:text-surface-0 mb-2">
                            Mantenimiento de Flota
                        </h4>
                        <p class="text-surface-600 dark:text-surface-300 leading-relaxed text-sm">
                            Control preventivo y correctivo de unidades, seguimiento de kilometraje, costos de
                            taller y disponibilidad de vehículos.
                        </p>
                    </div>
                </div>

                <!-- Módulo 6: Control de Combustible -->
                <div class="col-span-12 md:col-span-6 lg:col-span-4 p-2">
                    <div
                        class="p-6 bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 h-full rounded-2xl shadow-xs hover:border-primary/50 transition-all"
                    >
                        <div
                            class="flex items-center justify-center bg-rose-100 dark:bg-rose-950/50 mb-4 w-14 h-14 rounded-2xl text-rose-600 dark:text-rose-400"
                        >
                            <i class="pi pi-percentage text-2xl!"></i>
                        </div>
                        <h4 class="text-xl font-bold text-surface-900 dark:text-surface-0 mb-2">
                            Control de Combustible
                        </h4>
                        <p class="text-surface-600 dark:text-surface-300 leading-relaxed text-sm">
                            Registro de cargas por método visual de tanque u odómetro, costos en USD/VES y
                            cálculo de eficiencia de consumo por ruta.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `,
})
export class FeaturesWidget {}
