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
    templateUrl: './incidencias.component.html',
})
export class IncidenciasComponent {
    private reporteService = inject(ReporteService);
    private tipoPipe = new TipoIncidenciaPipe();

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
            labels: porTipo.map((t) => this.tipoPipe.transform(t.tipo)),
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
                    tipo: this.tipoPipe.transform(t.tipo),
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
