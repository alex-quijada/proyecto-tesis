import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { TooltipModule } from 'primeng/tooltip';

import { CabeceraReporteComponent } from '../componentes-compartidos/cabecera-reporte.component';
import { FiltrosReporteComponent } from '../componentes-compartidos/filtros-reporte.component';
import { ReporteService } from '../services/reporte.service';
import { RutaService } from '../../rutas/services/ruta.service';
import { FiltrosReporte, OpcionFiltro } from '../utils/reporte.types';
import { exportarExcel } from '../utils/exportar-excel.util';
import { exportarPdf } from '../utils/exportar-pdf.util';
import { FacturaGuia, GuiaDespacho } from '../../rutas/data/rutas-mock';
import { CapitalizePipe } from '../../clientes/pipes/capitalize.pipe';
import { TipoIncidenciaPipe } from '@/app/shared/pipes/tipo-incidencia.pipe';

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
    tuvoIncidencia: boolean;
    incidenciaResuelta: boolean;
    incidenciaTipoPrincipal?: string;
    incidenciaDescripcionPrincipal?: string;
    incidenciaFotoPrincipal?: string;
    incidenciaChoferPrincipal?: string;
    incidenciasTotal: number;
    incidencias: {
        id_incidencia?: string;
        id_chofer?: string;
        nombre_chofer?: string;
        tipo?: string;
        descripcion?: string;
        foto?: string;
        hora_reporte?: string;
        recuperable?: boolean;
        resuelta?: boolean;
    }[];
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
        TooltipModule,
        CabeceraReporteComponent,
        FiltrosReporteComponent,
        CapitalizePipe,
        TipoIncidenciaPipe,
    ],
    templateUrl: './operaciones.component.html',
})
export class OperacionesComponent {
    private reporteService = inject(ReporteService);
    private rutaService = inject(RutaService);
    private readonly tipoIncidenciaPipe = new TipoIncidenciaPipe();

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
        { label: 'Incidencia pendiente', value: 'incidencia' },
        { label: 'Con incidencias (Todas)', value: 'con_incidencias' },
        { label: 'Incidencia resuelta (Entregada)', value: 'incidencia_resuelta' },
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
                (!f.idChofer ||
                    x.choferId === f.idChofer ||
                    x.incidencias?.some((inc) => inc.id_chofer === f.idChofer)) &&
                (!f.idMunicipio || x.municipioId === f.idMunicipio) &&
                (!f.idVehiculo || x.vehiculoId === f.idVehiculo) &&
                (!f.idEmpresa || x.empresaId === f.idEmpresa) &&
                (!f.estado ||
                    (f.estado === 'con_incidencias' && x.tuvoIncidencia) ||
                    (f.estado === 'incidencia_resuelta' && x.incidenciaResuelta) ||
                    (f.estado === 'incidencia' &&
                        (x.estado === 'incidencia' ||
                            (x.tuvoIncidencia && x.estado !== 'finalizado'))) ||
                    (f.estado === 'finalizado' && x.estado === 'finalizado') ||
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
                const incs = f.incidencias || [];
                const tieneInc =
                    incs.length > 0 || !!f.incidenciaTipo || f.idEstado === 'incidencia';
                const resuelta = tieneInc && f.idEstado === 'finalizado';
                const incPrincipal = incs[0];
                const tipoPrincipal =
                    incPrincipal?.tipo ||
                    f.incidenciaTipo ||
                    (f.idEstado === 'incidencia' ? 'INCIDENCIA' : undefined);
                const descPrincipal = incPrincipal?.descripcion || f.incidenciaDescripcion;
                const fotoPrincipal = incPrincipal?.foto || f.incidenciaFoto;
                const choferPrincipal = incPrincipal?.nombre_chofer || f.incidenciaChofer;

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
                    tuvoIncidencia: tieneInc,
                    incidenciaResuelta: resuelta,
                    incidenciaTipoPrincipal: tipoPrincipal,
                    incidenciaDescripcionPrincipal: descPrincipal,
                    incidenciaFotoPrincipal: fotoPrincipal,
                    incidenciaChoferPrincipal: choferPrincipal,
                    incidenciasTotal: incs.length || (tieneInc ? 1 : 0),
                    incidencias: incs,
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
            let incResueltas = 0;
            let incPendientes = 0;

            for (const f of filas) {
                const key = this.estadoLabel(f.estado);
                conteo.set(key, (conteo.get(key) || 0) + 1);
                if (f.tuvoIncidencia) {
                    if (f.incidenciaResuelta) {
                        incResueltas++;
                    } else {
                        incPendientes++;
                    }
                }
            }

            const items = [...conteo.entries()].map(([estado, cantidad]) => ({
                estado,
                cantidad,
            }));

            if (incResueltas > 0) {
                items.push({ estado: 'Incidencia resuelta', cantidad: incResueltas });
            }
            if (incPendientes > 0 && !conteo.has('Incidencia')) {
                items.push({ estado: 'Incidencia pendiente', cantidad: incPendientes });
            }

            return items;
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
            case 'Incidencia pendiente':
            case 'Cancelado':
            case 'Cancelada':
                return 'danger';
            case 'Incidencia resuelta':
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

    tooltipIncidencia(f: FilaOperacion): string {
        const partes: string[] = [];
        if (f.incidenciasTotal > 1) {
            partes.push(`${f.incidenciasTotal} incidencias registradas`);
        }
        partes.push(
            f.incidenciaResuelta
                ? 'Estado: Resuelta y entregada con éxito'
                : 'Estado: Incidencia pendiente / no completada',
        );
        if (f.incidenciaChoferPrincipal) {
            partes.push(`Reportada por: ${f.incidenciaChoferPrincipal}`);
        }
        if (f.incidenciaDescripcionPrincipal) {
            partes.push(`Motivo: "${f.incidenciaDescripcionPrincipal}"`);
        }
        return partes.join(' · ');
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
                    { key: 'incidencia', label: 'Incidencia' },
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
                    incidencia: f.tuvoIncidencia
                        ? `${this.tipoIncidenciaPipe.transform(f.incidenciaTipoPrincipal) || 'Incidencia'} (${f.incidenciaResuelta ? 'Resuelta' : 'Pendiente'})${f.incidenciaChoferPrincipal ? ' [Reportada por: ' + this.capitalizar(f.incidenciaChoferPrincipal) + ']' : ''}${f.incidenciaDescripcionPrincipal ? ' - ' + f.incidenciaDescripcionPrincipal : ''}`
                        : '—',
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
                columnWidths: [6, 5, 11, 7, 7, 6, 6, 6, 6, 8, 6],
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
                    { key: 'incidencia', label: 'Incidencia' },
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
                    incidencia: f.tuvoIncidencia
                        ? `${this.tipoIncidenciaPipe.transform(f.incidenciaTipoPrincipal) || 'Incidencia'} (${f.incidenciaResuelta ? 'Res.' : 'Pend.'})${f.incidenciaChoferPrincipal ? ' [Por: ' + this.capitalizar(f.incidenciaChoferPrincipal) + ']' : ''}`
                        : '—',
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
