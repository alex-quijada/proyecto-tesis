import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartModule } from 'primeng/chart';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';

import { CabeceraReporteComponent } from '../componentes-compartidos/cabecera-reporte.component';
import { FiltrosReporteComponent } from '../componentes-compartidos/filtros-reporte.component';
import { ReporteService, ResumenIncidencias } from '../services/reporte.service';
import { FiltrosReporte, OpcionFiltro } from '../utils/reporte.types';
import { exportarExcel } from '../utils/exportar-excel.util';
import { exportarPdf } from '../utils/exportar-pdf.util';
import { TipoIncidenciaPipe } from '@/app/shared/pipes/tipo-incidencia.pipe';
import { CapitalizePipe } from '../../clientes/pipes/capitalize.pipe';

interface KpiCard {
    label: string;
    value: string;
    icon: string;
    color: string;
    detalleExtra?: string;
}

@Component({
    selector: 'app-incidencias',
    standalone: true,
    imports: [
        CommonModule,
        ChartModule,
        TableModule,
        TagModule,
        SkeletonModule,
        CabeceraReporteComponent,
        FiltrosReporteComponent,
        TipoIncidenciaPipe,
        CapitalizePipe,
    ],
    template: `
        <div class="card">
            <app-cabecera-reporte
                titulo="Reporte de Incidencias"
                subtitulo="Incidencias por tipo y chofer, recuperables, resueltas y monto afectado"
                [sinDatos]="sinDatos()"
                [recargando]="cargando()"
                [exportandoExcel]="exportandoExcel()"
                [exportandoPdf]="exportandoPdf()"
                (recargar)="cargarReporte()"
                (exportarExcel)="exportarExcel()"
                (exportarPdf)="exportarPdf()"
            />

            <app-filtros-reporte
                [choferes]="choferes()"
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
                    <p-skeleton height="240px" borderRadius="12px" />
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
                                @if (k.detalleExtra) {
                                    <div class="text-xs text-surface-500 mt-0.5">
                                        {{ k.detalleExtra }}
                                    </div>
                                }
                            </div>
                        }
                    </div>

                    <!-- Gráfico + tabla por tipo -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div
                            class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/40 p-4"
                        >
                            <h2 class="font-semibold text-surface-800 dark:text-surface-100 mb-3">
                                Incidencias por tipo
                            </h2>
                            @if (tipoData()) {
                                <p-chart
                                    type="bar"
                                    [data]="tipoData()"
                                    [options]="chartOptions"
                                    height="240px"
                                />
                            } @else {
                                <div class="text-sm text-surface-500 py-6 text-center">
                                    Sin incidencias en el rango.
                                </div>
                            }
                        </div>

                        <div
                            class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/40 p-4"
                        >
                            <h2 class="font-semibold text-surface-800 dark:text-surface-100 mb-3">
                                Por tipo
                            </h2>
                            <p-table
                                [value]="d.por_tipo"
                                dataKey="tipo"
                                [rows]="10"
                                [paginator]="d.por_tipo.length > 10"
                                [tableStyle]="{ 'min-width': '40rem' }"
                            >
                                <ng-template #header>
                                    <tr>
                                        <th>Tipo</th>
                                        <th style="width: 6rem">Total</th>
                                        <th style="width: 7rem">Recup.</th>
                                        <th style="width: 7rem">Term.</th>
                                        <th style="width: 7rem">Resuel.</th>
                                        <th style="width: 9rem">Monto USD</th>
                                        <th style="width: 9rem">Monto Bs</th>
                                    </tr>
                                </ng-template>
                                <ng-template #body let-t>
                                    <tr>
                                        <td>
                                            <p-tag
                                                [value]="t.tipo | tipoIncidencia"
                                                severity="danger"
                                            />
                                        </td>
                                        <td class="font-semibold">{{ t.total }}</td>
                                        <td class="text-surface-500">{{ t.recuperables }}</td>
                                        <td class="text-surface-500">{{ t.terminales }}</td>
                                        <td class="text-surface-500">{{ t.resueltas }}</td>
                                        <td class="font-mono">
                                            {{ t.monto_usd | currency: 'USD' : 'symbol' : '1.2-2' }}
                                        </td>
                                        <td class="font-mono">
                                            {{ t.monto_bss | number: '1.2-2' }} Bs
                                        </td>
                                    </tr>
                                </ng-template>
                                <ng-template #emptymessage>
                                    <tr>
                                        <td colspan="7" class="text-center py-6 text-surface-400">
                                            Sin incidencias.
                                        </td>
                                    </tr>
                                </ng-template>
                            </p-table>
                        </div>
                    </div>

                    <!-- Por chofer -->
                    <div
                        class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/40 p-4"
                    >
                        <h2 class="font-semibold text-surface-800 dark:text-surface-100 mb-3">
                            Por chofer
                        </h2>
                        <p-table
                            [value]="d.por_chofer"
                            dataKey="nombre_chofer"
                            [rows]="10"
                            [paginator]="d.por_chofer.length > 10"
                            [tableStyle]="{ 'min-width': '40rem' }"
                        >
                            <ng-template #header>
                                <tr>
                                    <th>Chofer</th>
                                    <th style="width: 7rem">Total</th>
                                    <th style="width: 7rem">Recuperables</th>
                                    <th style="width: 7rem">Resueltas</th>
                                    <th style="width: 9rem">Monto USD</th>
                                    <th style="width: 9rem">Monto Bs</th>
                                </tr>
                            </ng-template>
                            <ng-template #body let-c>
                                <tr>
                                    <td class="font-medium">{{ c.nombre_chofer | capitalize }}</td>
                                    <td class="font-semibold">{{ c.total }}</td>
                                    <td class="text-surface-500">{{ c.recuperables }}</td>
                                    <td class="text-surface-500">{{ c.resueltas }}</td>
                                    <td class="font-mono">
                                        {{ c.monto_usd | currency: 'USD' : 'symbol' : '1.2-2' }}
                                    </td>
                                    <td class="font-mono">
                                        {{ c.monto_bss | number: '1.2-2' }} Bs
                                    </td>
                                </tr>
                            </ng-template>
                            <ng-template #emptymessage>
                                <tr>
                                    <td colspan="6" class="text-center py-6 text-surface-400">
                                        Sin incidencias.
                                    </td>
                                </tr>
                            </ng-template>
                        </p-table>
                    </div>
                </div>
            } @else {
                <div class="text-center py-16 text-muted-color">
                    <i class="pi pi-exclamation-triangle text-4xl block mb-3"></i>
                    <span class="text-lg font-semibold">Sin datos para el rango seleccionado</span>
                </div>
            }
        </div>
    `,
})
export class IncidenciasComponent {
    private reporteService = inject(ReporteService);

    cargando = signal(true);
    datos = signal<ResumenIncidencias | null>(null);
    filtros = signal<FiltrosReporte>({});
    choferes = signal<OpcionFiltro[]>([]);
    tipoData = signal<any>(null);
    exportandoExcel = signal(false);
    exportandoPdf = signal(false);

    readonly chartOptions = {
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.parsed.y} incidencias` } },
        },
        scales: {
            x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { color: '#94a3b8', precision: 0 } },
        },
    };

    constructor() {
        void this.inicializar();
    }

    private async inicializar() {
        try {
            this.choferes.set(await this.reporteService.obtenerChoferes());
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
                    label: 'Total',
                    value: String(t.total),
                    icon: 'pi pi-exclamation-triangle',
                    color: 'text-red-500',
                },
                {
                    label: 'Recuperables',
                    value: String(t.recuperables),
                    icon: 'pi pi-refresh',
                    color: 'text-amber-500',
                },
                {
                    label: 'Resueltas',
                    value: String(t.resueltas),
                    icon: 'pi pi-check-circle',
                    color: 'text-green-500',
                },
                {
                    label: 'Monto afectado',
                    value: t.monto_usd.toLocaleString('es-VE', {
                        style: 'currency',
                        currency: 'USD',
                        maximumFractionDigits: 0,
                    }),
                    icon: 'pi pi-dollar',
                    color: 'text-purple-500',
                    detalleExtra: `Bs ${t.monto_bss.toLocaleString('es-VE', {
                        maximumFractionDigits: 0,
                    })}`,
                },
            ] as KpiCard[];
        };
    }

    async cargarReporte() {
        this.cargando.set(true);
        try {
            const f = this.filtros();
            const data = await this.reporteService.obtenerIncidencias(
                f.fechaDesde,
                f.fechaHasta,
                f.idChofer,
            );
            this.datos.set(data);
            this.construirGrafico(data.por_tipo);
        } catch (err: any) {
            console.error('Error cargando incidencias:', err);
            this.datos.set(null);
        } finally {
            this.cargando.set(false);
        }
    }

    private construirGrafico(porTipo: ResumenIncidencias['por_tipo']) {
        if (!porTipo?.length) {
            this.tipoData.set(null);
            return;
        }
        const colores = [
            '#ef4444',
            '#f59e0b',
            '#8b5cf6',
            '#3b82f6',
            '#ec4899',
            '#06b6d4',
            '#f97316',
        ];
        this.tipoData.set({
            labels: porTipo.map((t) => t.tipo),
            datasets: [
                {
                    label: 'Incidencias',
                    data: porTipo.map((t) => t.total),
                    backgroundColor: porTipo.map((_, i) => colores[i % colores.length]),
                    borderRadius: 6,
                    maxBarThickness: 30,
                },
            ],
        });
    }

    exportarExcel() {
        const d = this.datos();
        if (!d) return;
        this.exportandoExcel.set(true);
        try {
            exportarExcel({
                titulo: 'Reporte de Incidencias',
                subtitulo: this.subtituloRango(),
                nombreArchivo: 'reporte-incidencias',
                columnas: [
                    { key: 'tipo', label: 'Tipo' },
                    { key: 'total', label: 'Total' },
                    { key: 'recuperables', label: 'Recuperables' },
                    { key: 'terminales', label: 'Terminales' },
                    { key: 'resueltas', label: 'Resueltas' },
                    { key: 'pendientes', label: 'Pendientes' },
                    { key: 'monto_usd', label: 'Monto USD' },
                    { key: 'monto_bss', label: 'Monto Bs' },
                ],
                filas: d.por_tipo.map((t) => ({
                    tipo: t.tipo,
                    total: t.total,
                    recuperables: t.recuperables,
                    terminales: t.terminales,
                    resueltas: t.resueltas,
                    pendientes: t.pendientes,
                    monto_usd: t.monto_usd,
                    monto_bss: t.monto_bss,
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
                titulo: 'Reporte de Incidencias',
                subtitulo: this.subtituloRango(),
                nombreArchivo: 'reporte-incidencias',
                columnas: [
                    { key: 'nombre_chofer', label: 'Chofer' },
                    { key: 'total', label: 'Total' },
                    { key: 'recuperables', label: 'Recup.' },
                    { key: 'resueltas', label: 'Resuel.' },
                    { key: 'monto_usd', label: 'Monto USD' },
                    { key: 'monto_bss', label: 'Monto Bs' },
                ],
                filas: d.por_chofer.map((c) => ({
                    nombre_chofer: this.capitalizar(c.nombre_chofer),
                    total: c.total,
                    recuperables: c.recuperables,
                    resueltas: c.resueltas,
                    monto_usd: c.monto_usd.toFixed(2),
                    monto_bss: c.monto_bss.toFixed(2),
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

    private capitalizar(v: string): string {
        if (!v) return v || '';
        return v
            .toLowerCase()
            .split(' ')
            .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
            .join(' ');
    }
}
