import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartModule } from 'primeng/chart';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';

import { CabeceraReporteComponent } from '../componentes-compartidos/cabecera-reporte.component';
import { FiltrosReporteComponent } from '../componentes-compartidos/filtros-reporte.component';
import { ReporteService, MetricasEficiencia } from '../services/reporte.service';
import { FiltrosReporte } from '../utils/reporte.types';
import { exportarExcel } from '../utils/exportar-excel.util';
import { exportarPdf } from '../utils/exportar-pdf.util';
import { OpcionFiltro } from '../utils/reporte.types';
import { CapitalizePipe } from '../../clientes/pipes/capitalize.pipe';

interface KpiCard {
    label: string;
    value: string;
    icon: string;
    color: string;
    detalle: string;
    detalleExtra?: string;
}

@Component({
    selector: 'app-eficiencia',
    standalone: true,
    imports: [
        CommonModule,
        ChartModule,
        TableModule,
        TagModule,
        SkeletonModule,
        CabeceraReporteComponent,
        FiltrosReporteComponent,
        CapitalizePipe,
    ],
    template: `
        <div class="card">
            <app-cabecera-reporte
                titulo="Reporte de Eficiencia"
                subtitulo="Entregas, incidencias, tiempos por etapa y eficiencia de ruta"
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
                [municipios]="municipios()"
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

                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <!-- Tiempos por etapa -->
                        <div
                            class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/40 p-4"
                        >
                            <h2 class="font-semibold text-surface-800 dark:text-surface-100 mb-3">
                                Tiempo promedio por etapa
                            </h2>
                            @if (tiempos().length === 0) {
                                <div class="text-sm text-surface-500 py-6 text-center">
                                    Sin datos de duración por etapa en el rango.
                                </div>
                            } @else {
                                <div class="flex flex-col gap-3">
                                    @for (t of tiempos(); track t.etapa) {
                                        <div>
                                            <div
                                                class="flex items-center justify-between text-sm mb-1"
                                            >
                                                <span
                                                    class="text-surface-600 dark:text-surface-300"
                                                >
                                                    {{ etapaLabel(t.etapa) }}
                                                </span>
                                                <span class="font-semibold">
                                                    {{ t.minutos_promedio.toFixed(1) }} min
                                                </span>
                                            </div>
                                            <div
                                                class="w-full h-2 bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden"
                                            >
                                                <div
                                                    class="h-full rounded-full"
                                                    [style.width.%]="barraEtapa(t.minutos_promedio)"
                                                    [ngClass]="colorEtapa(t.etapa)"
                                                ></div>
                                            </div>
                                        </div>
                                    }
                                </div>
                            }
                        </div>

                        <!-- Gráfico por municipio -->
                        <div
                            class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/40 p-4"
                        >
                            <h2 class="font-semibold text-surface-800 dark:text-surface-100 mb-3">
                                Entregas por municipio
                            </h2>
                            @if (municipioData()) {
                                <p-chart
                                    type="bar"
                                    [data]="municipioData()"
                                    [options]="chartOptions"
                                    height="220px"
                                />
                            } @else {
                                <div class="text-sm text-surface-500 py-6 text-center">
                                    Sin entregas en el rango.
                                </div>
                            }
                        </div>
                    </div>

                    <!-- Desglose por chofer -->
                    <div
                        class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/40 p-4"
                    >
                        <h2 class="font-semibold text-surface-800 dark:text-surface-100 mb-3">
                            Desglose por chofer
                        </h2>
                        <p-table
                            [value]="d.por_chofer"
                            dataKey="id_chofer"
                            [rows]="10"
                            [paginator]="d.por_chofer.length > 10"
                            [tableStyle]="{ 'min-width': '44rem' }"
                        >
                            <ng-template #header>
                                <tr>
                                    <th>Chofer</th>
                                    <th style="width: 7rem">Entregas</th>
                                    <th style="width: 7rem">Incidencias</th>
                                    <th style="width: 9rem">Monto USD</th>
                                    <th style="width: 9rem">Monto Bs</th>
                                    <th style="width: 8rem">Km planif.</th>
                                </tr>
                            </ng-template>
                            <ng-template #body let-c>
                                <tr>
                                    <td class="font-medium">{{ c.nombre_chofer | capitalize }}</td>
                                    <td>
                                        <p-tag value="{{ c.entregas }}" severity="success" />
                                    </td>
                                    <td>
                                        <p-tag value="{{ c.incidencias }}" severity="danger" />
                                    </td>
                                    <td class="font-mono">
                                        {{ c.monto_usd | currency: 'USD' : 'symbol' : '1.2-2' }}
                                    </td>
                                    <td class="font-mono">
                                        {{ c.monto_bss | number: '1.2-2' }} Bs
                                    </td>
                                    <td class="font-mono text-sm">
                                        {{ c.km_planificados.toFixed(1) }} km
                                    </td>
                                </tr>
                            </ng-template>
                            <ng-template #emptymessage>
                                <tr>
                                    <td colspan="6" class="text-center py-6 text-surface-400">
                                        Sin viajes finalizados en el rango.
                                    </td>
                                </tr>
                            </ng-template>
                        </p-table>
                    </div>
                </div>
            } @else {
                <div class="text-center py-16 text-muted-color">
                    <i class="pi pi-chart-line text-4xl block mb-3"></i>
                    <span class="text-lg font-semibold">Sin datos para el rango seleccionado</span>
                </div>
            }
        </div>
    `,
})
export class EficienciaComponent {
    private reporteService = inject(ReporteService);

    cargando = signal(true);
    datos = signal<MetricasEficiencia | null>(null);
    filtros = signal<FiltrosReporte>({});
    choferes = signal<OpcionFiltro[]>([]);
    municipios = signal<OpcionFiltro[]>([]);
    municipioData = signal<any>(null);
    exportandoExcel = signal(false);
    exportandoPdf = signal(false);

    readonly chartOptions = {
        plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.parsed.y} entregas` } },
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
            const [choferes, municipios] = await Promise.all([
                this.reporteService.obtenerChoferes(),
                this.reporteService.obtenerMunicipios(),
            ]);
            this.choferes.set(choferes);
            this.municipios.set(municipios);
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
            const k = d.kpis;
            const tasa =
                k.entregas + k.incidencias > 0
                    ? ((k.entregas / (k.entregas + k.incidencias)) * 100).toFixed(1) + '%'
                    : '—';
            return [
                {
                    label: 'Entregas',
                    value: String(k.entregas),
                    icon: 'pi pi-check-circle',
                    color: 'text-green-500',
                    detalle: `${k.viajes_finalizados} viajes finalizados`,
                },
                {
                    label: 'Incidencias',
                    value: String(k.incidencias),
                    icon: 'pi pi-exclamation-triangle',
                    color: 'text-red-500',
                    detalle: 'facturas con incidencia',
                },
                {
                    label: 'Cumplimiento',
                    value: tasa,
                    icon: 'pi pi-percentage',
                    color: 'text-blue-500',
                    detalle: 'entregas sobre el total',
                },
                {
                    label: 'Monto entregado',
                    value: k.monto_entregado_usd.toLocaleString('es-VE', {
                        style: 'currency',
                        currency: 'USD',
                        maximumFractionDigits: 0,
                    }),
                    icon: 'pi pi-dollar',
                    color: 'text-purple-500',
                    detalle: `${k.monto_incidencia_usd.toLocaleString('es-VE', {
                        style: 'currency',
                        currency: 'USD',
                        maximumFractionDigits: 0,
                    })} en incidencia`,
                    detalleExtra: `Bs ${k.monto_entregado_bss.toLocaleString('es-VE', {
                        maximumFractionDigits: 0,
                    })} entregado`,
                },
            ] as KpiCard[];
        };
    }

    get tiempos() {
        return () => this.datos()?.tiempos_por_etapa || [];
    }

    etapaLabel(etapa: string): string {
        switch (etapa) {
            case 'embarque':
                return 'Carga';
            case 'proceso':
                return 'Traslado';
            case 'espera':
                return 'Espera';
            case 'entrega':
                return 'Entrega';
            default:
                return etapa;
        }
    }

    colorEtapa(etapa: string): string {
        switch (etapa) {
            case 'embarque':
                return 'bg-blue-500';
            case 'proceso':
                return 'bg-cyan-500';
            case 'espera':
                return 'bg-amber-500';
            case 'entrega':
                return 'bg-green-500';
            default:
                return 'bg-surface-400';
        }
    }

    barraEtapa(min: number): number {
        const max = Math.max(...this.tiempos().map((t) => t.minutos_promedio), 1);
        return Math.min(100, Math.round((min / max) * 100));
    }

    async cargarReporte() {
        this.cargando.set(true);
        try {
            const f = this.filtros();
            const data = await this.reporteService.obtenerEficiencia(
                f.fechaDesde,
                f.fechaHasta,
                f.idChofer,
                f.idMunicipio,
            );
            this.datos.set(data);
            this.construirGrafico(data.por_municipio);
            this.combinarFiltrosConDatos(data);
        } catch (err: any) {
            console.error('Error cargando eficiencia:', err);
            this.datos.set(null);
        } finally {
            this.cargando.set(false);
        }
    }

    /** Agrega al selector de choferes los que aparecen en los datos aunque no
     *  estén en el catálogo base (así el filtro siempre ofrece todas las
     *  opciones con datos). Los municipios se mantienen del catálogo (UUID),
     *  que es el valor que espera el RPC. */
    private combinarFiltrosConDatos(d: MetricasEficiencia) {
        const chof = this.choferes();
        const chofNuevos = (d.por_chofer || [])
            .filter((c) => c.id_chofer && !chof.some((x) => x.value === c.id_chofer))
            .map((c) => ({
                label: this.capitalizar(c.nombre_chofer) || 'Sin nombre',
                value: c.id_chofer,
            }));
        if (chofNuevos.length) this.choferes.set([...chof, ...chofNuevos]);
    }

    private construirGrafico(porMunicipio: MetricasEficiencia['por_municipio']) {
        if (!porMunicipio?.length) {
            this.municipioData.set(null);
            return;
        }
        const colores = [
            '#3b82f6',
            '#8b5cf6',
            '#06b6d4',
            '#10b981',
            '#f59e0b',
            '#ec4899',
            '#6366f1',
        ];
        this.municipioData.set({
            labels: porMunicipio.map((m) => m.municipio),
            datasets: [
                {
                    label: 'Entregas',
                    data: porMunicipio.map((m) => m.entregas),
                    backgroundColor: porMunicipio.map((_, i) => colores[i % colores.length]),
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
                titulo: 'Reporte de Eficiencia',
                subtitulo: this.subtituloRango(),
                nombreArchivo: 'reporte-eficiencia',
                columnas: [
                    { key: 'nombre_chofer', label: 'Chofer' },
                    { key: 'entregas', label: 'Entregas' },
                    { key: 'incidencias', label: 'Incidencias' },
                    { key: 'monto_usd', label: 'Monto USD' },
                    { key: 'monto_bss', label: 'Monto Bs' },
                    { key: 'km_planificados', label: 'Km planificados' },
                ],
                filas: d.por_chofer.map((c) => ({
                    nombre_chofer: this.capitalizar(c.nombre_chofer),
                    entregas: c.entregas,
                    incidencias: c.incidencias,
                    monto_usd: c.monto_usd,
                    monto_bss: c.monto_bss,
                    km_planificados: c.km_planificados,
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
                titulo: 'Reporte de Eficiencia',
                subtitulo: this.subtituloRango(),
                nombreArchivo: 'reporte-eficiencia',
                columnas: [
                    { key: 'nombre_chofer', label: 'Chofer' },
                    { key: 'entregas', label: 'Entregas' },
                    { key: 'incidencias', label: 'Incidencias' },
                    { key: 'monto_usd', label: 'Monto USD' },
                    { key: 'monto_bss', label: 'Monto Bs' },
                    { key: 'km_planificados', label: 'Km' },
                ],
                filas: d.por_chofer.map((c) => ({
                    nombre_chofer: this.capitalizar(c.nombre_chofer),
                    entregas: c.entregas,
                    incidencias: c.incidencias,
                    monto_usd: c.monto_usd.toFixed(2),
                    monto_bss: c.monto_bss.toFixed(2),
                    km_planificados: c.km_planificados.toFixed(1),
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
