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
    template: `
        <div class="card">
            <app-cabecera-reporte
                titulo="Reporte de Operaciones"
                subtitulo="Detalle de entregas por guía y factura"
                [sinDatos]="filasFiltradas().length === 0"
                [recargando]="cargando()"
                [exportandoExcel]="exportandoExcel()"
                [exportandoPdf]="exportandoPdf()"
                [mostrarPdf]="false"
                (recargar)="cargarDatos()"
                (exportarExcel)="exportarExcel()"
                (exportarPdf)="exportarPdf()"
            />

            <app-filtros-reporte
                [choferes]="choferes()"
                [municipios]="municipios()"
                [vehiculos]="vehiculos()"
                [empresas]="empresas()"
                [(filtros)]="filtros"
                (aplicar)="aplicarFiltros()"
            />

            @if (cargando()) {
                <div class="flex flex-col gap-3">
                    <p-skeleton height="2rem" borderRadius="0.5rem" />
                    @for (_ of [1, 2, 3, 4, 5]; track $index) {
                        <div
                            class="flex gap-4 p-4 border border-surface-200 dark:border-surface-700 rounded-lg"
                        >
                            <p-skeleton width="6rem" height="1.5rem" />
                            <p-skeleton width="6rem" height="1.5rem" />
                            <p-skeleton width="10rem" height="1.5rem" />
                            <p-skeleton width="7rem" height="1.5rem" />
                            <p-skeleton width="9rem" height="1.5rem" />
                            <p-skeleton width="6rem" height="1.5rem" />
                            <p-skeleton width="8rem" height="1.5rem" />
                            <p-skeleton width="6rem" height="1.5rem" />
                            <p-skeleton width="7rem" height="1.5rem" />
                            <p-skeleton width="5rem" height="1.5rem" />
                            <p-skeleton width="6rem" height="1.5rem" />
                        </div>
                    }
                </div>
            } @else if (filasFiltradas().length === 0) {
                <div class="text-center py-16 text-muted-color">
                    <i class="pi pi-box text-4xl block mb-3"></i>
                    <span class="text-lg font-semibold"
                        >Sin entregas para el rango seleccionado</span
                    >
                </div>
            } @else {
                <!-- Resumen por estado: chips alineados con la barra de filtros -->
                <div
                    class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/40 px-4 py-2.5 mb-4 flex flex-wrap items-center gap-2"
                >
                    <span class="text-xs font-semibold text-surface-500 uppercase mr-1">
                        Por estado:
                    </span>
                    @for (r of resumenEstados(); track r.estado) {
                        <p-tag
                            [value]="r.estado + ' · ' + r.cantidad"
                            [severity]="estadoSeverityPorLabel(r.estado)"
                            styleClass="text-xs"
                        />
                    }
                </div>

                <p-table
                    #dt
                    [value]="filasFiltradas()"
                    dataKey="numeroFactura"
                    [rows]="15"
                    [paginator]="true"
                    [rowsPerPageOptions]="[15, 30, 50]"
                    [globalFilterFields]="[
                        'numeroFactura',
                        'numeroGuia',
                        'cliente',
                        'municipio',
                        'chofer',
                        'placaVehiculo',
                        'empresa',
                    ]"
                    [tableStyle]="{ 'min-width': '70rem' }"
                >
                    <ng-template #caption>
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <span class="font-semibold">
                                {{ filasFiltradas().length }} facturas
                            </span>
                            <p-iconfield>
                                <p-inputicon styleClass="pi pi-search" />
                                <input
                                    pInputText
                                    type="text"
                                    (input)="dt.filterGlobal($any($event.target).value, 'contains')"
                                    placeholder="Buscar..."
                                />
                            </p-iconfield>
                        </div>
                    </ng-template>
                    <ng-template #header>
                        <tr>
                            <th>Factura</th>
                            <th>Guía</th>
                            <th>Cliente</th>
                            <th>Municipio</th>
                            <th>Chofer</th>
                            <th>Placa</th>
                            <th>Empresa</th>
                            <th>Monto USD</th>
                            <th>Monto Bs</th>
                            <th>Estado</th>
                            <th>Fecha</th>
                        </tr>
                    </ng-template>
                    <ng-template #body let-f>
                        <tr>
                            <td class="font-mono text-sm">{{ f.numeroFactura }}</td>
                            <td class="font-mono text-sm">{{ f.numeroGuia }}</td>
                            <td class="font-medium">{{ f.cliente }}</td>
                            <td class="text-surface-500">{{ f.municipio || '—' }}</td>
                            <td class="text-sm">{{ f.chofer | capitalize }}</td>
                            <td class="text-sm font-mono">{{ f.placaVehiculo || '—' }}</td>
                            <td class="text-sm">{{ f.empresa || '—' }}</td>
                            <td class="font-mono">
                                {{ f.montoUsd | currency: 'USD' : 'symbol' : '1.2-2' }}
                            </td>
                            <td class="font-mono">{{ f.montoVES | number: '1.2-2' }} Bs</td>
                            <td>
                                <p-tag
                                    [value]="estadoLabel(f.estado)"
                                    [severity]="estadoSeverity(f.estado)"
                                />
                            </td>
                            <td class="text-sm text-surface-500">{{ formatFecha(f.fecha) }}</td>
                        </tr>
                    </ng-template>
                    <ng-template #emptymessage>
                        <tr>
                            <td colspan="11" class="text-center py-6 text-surface-400">
                                No hay facturas que coincidan.
                            </td>
                        </tr>
                    </ng-template>
                </p-table>
            }
        </div>
    `,
})
export class OperacionesComponent {
    private reporteService = inject(ReporteService);
    private rutaService = inject(RutaService);

    cargando = signal(true);
    guias = signal<GuiaDespacho[]>([]);
    filtros = signal<FiltrosReporte>({});
    choferes = signal<OpcionFiltro[]>([]);
    municipios = signal<OpcionFiltro[]>([]);
    vehiculos = signal<OpcionFiltro[]>([]);
    empresas = signal<OpcionFiltro[]>([]);
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
        const f = this.filtros();
        return this.mapearConIds().filter(
            (x) =>
                this.enRango(x.fecha, f) &&
                (!f.idChofer || x.choferId === f.idChofer) &&
                (!f.idMunicipio || x.municipioId === f.idMunicipio) &&
                (!f.idVehiculo || x.vehiculoId === f.idVehiculo) &&
                (!f.idEmpresa || x.empresaId === f.idEmpresa) &&
                (!f.estado || x.estado === f.estado),
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
        void this.cargarDatos();
    }

    estadoSeverity(estado: string): 'success' | 'danger' | 'warn' | 'info' | 'secondary' {
        switch (estado) {
            case 'finalizado':
                return 'success';
            case 'incidencia':
                return 'danger';
            case 'entrega':
            case 'espera':
                return 'warn';
            case 'proceso':
                return 'info';
            case 'embarque':
                return 'info';
            default:
                return 'secondary';
        }
    }

    estadoSeverityPorLabel(label: string): 'success' | 'danger' | 'warn' | 'info' | 'secondary' {
        switch (label) {
            case 'Entregado':
                return 'success';
            case 'Incidencia':
                return 'danger';
            case 'Entregando':
            case 'En espera':
                return 'warn';
            case 'En camino':
                return 'info';
            case 'En carga':
                return 'info';
            case 'Nuevo':
                return 'secondary';
            default:
                return 'secondary';
        }
    }

    estadoLabel(estado: string): string {
        switch (estado) {
            case 'finalizado':
                return 'Entregado';
            case 'incidencia':
                return 'Incidencia';
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
                columnWidths: [6, 5, 13, 7, 9, 9, 7, 6, 6],
                columnas: [
                    { key: 'numeroFactura', label: 'Factura' },
                    { key: 'numeroGuia', label: 'Guía' },
                    { key: 'cliente', label: 'Cliente' },
                    { key: 'municipio', label: 'Municipio' },
                    { key: 'chofer', label: 'Chofer' },
                    { key: 'empresa', label: 'Empresa' },
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
                    montoVES: f.montoVES.toFixed(2),
                    estado: this.estadoLabel(f.estado),
                    fecha: f.fecha ? new Date(f.fecha).toLocaleDateString('es-VE') : '',
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
