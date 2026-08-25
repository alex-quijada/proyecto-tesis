import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartModule } from 'primeng/chart';
import { TableModule } from 'primeng/table';
import { SkeletonModule } from 'primeng/skeleton';

import { CabeceraReporteComponent } from '../componentes-compartidos/cabecera-reporte.component';
import { FiltrosReporteComponent } from '../componentes-compartidos/filtros-reporte.component';
import { ReporteService, ResumenGastos } from '../services/reporte.service';
import { FiltrosReporte, OpcionFiltro } from '../utils/reporte.types';
import { exportarExcel } from '../utils/exportar-excel.util';
import { exportarPdf } from '../utils/exportar-pdf.util';

interface KpiCard {
    label: string;
    value: string;
    icon: string;
    color: string;
    detalle: string;
    detalleExtra?: string;
}

@Component({
    selector: 'app-gastos',
    standalone: true,
    imports: [
        CommonModule,
        ChartModule,
        TableModule,
        SkeletonModule,
        CabeceraReporteComponent,
        FiltrosReporteComponent,
    ],
    template: `
        <div class="card">
            <app-cabecera-reporte
                titulo="Reporte de Gastos"
                subtitulo="Combustible y mantenimiento por vehículo"
                [sinDatos]="sinDatos()"
                [recargando]="cargando()"
                [exportandoExcel]="exportandoExcel()"
                [exportandoPdf]="exportandoPdf()"
                (recargar)="cargarReporte()"
                (exportarExcel)="exportarExcel()"
                (exportarPdf)="exportarPdf()"
            />

            <app-filtros-reporte
                [vehiculos]="vehiculos()"
                [(filtros)]="filtros"
                (aplicar)="cargarReporte()"
            />

            @if (cargando()) {
                <div class="flex flex-col gap-4">
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                        @for (_ of [1, 2, 3, 4]; track $index) {
                            <p-skeleton height="90px" borderRadius="12px" />
                        }
                    </div>
                    <p-skeleton height="220px" borderRadius="12px" />
                </div>
            } @else if (datos()) {
                @let d = datos()!;
                <div class="flex flex-col gap-4">
                    <!-- KPIs -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                        @for (k of kpis(); track k.label) {
                            <div
                                class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/40 p-4"
                            >
                                <div class="flex items-center justify-between">
                                    <span
                                        class="text-[11px] uppercase font-semibold text-surface-400"
                                    >
                                        {{ k.label }}
                                    </span>
                                    <i [class]="k.icon" class="text-sm" [ngClass]="k.color"></i>
                                </div>
                                <div
                                    class="text-2xl font-bold text-surface-800 dark:text-surface-100 mt-1"
                                >
                                    {{ k.value }}
                                </div>
                                <div class="text-xs text-surface-500 mt-0.5">{{ k.detalle }}</div>
                                @if (k.detalleExtra) {
                                    <div class="text-xs text-surface-500 mt-0.5">
                                        {{ k.detalleExtra }}
                                    </div>
                                }
                            </div>
                        }
                    </div>

                    <!-- Gráficos -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div
                            class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/40 p-4"
                        >
                            <h2 class="font-semibold text-surface-800 dark:text-surface-100 mb-3">
                                Combustible vs Mantenimiento
                            </h2>
                            @if (distribucionData()) {
                                <p-chart
                                    type="doughnut"
                                    [data]="distribucionData()"
                                    [options]="doughnutOptions"
                                    height="220px"
                                />
                            } @else {
                                <div class="text-sm text-surface-500 py-6 text-center">
                                    Sin gastos en el rango.
                                </div>
                            }
                        </div>

                        <div
                            class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/40 p-4"
                        >
                            <h2 class="font-semibold text-surface-800 dark:text-surface-100 mb-3">
                                Costo por vehículo
                            </h2>
                            @if (vehiculoData()) {
                                <p-chart
                                    type="bar"
                                    [data]="vehiculoData()"
                                    [options]="barOptions"
                                    height="220px"
                                />
                            } @else {
                                <div class="text-sm text-surface-500 py-6 text-center">
                                    Sin gastos en el rango.
                                </div>
                            }
                        </div>
                    </div>

                    <!-- Tabla por vehículo -->
                    <div
                        class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/40 p-4"
                    >
                        <h2 class="font-semibold text-surface-800 dark:text-surface-100 mb-3">
                            Detalle por vehículo
                        </h2>
                        <p-table
                            [value]="d.por_vehiculo"
                            dataKey="id_vehiculo"
                            [rows]="10"
                            [paginator]="d.por_vehiculo.length > 10"
                            [tableStyle]="{ 'min-width': '56rem' }"
                        >
                            <ng-template #header>
                                <tr>
                                    <th>Unidad</th>
                                    <th style="width: 7rem">Cargas</th>
                                    <th style="width: 7rem">Litros</th>
                                    <th style="width: 9rem">Combustible</th>
                                    <th style="width: 9rem">Combust. Bs</th>
                                    <th style="width: 8rem">Mantenim.</th>
                                    <th style="width: 9rem">Mant. Bs</th>
                                    <th style="width: 8rem">Km</th>
                                    <th style="width: 9rem">Total</th>
                                    <th style="width: 9rem">Total Bs</th>
                                    <th style="width: 8rem">Costo/km</th>
                                </tr>
                            </ng-template>
                            <ng-template #body let-v>
                                <tr>
                                    <td>
                                        <div class="flex flex-col">
                                            <span class="font-semibold">{{ v.placa }}</span>
                                            <span class="text-xs text-surface-500">{{
                                                v.vehiculo_desc
                                            }}</span>
                                        </div>
                                    </td>
                                    <td>{{ v.cargas }}</td>
                                    <td class="font-mono text-sm">
                                        {{ v.litros_combustible.toFixed(1) }} L
                                    </td>
                                    <td class="font-mono">
                                        {{
                                            v.costo_combustible
                                                | currency: 'USD' : 'symbol' : '1.2-2'
                                        }}
                                    </td>
                                    <td class="font-mono">
                                        {{ v.costo_combustible_bss.toFixed(2) }} Bs
                                    </td>
                                    <td class="font-mono">
                                        {{
                                            v.costo_mantenimiento
                                                | currency: 'USD' : 'symbol' : '1.2-2'
                                        }}
                                    </td>
                                    <td class="font-mono">
                                        {{ v.costo_mantenimiento_bss.toFixed(2) }} Bs
                                    </td>
                                    <td class="font-mono text-sm">
                                        {{ v.km_recorridos.toFixed(1) }} km
                                    </td>
                                    <td class="font-mono font-semibold">
                                        {{ v.costo_total | currency: 'USD' : 'symbol' : '1.2-2' }}
                                    </td>
                                    <td class="font-mono font-semibold">
                                        {{ v.costo_total_bss.toFixed(2) }} Bs
                                    </td>
                                    <td class="font-mono text-sm">
                                        {{ v.costo_por_km.toFixed(4) }}
                                    </td>
                                </tr>
                            </ng-template>
                            <ng-template #emptymessage>
                                <tr>
                                    <td colspan="11" class="text-center py-6 text-surface-400">
                                        Sin gastos registrados en el rango.
                                    </td>
                                </tr>
                            </ng-template>
                        </p-table>
                    </div>
                </div>
            } @else {
                <div class="text-center py-16 text-muted-color">
                    <i class="pi pi-money-bill text-4xl block mb-3"></i>
                    <span class="text-lg font-semibold">Sin datos para el rango seleccionado</span>
                </div>
            }
        </div>
    `,
})
export class GastosComponent {
    private reporteService = inject(ReporteService);

    cargando = signal(true);
    datos = signal<ResumenGastos | null>(null);
    filtros = signal<FiltrosReporte>({});
    vehiculos = signal<OpcionFiltro[]>([]);
    distribucionData = signal<any>(null);
    vehiculoData = signal<any>(null);
    exportandoExcel = signal(false);
    exportandoPdf = signal(false);

    readonly doughnutOptions = {
        plugins: {
            legend: { position: 'bottom' as const },
        },
        cutout: '60%',
    };

    readonly barOptions = {
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (ctx: any) =>
                        ` ${ctx.parsed.y.toLocaleString('es-VE', { style: 'currency', currency: 'USD' })}`,
                },
            },
        },
        scales: {
            x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { color: '#94a3b8' } },
        },
    };

    constructor() {
        void this.inicializar();
    }

    private async inicializar() {
        try {
            this.vehiculos.set(await this.reporteService.obtenerVehiculos());
        } catch {
            /* filtros opcionales */
        }
        await this.cargarReporte();
    }

    get sinDatos() {
        return () => !this.datos();
    }

    get kpis() {
        return () => {
            const d = this.datos();
            if (!d) return [];
            const t = d.totales;
            return [
                {
                    label: 'Costo total',
                    value: t.costo_total.toLocaleString('es-VE', {
                        style: 'currency',
                        currency: 'USD',
                        maximumFractionDigits: 0,
                    }),
                    icon: 'pi pi-wallet',
                    color: 'text-green-500',
                    detalle: 'combustible + mantenimiento',
                    detalleExtra: `Bs ${t.costo_total_bss.toLocaleString('es-VE', {
                        maximumFractionDigits: 0,
                    })}`,
                },
                {
                    label: 'Combustible',
                    value: t.costo_combustible.toLocaleString('es-VE', {
                        style: 'currency',
                        currency: 'USD',
                        maximumFractionDigits: 0,
                    }),
                    icon: 'pi pi-gas-pump',
                    color: 'text-amber-500',
                    detalle: `${t.litros.toLocaleString('es-VE')} litros`,
                    detalleExtra: `Bs ${t.costo_combustible_bss.toLocaleString('es-VE', {
                        maximumFractionDigits: 0,
                    })}`,
                },
                {
                    label: 'Mantenimiento',
                    value: t.costo_mantenimiento.toLocaleString('es-VE', {
                        style: 'currency',
                        currency: 'USD',
                        maximumFractionDigits: 0,
                    }),
                    icon: 'pi pi-wrench',
                    color: 'text-blue-500',
                    detalle: 'preventivo + correctivo',
                    detalleExtra: `Bs ${t.costo_mantenimiento_bss.toLocaleString('es-VE', {
                        maximumFractionDigits: 0,
                    })}`,
                },
                {
                    label: 'Vehículos',
                    value: String(d.por_vehiculo.length),
                    icon: 'pi pi-truck',
                    color: 'text-cyan-500',
                    detalle: 'con gastos en el rango',
                },
            ] as KpiCard[];
        };
    }

    async cargarReporte() {
        this.cargando.set(true);
        try {
            const f = this.filtros();
            const data = await this.reporteService.obtenerGastos(
                f.fechaDesde,
                f.fechaHasta,
                f.idVehiculo,
            );
            this.datos.set(data);
            this.construirGraficos(data);
        } catch (err: any) {
            console.error('Error cargando gastos:', err);
            this.datos.set(null);
        } finally {
            this.cargando.set(false);
        }
    }

    private construirGraficos(d: ResumenGastos) {
        const t = d.totales;
        if (t.costo_combustible + t.costo_mantenimiento > 0) {
            this.distribucionData.set({
                labels: ['Combustible', 'Mantenimiento'],
                datasets: [
                    {
                        data: [t.costo_combustible, t.costo_mantenimiento],
                        backgroundColor: ['#f59e0b', '#3b82f6'],
                        borderWidth: 0,
                    },
                ],
            });
        } else {
            this.distribucionData.set(null);
        }

        const conGastos = d.por_vehiculo.filter(
            (v) => v.costo_combustible > 0 || v.costo_mantenimiento > 0,
        );
        if (conGastos.length) {
            this.vehiculoData.set({
                labels: conGastos.map((v) => v.placa),
                datasets: [
                    {
                        label: 'Combustible',
                        data: conGastos.map((v) => v.costo_combustible),
                        backgroundColor: '#f59e0b',
                        borderRadius: 4,
                    },
                    {
                        label: 'Mantenimiento',
                        data: conGastos.map((v) => v.costo_mantenimiento),
                        backgroundColor: '#3b82f6',
                        borderRadius: 4,
                    },
                ],
            });
        } else {
            this.vehiculoData.set(null);
        }
    }

    exportarExcel() {
        const d = this.datos();
        if (!d) return;
        this.exportandoExcel.set(true);
        try {
            exportarExcel({
                titulo: 'Reporte de Gastos',
                subtitulo: this.subtituloRango(),
                nombreArchivo: 'reporte-gastos',
                columnas: [
                    { key: 'placa', label: 'Unidad' },
                    { key: 'vehiculo_desc', label: 'Vehículo' },
                    { key: 'cargas', label: 'Cargas' },
                    { key: 'litros_combustible', label: 'Litros' },
                    { key: 'costo_combustible', label: 'Combustible USD' },
                    { key: 'costo_combustible_bss', label: 'Combustible Bs' },
                    { key: 'mantenimientos', label: 'Mantenimientos' },
                    { key: 'costo_mantenimiento', label: 'Mantenimiento USD' },
                    { key: 'costo_mantenimiento_bss', label: 'Mantenimiento Bs' },
                    { key: 'km_recorridos', label: 'Km' },
                    { key: 'costo_total', label: 'Total USD' },
                    { key: 'costo_total_bss', label: 'Total Bs' },
                    { key: 'costo_por_km', label: 'Costo/km' },
                ],
                filas: d.por_vehiculo.map((v) => ({
                    placa: v.placa,
                    vehiculo_desc: v.vehiculo_desc,
                    cargas: v.cargas,
                    litros_combustible: v.litros_combustible,
                    costo_combustible: v.costo_combustible,
                    costo_combustible_bss: v.costo_combustible_bss,
                    mantenimientos: v.mantenimientos,
                    costo_mantenimiento: v.costo_mantenimiento,
                    costo_mantenimiento_bss: v.costo_mantenimiento_bss,
                    km_recorridos: v.km_recorridos,
                    costo_total: v.costo_total,
                    costo_total_bss: v.costo_total_bss,
                    costo_por_km: v.costo_por_km,
                })),
            });
        } finally {
            this.exportandoExcel.set(false);
        }
    }

    exportarPdf() {
        const d = this.datos();
        if (!d) return;
        this.exportandoPdf.set(true);
        try {
            exportarPdf({
                titulo: 'Reporte de Gastos',
                subtitulo: this.subtituloRango(),
                nombreArchivo: 'reporte-gastos',
                pageOrientation: 'landscape',
                columnWidths: [7, 10, 7, 7, 8, 8, 8, 8, 7, 7, 8, 8, 7],
                columnas: [
                    { key: 'placa', label: 'Unidad' },
                    { key: 'litros_combustible', label: 'Litros' },
                    { key: 'costo_combustible', label: 'Combust. USD' },
                    { key: 'costo_combustible_bss', label: 'Combust. Bs' },
                    { key: 'costo_mantenimiento', label: 'Manten. USD' },
                    { key: 'costo_mantenimiento_bss', label: 'Manten. Bs' },
                    { key: 'km_recorridos', label: 'Km' },
                    { key: 'costo_total', label: 'Total USD' },
                    { key: 'costo_total_bss', label: 'Total Bs' },
                ],
                filas: d.por_vehiculo.map((v) => ({
                    placa: v.placa,
                    litros_combustible: v.litros_combustible.toFixed(1),
                    costo_combustible: v.costo_combustible.toFixed(2),
                    costo_combustible_bss: v.costo_combustible_bss.toFixed(2),
                    costo_mantenimiento: v.costo_mantenimiento.toFixed(2),
                    costo_mantenimiento_bss: v.costo_mantenimiento_bss.toFixed(2),
                    km_recorridos: v.km_recorridos.toFixed(1),
                    costo_total: v.costo_total.toFixed(2),
                    costo_total_bss: v.costo_total_bss.toFixed(2),
                })),
            });
        } finally {
            this.exportandoPdf.set(false);
        }
    }

    private subtituloRango(): string {
        const f = this.filtros();
        if (f.fechaDesde && f.fechaHasta) {
            return `Periodo: ${f.fechaDesde} al ${f.fechaHasta}`;
        }
        return 'Periodo: todos los registros';
    }
}
