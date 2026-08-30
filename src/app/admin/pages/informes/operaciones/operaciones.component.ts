import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';

import { CabeceraReporteComponent } from '../componentes-compartidos/cabecera-reporte.component';
import { FiltrosReporteComponent } from '../componentes-compartidos/filtros-reporte.component';
import { ReporteService } from '../services/reporte.service';
import { RutaService } from '../../rutas/services/ruta.service';
import { FiltrosReporte, OpcionFiltro } from '../utils/reporte.types';
import { exportarExcel } from '../utils/exportar-excel.util';
import { exportarPdf } from '../utils/exportar-pdf.util';
import { FacturaGuia, GuiaDespacho } from '../../rutas/data/rutas-mock';
import { CapitalizePipe } from '../../clientes/pipes/capitalize.pipe';

interface FilaOperacion {
    numeroFactura: string;
    numeroGuia: string;
    cliente: string;
    municipio: string;
    chofer: string;
    placaVehiculo: string;
    empresa: string;
    estado: string;
    montoUsd: number;
    montoVES: number;
    fecha: string;
}

@Component({
    selector: 'app-operaciones',
    standalone: true,
    imports: [
        CommonModule,
        TableModule,
        TagModule,
        SkeletonModule,
        InputTextModule,
        IconFieldModule,
        InputIconModule,
        CabeceraReporteComponent,
        FiltrosReporteComponent,
        CapitalizePipe,
    ],
    templateUrl: './operaciones.component.html',
})
export class OperacionesComponent {
    private reporteService = inject(ReporteService);
    private rutaService = inject(RutaService);

    cargando = signal(true);
    guias = signal<GuiaDespacho[]>([]);
    filtros = signal<FiltrosReporte>({});
    filtrosAplicados = signal<FiltrosReporte>({});
    choferes = signal<OpcionFiltro[]>([]);
    municipios = signal<OpcionFiltro[]>([]);
    vehiculos = signal<OpcionFiltro[]>([]);
    empresas = signal<OpcionFiltro[]>([]);
    readonly estados = signal<OpcionFiltro[]>([
        { label: 'Entregado', value: 'finalizado' },
        { label: 'Incidencia', value: 'incidencia' },
        { label: 'Cancelado', value: 'cancelada' },
        { label: 'Entregando', value: 'entrega' },
        { label: 'En espera', value: 'espera' },
        { label: 'En camino', value: 'proceso' },
        { label: 'En carga', value: 'embarque' },
        { label: 'Nuevo', value: 'nuevo' },
    ]);
    exportandoExcel = signal(false);
    exportandoPdf = signal(false);

    constructor() {
        void this.inicializar();
    }

    private async inicializar() {
        try {
            const [choferes, municipios, vehiculos, empresas] = await Promise.all([
                this.reporteService.obtenerChoferes(),
                this.reporteService.obtenerMunicipios(),
                this.reporteService.obtenerVehiculos(),
                this.reporteService.obtenerEmpresas(),
            ]);
            this.choferes.set(choferes);
            this.municipios.set(municipios);
            this.vehiculos.set(vehiculos);
            this.empresas.set(empresas);
        } catch {
            /* filtros opcionales */
        }
        await this.cargarDatos();
    }

    async cargarDatos() {
        this.cargando.set(true);
        try {
            const guias = await this.rutaService.obtenerGuias();
            this.guias.set(guias);
        } catch (err: any) {
            console.error('Error cargando operaciones:', err);
            this.guias.set([]);
        } finally {
            this.cargando.set(false);
        }
    }

    readonly filasFiltradas = () => {
        const f = this.filtrosAplicados();
        return this.mapearConIds().filter(
            (x) =>
                this.enRango(x.fecha, f) &&
                (!f.idChofer || x.choferId === f.idChofer) &&
                (!f.idMunicipio || x.municipioId === f.idMunicipio) &&
                (!f.idVehiculo || x.vehiculoId === f.idVehiculo) &&
                (!f.idEmpresa || x.empresaId === f.idEmpresa) &&
                (!f.estado ||
                    x.estado === f.estado ||
                    (f.estado === 'cancelada' &&
                        (x.estado === 'cancelado' ||
                            x.estado === 'CANCELADO' ||
                            x.estado === 'CANCELADA')) ||
                    (f.estado === 'cancelado' &&
                        (x.estado === 'cancelada' ||
                            x.estado === 'CANCELADO' ||
                            x.estado === 'CANCELADA'))),
        );
    };

    private municipioNombre(value: string): string {
        if (!value) return '';
        const mun = this.municipios().find((m) => m.value === value);
        return mun?.label || value;
    }

    private mapearConIds(): (FilaOperacion & {
        choferId?: string;
        municipioId?: string;
        vehiculoId?: string;
        empresaId?: string;
    })[] {
        const filas: (FilaOperacion & {
            choferId?: string;
            municipioId?: string;
            vehiculoId?: string;
            empresaId?: string;
        })[] = [];
        for (const g of this.guias()) {
            for (const f of g.facturas) {
                filas.push({
                    numeroFactura: f.numeroFactura,
                    numeroGuia: g.numeroGuia || g.codigoGuia || '',
                    cliente: f.nombreCliente || '—',
                    municipio: this.municipioNombre(g.municipio || ''),
                    chofer: g.nombreChofer || '',
                    placaVehiculo: g.placaVehiculo || '',
                    empresa: g.empresa || '',
                    estado: f.idEstado || '',
                    montoUsd: Number(f.totalUSD) || 0,
                    montoVES: Number(f.totalVES) || 0,
                    fecha: g.fechaCreacion || '',
                    choferId: g.idChofer,
                    municipioId: g.municipio,
                    vehiculoId: g.idVehiculo,
                    empresaId: g.empresa,
                });
            }
        }
        return filas;
    }

    private enRango(fecha: string, f: FiltrosReporte): boolean {
        if (!f.fechaDesde && !f.fechaHasta) return true;
        const d = fecha ? new Date(fecha) : null;
        if (!d) return true;
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
            d.getDate(),
        ).padStart(2, '0')}`;
        if (f.fechaDesde && iso < f.fechaDesde) return false;
        if (f.fechaHasta && iso > f.fechaHasta) return false;
        return true;
    }

    get resumenEstados() {
        return () => {
            const filas = this.filasFiltradas();
            const conteo = new Map<string, number>();
            for (const f of filas) {
                const key = this.estadoLabel(f.estado);
                conteo.set(key, (conteo.get(key) || 0) + 1);
            }
            return [...conteo.entries()].map(([estado, cantidad]) => ({ estado, cantidad }));
        };
    }

    aplicarFiltros() {
        this.filtrosAplicados.set({ ...this.filtros() });
    }

    estadoSeverity(estado: string): 'success' | 'danger' | 'warn' | 'info' | 'secondary' {
        switch (estado?.toLowerCase()) {
            case 'finalizado':
                return 'success';
            case 'incidencia':
            case 'cancelada':
            case 'cancelado':
                return 'danger';
            case 'entrega':
            case 'espera':
                return 'warn';
            case 'proceso':
            case 'embarque':
                return 'info';
            case 'nuevo':
                return 'secondary';
            default:
                return 'secondary';
        }
    }

    estadoSeverityPorLabel(label: string): 'success' | 'danger' | 'warn' | 'info' | 'secondary' {
        switch (label) {
            case 'Entregado':
                return 'success';
            case 'Incidencia':
            case 'Cancelado':
            case 'Cancelada':
                return 'danger';
            case 'Entregando':
            case 'En espera':
                return 'warn';
            case 'En camino':
            case 'En carga':
                return 'info';
            case 'Nuevo':
                return 'secondary';
            default:
                return 'secondary';
        }
    }

    estadoLabel(estado: string): string {
        switch (estado?.toLowerCase()) {
            case 'finalizado':
                return 'Entregado';
            case 'incidencia':
                return 'Incidencia';
            case 'cancelada':
            case 'cancelado':
                return 'Cancelado';
            case 'entrega':
                return 'Entregando';
            case 'espera':
                return 'En espera';
            case 'proceso':
                return 'En camino';
            case 'embarque':
                return 'En carga';
            case 'nuevo':
                return 'Nuevo';
            default:
                return estado || '—';
        }
    }

    formatFecha(fecha?: string): string {
        if (!fecha) return '—';
        return new Date(fecha).toLocaleDateString('es-VE', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    }

    exportarExcel() {
        const filas = this.filasFiltradas();
        if (!filas.length) return;
        this.exportandoExcel.set(true);
        try {
            exportarExcel({
                titulo: 'Reporte de Operaciones',
                subtitulo: this.subtituloRango(),
                nombreArchivo: 'reporte-operaciones',
                columnas: [
                    { key: 'numeroFactura', label: 'Factura' },
                    { key: 'numeroGuia', label: 'Guía' },
                    { key: 'cliente', label: 'Cliente' },
                    { key: 'municipio', label: 'Municipio' },
                    { key: 'chofer', label: 'Chofer' },
                    { key: 'placaVehiculo', label: 'Placa' },
                    { key: 'empresa', label: 'Empresa' },
                    { key: 'montoUsd', label: 'Monto USD' },
                    { key: 'montoVES', label: 'Monto Bs' },
                    { key: 'estado', label: 'Estado' },
                    { key: 'fecha', label: 'Fecha' },
                ],
                filas: filas.map((f) => ({
                    numeroFactura: f.numeroFactura,
                    numeroGuia: f.numeroGuia,
                    cliente: f.cliente,
                    municipio: f.municipio,
                    chofer: this.capitalizar(f.chofer),
                    placaVehiculo: f.placaVehiculo,
                    empresa: f.empresa,
                    montoUsd: f.montoUsd,
                    montoVES: f.montoVES,
                    estado: this.estadoLabel(f.estado),
                    fecha: f.fecha,
                })),
            });
        } finally {
            this.exportandoExcel.set(false);
        }
    }

    exportarPdf() {
        const filas = this.filasFiltradas();
        if (!filas.length) return;
        this.exportandoPdf.set(true);
        try {
            exportarPdf({
                titulo: 'Reporte de Operaciones',
                subtitulo: this.subtituloRango(),
                nombreArchivo: 'reporte-operaciones',
                pageOrientation: 'landscape',
                columnWidths: [6, 5, 12, 7, 8, 8, 6, 6, 6, 6],
                columnas: [
                    { key: 'numeroFactura', label: 'Factura' },
                    { key: 'numeroGuia', label: 'Guía' },
                    { key: 'cliente', label: 'Cliente' },
                    { key: 'municipio', label: 'Municipio' },
                    { key: 'chofer', label: 'Chofer' },
                    { key: 'empresa', label: 'Empresa' },
                    { key: 'montoUsd', label: 'Monto USD' },
                    { key: 'montoVES', label: 'Monto Bs' },
                    { key: 'estado', label: 'Estado' },
                    { key: 'fecha', label: 'Fecha' },
                ],
                filas: filas.map((f) => ({
                    numeroFactura: f.numeroFactura,
                    numeroGuia: f.numeroGuia,
                    cliente: f.cliente,
                    municipio: f.municipio,
                    chofer: this.capitalizar(f.chofer),
                    empresa: f.empresa,
                    montoUsd: `$${f.montoUsd.toFixed(2)}`,
                    montoVES: `${f.montoVES.toFixed(2)} Bs`,
                    estado: this.estadoLabel(f.estado),
                    fecha: f.fecha ? new Date(f.fecha).toLocaleDateString('es-VE') : '',
                })),
            });
        } finally {
            this.exportandoPdf.set(false);
        }
    }

    private subtituloRango(): string {
        const f = this.filtrosAplicados();
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
