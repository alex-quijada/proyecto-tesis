import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'highlights-widget',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div id="highlights" class="py-12 px-6 lg:px-20 mx-0 my-8 lg:mx-20">
            <div class="text-center mb-16">
                <span
                    class="text-primary font-semibold text-sm tracking-wider uppercase bg-primary/10 px-3 py-1 rounded-full"
                    >Ecosistema Multiplataforma</span
                >
                <div
                    class="text-surface-900 dark:text-surface-0 font-bold mt-3 mb-2 text-3xl sm:text-4xl"
                >
                    Diseñado para Oficina y Carretera
                </div>
                <span class="text-muted-color text-lg sm:text-xl max-w-2xl mx-auto block"
                    >Integración en tiempo real entre la central de operaciones y los choferes en ruta.</span
                >
            </div>

            <!-- Destacado 1: App Móvil del Chofer -->
            <div class="grid grid-cols-12 gap-8 items-center pb-12 md:pb-20">
                <div class="col-span-12 lg:col-span-6 p-0 order-2 lg:order-1">
                    <div
                        class="p-8 rounded-3xl bg-gradient-to-br from-primary/10 to-surface-100 dark:to-surface-800 border border-primary/20"
                    >
                        <div
                            class="flex items-center justify-center bg-primary text-surface-0 w-16 h-16 rounded-2xl mb-6 shadow-md"
                        >
                            <i class="pi pi-mobile text-3xl!"></i>
                        </div>
                        <h3 class="text-2xl sm:text-3xl font-bold text-surface-900 dark:text-surface-0 mb-4">
                            Aplicación Móvil para el Conductor
                        </h3>
                        <p class="text-surface-600 dark:text-surface-300 text-base sm:text-lg leading-relaxed mb-6">
                            Permite al chofer visualizar su itinerario optimizado, consultar detalles de cada factura,
                            activar navegación paso a paso con Google Maps, registrar firmas o evidencias de entrega y
                            reportar incidencias de forma inmediata.
                        </p>
                        <ul class="space-y-3 text-surface-700 dark:text-surface-200">
                            <li class="flex items-center gap-3">
                                <i class="pi pi-check-circle text-emerald-500 text-lg"></i>
                                <span>Operación resiliente ante caídas de señal móvil (Offline-First)</span>
                            </li>
                            <li class="flex items-center gap-3">
                                <i class="pi pi-check-circle text-emerald-500 text-lg"></i>
                                <span>Transmisión periódica de posición GPS en tiempo real</span>
                            </li>
                            <li class="flex items-center gap-3">
                                <i class="pi pi-check-circle text-emerald-500 text-lg"></i>
                                <span>Captura fotográfica de comprobantes e incidencias</span>
                            </li>
                        </ul>
                    </div>
                </div>

                <div class="col-span-12 lg:col-span-6 order-1 lg:order-2">
                    <div
                        class="p-6 rounded-3xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 shadow-lg"
                    >
                        <div class="flex items-center justify-between pb-4 border-b border-surface-200 dark:border-surface-700">
                            <div class="flex items-center gap-3">
                                <i class="pi pi-map text-primary text-xl"></i>
                                <span class="font-bold text-surface-900 dark:text-surface-0">Ruta Asignada — Maneiro / Mariño</span>
                            </div>
                            <span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">En Ruta</span>
                        </div>
                        <div class="py-4 space-y-3">
                            <div class="flex items-center justify-between p-3 rounded-xl bg-surface-50 dark:bg-surface-900 border border-surface-100 dark:border-surface-800">
                                <div class="flex items-center gap-3">
                                    <span class="w-7 h-7 rounded-full bg-primary text-surface-0 flex items-center justify-center text-xs font-bold">1</span>
                                    <div>
                                        <div class="font-semibold text-sm text-surface-900 dark:text-surface-0">Distribuidora Los Andes C.A.</div>
                                        <div class="text-xs text-muted-color">Av. 4 de Mayo, Porlamar • $1,250.00</div>
                                    </div>
                                </div>
                                <span class="text-xs font-medium text-emerald-600 dark:text-emerald-400">Entregado</span>
                            </div>
                            <div class="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20">
                                <div class="flex items-center gap-3">
                                    <span class="w-7 h-7 rounded-full bg-primary text-surface-0 flex items-center justify-center text-xs font-bold">2</span>
                                    <div>
                                        <div class="font-semibold text-sm text-surface-900 dark:text-surface-0">Comercial El Ávila S.R.L.</div>
                                        <div class="text-xs text-muted-color">Calle San Rafael, Pampatar • $2,340.00</div>
                                    </div>
                                </div>
                                <span class="text-xs font-medium text-primary">Siguiente parada</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Destacado 2: Panel Web de Control -->
            <div class="grid grid-cols-12 gap-8 items-center pt-8">
                <div class="col-span-12 lg:col-span-6">
                    <div
                        class="p-6 rounded-3xl bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 shadow-lg"
                    >
                        <div class="grid grid-cols-2 gap-4 mb-4">
                            <div class="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900">
                                <div class="text-xs text-muted-color font-semibold uppercase">Guías en Curso</div>
                                <div class="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">14 Guías</div>
                            </div>
                            <div class="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900">
                                <div class="text-xs text-muted-color font-semibold uppercase">Choferes en Línea</div>
                                <div class="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">8 Activos</div>
                            </div>
                        </div>
                        <div class="p-4 rounded-2xl bg-surface-50 dark:bg-surface-900 border border-surface-100 dark:border-surface-800">
                            <div class="flex items-center justify-between text-sm mb-2">
                                <span class="font-medium text-surface-900 dark:text-surface-0">Progreso Global de Despacho</span>
                                <span class="font-bold text-primary">82%</span>
                            </div>
                            <div class="w-full bg-surface-200 dark:bg-surface-700 h-2.5 rounded-full overflow-hidden">
                                <div class="bg-primary h-full rounded-full" style="width: 82%"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="col-span-12 lg:col-span-6">
                    <div
                        class="p-8 rounded-3xl bg-gradient-to-br from-surface-100 to-primary/10 dark:from-surface-800 dark:to-primary-950/30 border border-surface-200 dark:border-surface-700"
                    >
                        <div
                            class="flex items-center justify-center bg-surface-900 dark:bg-surface-0 text-surface-0 dark:text-surface-900 w-16 h-16 rounded-2xl mb-6 shadow-md"
                        >
                            <i class="pi pi-desktop text-3xl!"></i>
                        </div>
                        <h3 class="text-2xl sm:text-3xl font-bold text-surface-900 dark:text-surface-0 mb-4">
                            Centro de Mando Administrativo
                        </h3>
                        <p class="text-surface-600 dark:text-surface-300 text-base sm:text-lg leading-relaxed mb-6">
                            Consola centralizada para analistas y coordinadores. Permite planificar cronogramas
                            semanales por municipio, auditar facturación, controlar inventario de flota y exportar
                            informes de rendimiento en Excel y PDF.
                        </p>
                        <ul class="space-y-3 text-surface-700 dark:text-surface-200">
                            <li class="flex items-center gap-3">
                                <i class="pi pi-check-circle text-primary text-lg"></i>
                                <span>Control granular de permisos por roles (Admin, Analista, Coordinador)</span>
                            </li>
                            <li class="flex items-center gap-3">
                                <i class="pi pi-check-circle text-primary text-lg"></i>
                                <span>Generación de informes de gastos de combustible y mantenimiento</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `,
})
export class HighlightsWidget {}
