import { Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { RippleModule } from 'primeng/ripple';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
    selector: 'pricing-widget',
    standalone: true,
    imports: [CommonModule, ButtonModule, RippleModule, RouterModule],
    template: `
        <div id="impacto" class="py-12 px-6 lg:px-20 my-8 mx-0 lg:mx-20">
            <div class="text-center mb-12">
                <span
                    class="text-primary font-semibold text-sm tracking-wider uppercase bg-primary/10 px-3 py-1 rounded-full"
                    >Impacto y Beneficios</span
                >
                <div
                    class="text-surface-900 dark:text-surface-0 font-bold mt-3 mb-2 text-3xl sm:text-4xl"
                >
                    Eficiencia Comprobada en Campo
                </div>
                <span class="text-muted-color text-lg sm:text-xl max-w-2xl mx-auto block"
                    >Resultados del modelo de secuenciación y optimización logística.</span
                >
            </div>

            <div class="grid grid-cols-12 gap-6 justify-between">
                <!-- Tarjeta 1: Ahorro de Tiempo -->
                <div class="col-span-12 lg:col-span-4 p-2">
                    <div
                        class="p-6 flex flex-col bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-3xl h-full shadow-xs hover:border-primary/50 transition-all"
                    >
                        <div class="flex items-center justify-between mb-4">
                            <span class="text-sm font-bold uppercase text-primary tracking-wider"
                                >Rutas Óptimas</span
                            >
                            <i class="pi pi-bolt text-xl text-primary"></i>
                        </div>
                        <div class="text-3xl font-extrabold text-surface-900 dark:text-surface-0 mb-1">
                            -35% Tiempo
                        </div>
                        <p class="text-muted-color text-sm mb-6">
                            Reducción promedio en los tiempos de recorrido mediante secuenciación de
                            paradas inteligentes.
                        </p>
                        <ul class="space-y-3 text-sm text-surface-700 dark:text-surface-300 mt-auto">
                            <li class="flex items-center gap-2">
                                <i class="pi pi-check text-primary text-xs"></i>
                                <span>Menor congestión en horas pico</span>
                            </li>
                            <li class="flex items-center gap-2">
                                <i class="pi pi-check text-primary text-xs"></i>
                                <span>Cálculo de distancias euclidianas y viales</span>
                            </li>
                            <li class="flex items-center gap-2">
                                <i class="pi pi-check text-primary text-xs"></i>
                                <span>Cumplimiento estricto de horarios de clientes</span>
                            </li>
                        </ul>
                    </div>
                </div>

                <!-- Tarjeta 2: Reducción de Costos y Combustible -->
                <div class="col-span-12 lg:col-span-4 p-2">
                    <div
                        class="p-6 flex flex-col bg-surface-0 dark:bg-surface-800 border-2 border-primary rounded-3xl h-full shadow-md relative"
                    >
                        <div
                            class="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary text-surface-0 text-xs uppercase font-bold py-1 px-3 rounded-full"
                        >
                            Pilar Clave
                        </div>
                        <div class="flex items-center justify-between mb-4 mt-2">
                            <span class="text-sm font-bold uppercase text-primary tracking-wider"
                                >Control Financiero</span
                            >
                            <i class="pi pi-percentage text-xl text-primary"></i>
                        </div>
                        <div class="text-3xl font-extrabold text-surface-900 dark:text-surface-0 mb-1">
                            Auditoría Total
                        </div>
                        <p class="text-muted-color text-sm mb-6">
                            Control milimétrico del gasto de combustible y detección de discrepancias por
                            odómetro y tanque.
                        </p>
                        <ul class="space-y-3 text-sm text-surface-700 dark:text-surface-300 mt-auto">
                            <li class="flex items-center gap-2">
                                <i class="pi pi-check text-primary text-xs"></i>
                                <span>Costos consolidados en USD y VES</span>
                            </li>
                            <li class="flex items-center gap-2">
                                <i class="pi pi-check text-primary text-xs"></i>
                                <span>Reportes ejecutivos descargables en PDF/Excel</span>
                            </li>
                            <li class="flex items-center gap-2">
                                <i class="pi pi-check text-primary text-xs"></i>
                                <span>Historial de facturación asociado por chofer</span>
                            </li>
                        </ul>
                    </div>
                </div>

                <!-- Tarjeta 3: Resiliencia y Conectividad -->
                <div class="col-span-12 lg:col-span-4 p-2">
                    <div
                        class="p-6 flex flex-col bg-surface-0 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-3xl h-full shadow-xs hover:border-primary/50 transition-all"
                    >
                        <div class="flex items-center justify-between mb-4">
                            <span class="text-sm font-bold uppercase text-primary tracking-wider"
                                >Disponibilidad</span
                            >
                            <i class="pi pi-shield text-xl text-primary"></i>
                        </div>
                        <div class="text-3xl font-extrabold text-surface-900 dark:text-surface-0 mb-1">
                            Offline-First
                        </div>
                        <p class="text-muted-color text-sm mb-6">
                            Garantía operativa en zonas con baja señal o cortes temporales de conectividad.
                        </p>
                        <ul class="space-y-3 text-sm text-surface-700 dark:text-surface-300 mt-auto">
                            <li class="flex items-center gap-2">
                                <i class="pi pi-check text-primary text-xs"></i>
                                <span>Almacenamiento local cifrado en el dispositivo</span>
                            </li>
                            <li class="flex items-center gap-2">
                                <i class="pi pi-check text-primary text-xs"></i>
                                <span>Cola de reintentos automática al recuperar red</span>
                            </li>
                            <li class="flex items-center gap-2">
                                <i class="pi pi-check text-primary text-xs"></i>
                                <span>Alertas visuales de sincronización para el chofer</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `,
})
export class PricingWidget {}
