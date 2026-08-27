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
    templateUrl: './gastos.component.html',
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
