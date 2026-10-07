import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartModule } from 'primeng/chart';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule } from 'primeng/tooltip';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';

import { CabeceraReporteComponent } from '../componentes-compartidos/cabecera-reporte.component';
import { FiltrosReporteComponent } from '../componentes-compartidos/filtros-reporte.component';
import { ReporteService, MetricasEficiencia } from '../services/reporte.service';
import { FiltrosReporte, OpcionFiltro } from '../utils/reporte.types';
import { exportarExcel } from '../utils/exportar-excel.util';
import { exportarPdf } from '../utils/exportar-pdf.util';
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
        TooltipModule,
        ButtonModule,
        MessageModule,
        CabeceraReporteComponent,
        FiltrosReporteComponent,
        CapitalizePipe,
    ],
    templateUrl: './eficiencia.component.html',
})
export class EficienciaComponent {
    private reporteService = inject(ReporteService);

    cargando = signal(true);
    error = signal<string | null>(null);
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
        } catch (err) {
            console.warn(
                '[ReporteEficiencia] Error al cargar filtros de choferes/municipios:',
                err,
            );
        }
        await this.cargarReporte();
    }

    readonly sinDatos = computed(() => !this.datos());

    readonly kpis = computed<KpiCard[]>(() => {
        const d = this.datos();
        if (!d) return [];
        const k = d.kpis;
        const resueltas = k.incidencias_resueltas ?? 0;
        const pendientes = k.incidencias_pendientes ?? Math.max(0, k.incidencias - resueltas);
        const totalIntentos = k.entregas + pendientes;
        const tasa =
            totalIntentos > 0 ? ((k.entregas / totalIntentos) * 100).toFixed(1) + '%' : '—';
        return [
            {
                label: 'Entregas',
                value: String(k.entregas),
                icon: 'pi pi-check-circle',
                color: 'text-green-500',
                detalle: `${k.viajes_finalizados} viajes finalizados`,
                detalleExtra:
                    resueltas > 0 ? `(${resueltas} recuperadas tras incidencia)` : undefined,
            },
            {
                label: 'Incidencias',
                value: String(k.incidencias),
                icon: 'pi pi-exclamation-triangle',
                color: 'text-red-500',
                detalle: `${resueltas} resueltas · ${pendientes} pendientes`,
                detalleExtra: k.monto_recuperado_usd
                    ? `$${k.monto_recuperado_usd.toLocaleString('es-VE', { maximumFractionDigits: 0 })} recuperados`
                    : undefined,
            },
            {
                label: 'Cumplimiento',
                value: tasa,
                icon: 'pi pi-percentage',
                color: 'text-blue-500',
                detalle: 'entregas sobre total despachado',
                detalleExtra:
                    resueltas > 0 && k.incidencias > 0
                        ? `${((resueltas / k.incidencias) * 100).toFixed(0)}% incidencias resueltas`
                        : undefined,
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
    });

    readonly tiempos = computed(() => this.datos()?.tiempos_por_etapa || []);

    etapaLabel(etapa: string): string {
        const norm = (etapa || '').toLowerCase().trim();
        if (norm.includes('descarga') || norm.includes('entrega') || norm === 'finalizado')
            return 'Entrega';
        if (norm.includes('ruta') || norm.includes('traslado') || norm === 'proceso')
            return 'Traslado';
        if (norm.includes('espera')) return 'Espera';
        if (norm.includes('carga') || norm === 'embarque') return 'Carga';
        return etapa;
    }

    colorEtapa(etapa: string): string {
        const norm = (etapa || '').toLowerCase().trim();
        if (norm.includes('descarga') || norm.includes('entrega') || norm === 'finalizado')
            return 'bg-green-500';
        if (norm.includes('ruta') || norm.includes('traslado') || norm === 'proceso')
            return 'bg-cyan-500';
        if (norm.includes('espera')) return 'bg-amber-500';
        if (norm.includes('carga') || norm === 'embarque') return 'bg-blue-500';
        return 'bg-surface-400';
    }

    barraEtapa(min: number | string): number {
        const valores = this.tiempos().map((t) => Number(t.minutos_promedio) || 0);
        const max = Math.max(...valores, 1);
        const val = Number(min) || 0;
        return Math.min(100, Math.round((val / max) * 100));
    }

    formatearMinutos(min: number | string | undefined): string {
        const n = Number(min);
        return isNaN(n) ? '0.0' : n.toFixed(1);
    }

    async cargarReporte() {
        this.cargando.set(true);
        this.error.set(null);
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
            this.error.set(
                err.message ||
                    'No se pudieron cargar los datos de eficiencia. Verifica tu conexión.',
            );
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
                    { key: 'incidencias', label: 'Incidencias Totales' },
                    { key: 'incidencias_resueltas', label: 'Incidencias Resueltas' },
                    { key: 'incidencias_pendientes', label: 'Incidencias Pendientes' },
                    { key: 'monto_usd', label: 'Monto USD' },
                    { key: 'monto_bss', label: 'Monto Bs' },
                    { key: 'km_planificados', label: 'Km planificados' },
                ],
                filas: d.por_chofer.map((c) => ({
                    nombre_chofer: this.capitalizar(c.nombre_chofer),
                    entregas: c.entregas,
                    incidencias: c.incidencias,
                    incidencias_resueltas: c.incidencias_resueltas ?? 0,
                    incidencias_pendientes: c.incidencias_pendientes ?? 0,
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
                    { key: 'incidencias_resueltas', label: 'Resueltas' },
                    { key: 'monto_usd', label: 'Monto USD' },
                    { key: 'monto_bss', label: 'Monto Bs' },
                    { key: 'km_planificados', label: 'Km' },
                ],
                filas: d.por_chofer.map((c) => ({
                    nombre_chofer: this.capitalizar(c.nombre_chofer),
                    entregas: c.entregas,
                    incidencias: c.incidencias,
                    incidencias_resueltas: c.incidencias_resueltas ?? 0,
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
