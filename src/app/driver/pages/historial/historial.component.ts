import { Component, inject, signal, computed, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';

import { DriverStoreService } from '../../services/driver-store.service';
import { AuthService } from '@/app/auth/service/auth.service';
import { ViajeService } from '@/app/services/viaje.service';
import { ViajeAdmin } from '@/app/services/viaje.types';
import {
    IncidenciaDialogComponent,
    IncidenciaGuia,
    IncidenciaDatos,
} from '../../components/incidencia-dialog/incidencia-dialog.component';
import { TipoIncidenciaPipe } from '@/app/shared/pipes/tipo-incidencia.pipe';

type FiltroTipo = 'todas' | 'finalizadas' | 'incidencias';

interface ViajeHistorial {
    viaje: ViajeAdmin;
    paradas: ViajeAdmin['paradas'][number][];
}

@Component({
    selector: 'app-historial',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        TooltipModule,
        TagModule,
        SkeletonModule,
        TableModule,
        SelectModule,
        SelectButtonModule,
        IncidenciaDialogComponent,
        TipoIncidenciaPipe,
    ],
    templateUrl: './historial.component.html',
})
export class HistorialComponent implements OnInit {
    store = inject(DriverStoreService);
    private authService = inject(AuthService);
    private viajeService = inject(ViajeService);

    cargando = signal(true);
    private viajes = signal<ViajeAdmin[]>([]);

    filtroTipo = signal<FiltroTipo>('todas');
    filtroMunicipio = signal<string>('');

    readonly tipoOpciones = [
        { label: 'Todas', value: 'todas' },
        { label: 'Finalizadas', value: 'finalizadas' },
        { label: 'Incidencias', value: 'incidencias' },
    ];

    /** Municipios disponibles de todas las paradas del historial. */
    readonly municipiosDisponibles = computed<string[]>(() => {
        const set = new Set<string>();
        for (const v of this.viajes()) {
            for (const p of v.paradas || []) {
                if (p.municipio) set.add(p.municipio);
            }
        }
        return Array.from(set).sort();
    });

    /**
     * Historial: viaje actual primero (solo facturas finalizadas o con
     * incidencia), luego viajes finalizados. Aplica filtro de estado y municipio.
     */
    readonly historial = computed<ViajeHistorial[]>(() => {
        const actuales = this.viajes().filter(
            (v) => v.estado === 'proceso' || v.estado === 'programado',
        );
        const finalizados = this.viajes().filter((v) => v.estado === 'finalizado');
        const lista = [...actuales, ...finalizados];
        const municipio = this.filtroMunicipio();
        const tipo = this.filtroTipo();

        return lista
            .map((viaje) => {
                let paradas = viaje.paradas || [];
                // En el viaje actual solo se muestran facturas finalizadas o con incidencia.
                if (this.esViajeActual(viaje)) {
                    paradas = paradas.filter(
                        (p) =>
                            p.estado_factura === 'finalizado' || p.estado_factura === 'incidencia',
                    );
                }
                // Filtro por municipio.
                if (municipio) {
                    paradas = paradas.filter((p) => p.municipio === municipio);
                }
                // Filtro por estado.
                if (tipo === 'finalizadas') {
                    paradas = paradas.filter((p) => p.estado_factura === 'finalizado');
                } else if (tipo === 'incidencias') {
                    paradas = paradas.filter((p) => p.incidencias?.length || p.incidencia_tipo);
                }
                return { viaje, paradas };
            })
            .filter((h) => h.paradas.length > 0);
    });

    esViajeActual(v: ViajeAdmin): boolean {
        return v.estado === 'proceso' || v.estado === 'programado';
    }

    /**
     * Se puede reportar incidencia sobre facturas del viaje en curso,
     * incluidas las ya finalizadas (el chofer se dio cuenta después).
     */
    esReportable(v: ViajeAdmin, p: ViajeAdmin['paradas'][number]): boolean {
        return this.esViajeActual(v) && p.estado_factura !== 'incidencia';
    }

    /** Factura (por id) actualmente expandida en el historial. Una a la vez. */
    readonly facturaExpandida = signal<string | null>(null);

    /** Historial de estados por viaje (cronograma del desplegable). */
    readonly historialFactura = signal<
        | {
              idViaje: string;
              estadoViaje: string;
              fechaViaje: string;
              transiciones: { estado: string; observacion?: string; fecha: string }[];
          }[]
        | null
    >(null);
    cargandoHistorialFactura = signal(false);

    toggleFactura(id: string) {
        const nueva = this.facturaExpandida() === id ? null : id;
        this.facturaExpandida.set(nueva);
        if (nueva) {
            const [idViaje, idFactura] = id.split(':');
            if (idViaje && idFactura) void this.cargarHistorialFactura(idViaje, idFactura);
        }
    }

    private async cargarHistorialFactura(idViaje: string, idFactura: string) {
        this.cargandoHistorialFactura.set(true);
        this.historialFactura.set(null);
        try {
            // 1) Viajes donde aparece la factura (con sus rangos temporales).
            const viajesRes = await this.authService.client
                .from('itinerario_viaje')
                .select(
                    `id_viaje, viajes!itinerario_id_viaje_fkey (id_viaje, fecha_creacion, fecha_finalizacion, estado)`,
                )
                .eq('id_factura', idFactura);
            if (viajesRes.error) throw viajesRes.error;

            // 2) Historial de estados de la factura.
            const histRes = await this.authService.client
                .from('historial_estados_factura')
                .select(`id_estado_nuevo (nombre_estado), observacion, fecha_cambio`)
                .eq('id_factura', idFactura)
                .order('fecha_cambio', { ascending: true });
            if (histRes.error) throw histRes.error;

            const viajes = (viajesRes.data || []) as any[];
            const transiciones = (histRes.data || []).map((r: any) => ({
                estado: r.id_estado_nuevo?.nombre_estado || '',
                observacion: r.observacion,
                fecha: r.fecha_cambio,
            }));

            // Agrupar las transiciones por viaje según su rango temporal:
            // cada transición pertenece al viaje cuyo [fecha_creacion, cierre]
            // contiene su fecha_cambio. Si no encaja, al viaje con la creación
            // anterior más cercana.
            const grupos = new Map<
                string,
                {
                    idViaje: string;
                    estadoViaje: string;
                    fechaViaje: string;
                    transiciones: typeof transiciones;
                }
            >();
            for (const v of viajes) {
                const viaje = v.viajes;
                if (!viaje) continue;
                const id = viaje.id_viaje;
                grupos.set(id, {
                    idViaje: id,
                    estadoViaje: viaje.estado,
                    fechaViaje: viaje.fecha_creacion,
                    transiciones: [],
                });
            }

            for (const t of transiciones) {
                const fechaT = new Date(t.fecha).getTime();
                let asignado: { idViaje: string; fechaCreacion: number } | null = null;
                for (const v of viajes) {
                    const viaje = v.viajes;
                    if (!viaje) continue;
                    const inicio = new Date(viaje.fecha_creacion).getTime();
                    const cierre = viaje.fecha_finalizacion
                        ? new Date(viaje.fecha_finalizacion).getTime()
                        : Infinity;
                    if (fechaT >= inicio && fechaT <= cierre) {
                        if (!asignado || inicio > asignado.fechaCreacion) {
                            asignado = { idViaje: viaje.id_viaje, fechaCreacion: inicio };
                        }
                    }
                }
                if (!asignado) {
                    // Fallback: viaje con la creación anterior más cercana.
                    let mejor: { idViaje: string; fechaCreacion: number } | null = null;
                    for (const v of viajes) {
                        const viaje = v.viajes;
                        if (!viaje) continue;
                        const inicio = new Date(viaje.fecha_creacion).getTime();
                        if (inicio <= fechaT && (!mejor || inicio > mejor.fechaCreacion)) {
                            mejor = { idViaje: viaje.id_viaje, fechaCreacion: inicio };
                        }
                    }
                    asignado = mejor;
                }
                const grupo = asignado ? grupos.get(asignado.idViaje) : undefined;
                if (grupo) grupo.transiciones.push(t);
            }

            // Mostrar SOLO el cronograma del viaje donde se está expandiendo.
            const grupoActual = grupos.get(idViaje);
            this.historialFactura.set(grupoActual ? [grupoActual] : []);
        } catch (err) {
            console.error('Error cargando historial de la factura:', err);
        } finally {
            this.cargandoHistorialFactura.set(false);
        }
    }

    incidenciaGuia = signal<ViajeAdmin['paradas'][number] | null>(null);

    @ViewChild(IncidenciaDialogComponent) private incidenciaDialog!: IncidenciaDialogComponent;

    constructor() {}

    async ngOnInit() {
        await this.cargar();
    }

    async cargar() {
        this.cargando.set(true);
        try {
            const uid = this.authService.getCurrentUser()?.id;
            if (uid) {
                this.viajes.set(await this.viajeService.obtenerViajesChofer(uid));
            }
        } catch (err) {
            console.error('Error cargando historial de entregas:', err);
        } finally {
            this.cargando.set(false);
        }
    }

    setFiltroTipo(v: string) {
        this.filtroTipo.set(v as FiltroTipo);
    }

    esRecuperable(p: ViajeAdmin['paradas'][number]): boolean {
        return p.incidencia_recuperable === true;
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
            default:
                return estado || '—';
        }
    }

    cronogramaColor(estado: string): string {
        switch (estado) {
            case 'finalizado':
                return '#10b981';
            case 'incidencia':
                return '#ef4444';
            case 'entrega':
                return '#06b6d4';
            case 'espera':
                return '#f59e0b';
            case 'proceso':
                return '#3b82f6';
            case 'embarque':
                return '#8b5cf6';
            default:
                return '#94a3b8';
        }
    }

    formatFecha(fecha?: string | null): string {
        if (!fecha) return '—';
        return new Date(fecha).toLocaleString('es-VE', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    abrirIncidencia(p: ViajeAdmin['paradas'][number]) {
        this.incidenciaGuia.set(p);
        if (this.incidenciaDialog) {
            this.incidenciaDialog.guia = this.incidenciaGuiaData;
            this.incidenciaDialog.open();
        }
    }

    get incidenciaGuiaData(): IncidenciaGuia | null {
        const p = this.incidenciaGuia();
        return p
            ? {
                  cliente: p.nombre_cliente || '',
                  numeroGuia: p.codigo_guia || '',
                  numeroFactura: p.numero_factura || '',
              }
            : null;
    }

    cerrarIncidencia() {
        this.incidenciaGuia.set(null);
    }

    async onIncidenciaConfirmada(datos: IncidenciaDatos) {
        const p = this.incidenciaGuia();
        if (!p) return;
        try {
            await this.store.reportarIncidencia(p.id_factura, datos.incidencias);
            await this.cargar();
        } finally {
            this.cerrarIncidencia();
        }
    }
}
