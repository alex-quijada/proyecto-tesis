import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ConfirmationService } from 'primeng/api';
import { NotificationService } from '@/app/services/notification.service';

import {
    ViajeService,
    TrazaViajePunto,
    TiemposViaje,
    HistorialViajeRow,
} from '@/app/services/viaje.service';
import { AuthService } from '@/app/auth/service/auth.service';
import { ViajeAdmin, IncidenciaParada } from '@/app/services/viaje.types';
import { TipoIncidenciaPipe } from '@/app/shared/pipes/tipo-incidencia.pipe';
import { MetricasDesvio, calcularMetricasDesvio } from './devios.util';
import { environment } from '@/environments/environment';

interface HistorialParada {
    idFactura: string;
    numeroFactura: string;
    numeroGuia: string;
    cliente: string;
    municipio: string;
    estado: string;
    incidenciaTipo?: string;
    incidenciaDescripcion?: string;
    incidenciaFoto?: string;
    incidenciaFecha?: string;
    incidenciaRecuperable?: boolean;
    incidencias?: IncidenciaParada[];
    telefono?: string;
    direccion?: string;
    montoDolares?: number | null;
    referencia?: string | null;
    contacto?: string | null;
    notaSucursal?: string | null;
    horaDesde?: string | null;
    horaHasta?: string | null;
}

interface HistorialViaje {
    viaje: ViajeAdmin;
    paradas: HistorialParada[];
}

interface LineaTiempoItem {
    id: string;
    tipo: 'almacen' | 'salida' | 'proceso' | 'llegada' | 'entrega' | 'completado' | 'incidencia';
    label: string;
    numero?: number;
    icono?: string;
    color: string;
    fecha: Date | null;
    chip?: string | null;
    observacion?: string | null;
}

@Component({
    selector: 'app-historial-entregas',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TagModule,
        ButtonModule,
        SkeletonModule,
        TableModule,
        ConfirmDialogModule,
        ToastModule,
        TooltipModule,
        DatePickerModule,
        SelectModule,
        InputTextModule,
        IconFieldModule,
        InputIconModule,
        TipoIncidenciaPipe,
    ],
    providers: [ConfirmationService],
    templateUrl: './historial-entregas.component.html',
})
export class HistorialEntregasComponent implements OnInit {
    private viajeService = inject(ViajeService);
    private authService = inject(AuthService);
    private confirmationService = inject(ConfirmationService);
    private notif = inject(NotificationService);

    cargando = signal(true);
    private viajesFinalizados = signal<ViajeAdmin[]>([]);
    private incidenciasMap = new Map<string, any>();
    private tiemposMap = new Map<string, TiemposViaje>();
    eliminandoId = signal<string | null>(null);

    // ---------------- Línea de tiempo del viaje ----------------
    readonly lineaTiempoAbierta = signal<Record<string, boolean>>({});
    private historialViajeData = signal<Record<string, HistorialViajeRow[]>>({});
    private historialViajeCargando = signal<Record<string, boolean>>({});
    private historialViajeError = signal<Record<string, string>>({});

    // ---------------- Filtros ----------------
    textoBusqueda = signal('');
    filtroChofer = signal<string | null>(null);
    filtroMunicipio = signal<string | null>(null);
    filtroEstado = signal<string | null>(null);
    filtroFechaDesde = signal<string | null>(null);
    filtroFechaHasta = signal<string | null>(null);

    historial = computed<HistorialViaje[]>(() =>
        this.viajesFinalizados()
            .map((v) => ({ viaje: v, paradas: this.mapearParadas(v) }))
            .filter((h) => h.paradas.length > 0),
    );

    /** Opciones únicas para los selectores, derivadas de los viajes cargados. */
    readonly opcionesChoferes = computed(() => {
        const set = new Set<string>();
        for (const v of this.viajesFinalizados()) {
            if (v.chofer) set.add(v.chofer);
        }
        return [...set].sort().map((nombre) => ({ label: nombre, value: nombre }));
    });

    readonly opcionesMunicipios = computed(() => {
        const set = new Set<string>();
        for (const v of this.viajesFinalizados()) {
            for (const p of v.paradas || []) {
                if (p.municipio) set.add(p.municipio);
            }
        }
        return [...set].sort().map((nombre) => ({ label: nombre, value: nombre }));
    });

    readonly opcionesEstados = computed(() => {
        const set = new Set<string>();
        for (const v of this.viajesFinalizados()) {
            for (const p of v.paradas || []) {
                const label = this.estadoLabel(p.estado_factura || '');
                if (label && label !== '—') set.add(label);
            }
        }
        return [...set].sort().map((nombre) => ({ label: nombre, value: nombre }));
    });

    /** Historial filtrado por los criterios seleccionados. */
    readonly historialFiltrado = computed(() => {
        const texto = this.textoBusqueda().toLowerCase().trim();
        const chofer = this.filtroChofer();
        const municipio = this.filtroMunicipio();
        const estado = this.filtroEstado();
        const desde = this.filtroFechaDesde();
        const hasta = this.filtroFechaHasta();

        return this.historial().filter((h) => {
            if (chofer && h.viaje.chofer !== chofer) return false;
            if (desde || hasta) {
                const fecha = h.viaje.fecha_finalizacion || h.viaje.fecha_creacion || '';
                const iso = fecha ? new Date(fecha).toISOString().slice(0, 10) : '';
                if (desde && iso < desde) return false;
                if (hasta && iso > hasta) return false;
            }
            if (municipio || estado || texto) {
                const match = h.paradas.some((p) => {
                    if (municipio && p.municipio !== municipio) return false;
                    if (estado && this.estadoLabel(p.estado) !== estado) return false;
                    if (texto) {
                        const campo =
                            `${p.cliente} ${p.numeroFactura} ${p.numeroGuia} ${p.municipio} ${h.viaje.chofer} ${h.viaje.placa_vehiculo}`.toLowerCase();
                        if (!campo.includes(texto)) return false;
                    }
                    return true;
                });
                if (!match) return false;
            }
            return true;
        });
    });

    constructor() {}

    async ngOnInit() {
        try {
            const [viajes, incidencias, tiempos] = await Promise.all([
                this.viajeService.obtenerViajes(),
                this.authService.client
                    .from('incidencias')
                    .select(
                        'id_detalle_fact, tipo_incidencia, descripcion, foto_evidencia_url, hora_reporte',
                    )
                    .order('hora_reporte', { ascending: false }),
                this.viajeService.obtenerTiemposViajes().catch(() => [] as TiemposViaje[]),
            ]);
            for (const inc of (incidencias.data || []) as any[]) {
                if (!this.incidenciasMap.has(inc.id_detalle_fact)) {
                    this.incidenciasMap.set(inc.id_detalle_fact, inc);
                }
            }
            this.tiemposMap.clear();
            for (const t of tiempos || []) {
                this.tiemposMap.set(t.id_viaje, t);
            }
            this.viajesFinalizados.set((viajes || []).filter((v) => v.estado === 'finalizado'));
        } catch (err) {
            console.error('Error cargando historial de entregas:', err);
        } finally {
            this.cargando.set(false);
        }
    }

    private mapearParadas(v: ViajeAdmin): HistorialParada[] {
        return (v.paradas || []).map((p) => {
            const inc = this.incidenciasMap.get(p.id_factura);
            return {
                idFactura: p.id_factura,
                numeroFactura: p.numero_factura || '',
                numeroGuia: p.codigo_guia || '',
                cliente: p.nombre_cliente || '—',
                municipio: p.municipio || '',
                estado: p.estado_factura || '',
                incidenciaTipo: inc?.tipo_incidencia,
                incidenciaDescripcion: inc?.descripcion,
                incidenciaFoto: inc?.foto_evidencia_url,
                incidenciaFecha: inc?.hora_reporte,
                incidenciaRecuperable: p.incidencia_recuperable,
                incidencias: p.incidencias,
                telefono: p.telefono ?? undefined,
                direccion: p.direccion,
                montoDolares: p.monto_dolares,
                referencia: p.referencia,
                contacto: p.contacto,
                notaSucursal: p.nota_sucursal,
                horaDesde: p.hora_desde,
                horaHasta: p.hora_hasta,
            };
        });
    }

    /** Filas (facturas) expandidas en el historial. Una a la vez. */
    readonly filaExpandida = signal<Record<string, boolean>>({});

    toggleFila(id: string) {
        this.filaExpandida.update((mapa) => (mapa[id] ? {} : { [id]: true }));
    }

    onRangoFechas(rango: (Date | null)[] | null) {
        this.filtroFechaDesde.set(rango?.[0] ? this.toISO(rango[0]) : null);
        this.filtroFechaHasta.set(rango?.[1] ? this.toISO(rango[1]) : null);
    }

    onRangoFechasEvento(evento: unknown) {
        const rango = Array.isArray(evento) ? (evento as (Date | null)[]) : null;
        this.onRangoFechas(rango);
    }

    private toISO(d: Date): string {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
            d.getDate(),
        ).padStart(2, '0')}`;
    }

    limpiarFiltros() {
        this.textoBusqueda.set('');
        this.filtroChofer.set(null);
        this.filtroMunicipio.set(null);
        this.filtroEstado.set(null);
        this.filtroFechaDesde.set(null);
        this.filtroFechaHasta.set(null);
    }

    esRecuperable(p: HistorialParada): boolean {
        return p.incidenciaRecuperable === true;
    }

    readonly togglingRecuperableId = signal<string | null>(null);

    async toggleRecuperable(inc: IncidenciaParada) {
        if (!inc.id_incidencia || this.togglingRecuperableId()) return;
        this.togglingRecuperableId.set(inc.id_incidencia);
        const objetivo = inc.recuperable === true ? false : true;
        try {
            await this.viajeService.setIncidenciaRecuperable(inc.id_incidencia, objetivo);
            this.notif.add({
                severity: 'success',
                summary: objetivo ? 'Re-despachable' : 'Terminal',
                detail: `Incidencia marcada como ${objetivo ? 'recuperable' : 'no recuperable'}.`,
            });
            await this.ngOnInit();
        } catch (err: any) {
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo cambiar la incidencia.',
            });
        } finally {
            this.togglingRecuperableId.set(null);
        }
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

    formatFecha(fecha?: string | null): string {
        if (!fecha) return '—';
        return new Date(fecha).toLocaleString('es-VE', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    // ---------------- Tiempos por viaje ----------------

    tiemposDeViaje(idViaje: string): TiemposViaje | undefined {
        return this.tiemposMap.get(idViaje);
    }

    /** Formatea minutos a "Xh Ym" (o solo minutos si < 60). */
    formatoMinutos(min?: number): string {
        if (min == null) return '—';
        const m = Math.round(min);
        if (m < 60) return `${m} min`;
        const h = Math.floor(m / 60);
        const resto = m % 60;
        return resto ? `${h}h ${resto}m` : `${h}h`;
    }

    readonly ESTADOS_TIEMPO: { key: keyof TiemposViaje['minutos_por_estado']; label: string }[] = [
        { key: 'embarque', label: 'Carga' },
        { key: 'proceso', label: 'Traslado' },
        { key: 'espera', label: 'Espera' },
        { key: 'entrega', label: 'Entrega' },
        { key: 'incidencia', label: 'Incidencia' },
    ];

    tiempoEstado(t: TiemposViaje, key: keyof TiemposViaje['minutos_por_estado']): number {
        return t?.minutos_por_estado?.[key] ?? 0;
    }

    // ---------------- Línea de tiempo del viaje (recorrido de inicio a fin) ----------------

    toggleLineaTiempo(idViaje: string) {
        const abierto = !this.lineaTiempoAbierta()[idViaje];
        this.lineaTiempoAbierta.update((mapa) => ({ ...mapa, [idViaje]: abierto }));
        if (abierto) {
            void this.cargarHistorialViaje(idViaje);
        } else {
            this.historialViajeData.update((m) => {
                const n = { ...m };
                delete n[idViaje];
                return n;
            });
            this.historialViajeError.update((m) => {
                const n = { ...m };
                delete n[idViaje];
                return n;
            });
        }
    }

    cargandoLineaTiempo(idViaje: string): boolean {
        return this.historialViajeCargando()[idViaje] ?? false;
    }

    errorLineaTiempo(idViaje: string): string {
        return this.historialViajeError()[idViaje] ?? '';
    }

    lineaTiempo(idViaje: string): LineaTiempoItem[] {
        const rows = this.historialViajeData()[idViaje] ?? [];
        const viaje = this.viajesFinalizados().find((v) => v.id_viaje === idViaje);
        return this.construirLineaTiempo(rows, viaje);
    }

    private async cargarHistorialViaje(idViaje: string) {
        if (this.historialViajeData()[idViaje]) return;
        this.historialViajeCargando.update((m) => ({ ...m, [idViaje]: true }));
        this.historialViajeError.update((m) => ({ ...m, [idViaje]: '' }));
        try {
            const rows = await this.viajeService.obtenerHistorialViaje(idViaje);
            this.historialViajeData.update((m) => ({ ...m, [idViaje]: rows }));
        } catch (err: any) {
            this.historialViajeError.update((m) => ({
                ...m,
                [idViaje]: err?.message || 'No se pudo cargar el historial del viaje.',
            }));
        } finally {
            this.historialViajeCargando.update((m) => ({ ...m, [idViaje]: false }));
        }
    }

    /** Construye los hitos del recorrido del viaje (almacén → salida → paradas
     *  → fin) a partir del historial de estados de sus facturas. Para historial
     *  (viajes finalizados) todas las duraciones salen de timestamps reales. */
    private construirLineaTiempo(rows: HistorialViajeRow[], viaje?: ViajeAdmin): LineaTiempoItem[] {
        if (!rows.length) return [];
        const items: LineaTiempoItem[] = [];

        // Transiciones por factura, en orden cronológico (incluye re-entregas).
        const porFactura = new Map<
            string,
            { estado: string; fecha: Date; observacion?: string | null }[]
        >();
        for (const r of rows) {
            let lista = porFactura.get(r.id_factura);
            if (!lista) {
                lista = [];
                porFactura.set(r.id_factura, lista);
            }
            lista.push({
                estado: r.estado,
                fecha: new Date(r.fecha_cambio),
                observacion: r.observacion,
            });
        }
        for (const lista of porFactura.values()) {
            lista.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
        }

        const primeraGlobal = (estado: string): Date | null => {
            let mejor: Date | null = null;
            for (const lista of porFactura.values()) {
                const t = lista.find((x) => x.estado === estado);
                if (t && (!mejor || t.fecha.getTime() < mejor.getTime())) mejor = t.fecha;
            }
            return mejor;
        };

        const embarque = primeraGlobal('embarque');
        const proceso = primeraGlobal('proceso');

        items.push({
            id: 'almacen',
            tipo: 'almacen',
            label: 'Almacén — carga de mercancía',
            icono: 'pi pi-box',
            color: '#8b5cf6',
            fecha: embarque,
            chip:
                embarque && proceso
                    ? `Espera de carga: ${this.formatoDuracion(proceso.getTime() - embarque.getTime())}`
                    : null,
        });
        items.push({
            id: 'salida',
            tipo: 'salida',
            label: 'Salida del almacén — viaje iniciado',
            icono: 'pi pi-truck',
            color: '#3b82f6',
            fecha: proceso,
            chip: null,
        });

        // Paradas en orden de visita (de las filas del historial).
        const paradas = Array.from(new Map(rows.map((r) => [r.id_factura, r])).values()).sort(
            (a, b) => a.orden_visita - b.orden_visita,
        );

        for (const [idx, p] of paradas.entries()) {
            const numero = idx + 1;
            const transiciones = porFactura.get(p.id_factura) ?? [];
            if (!transiciones.length) continue;
            let contador = 0;
            for (let t = 0; t < transiciones.length; t++) {
                const trans = transiciones[t];
                const siguiente = transiciones[t + 1];
                switch (trans.estado) {
                    case 'proceso':
                        items.push({
                            id: `proceso-${p.id_factura}-${contador++}`,
                            tipo: 'proceso',
                            label: `En camino a ${p.nombre_cliente || '—'}`,
                            numero,
                            color: '#3b82f6',
                            fecha: trans.fecha,
                            chip: null,
                        });
                        break;
                    case 'espera':
                        items.push({
                            id: `llegada-${p.id_factura}-${contador++}`,
                            tipo: 'llegada',
                            label: `Llegada a ${p.nombre_cliente || '—'}`,
                            numero,
                            color: '#f59e0b',
                            fecha: trans.fecha,
                            chip: siguiente
                                ? `Espera: ${this.formatoDuracion(
                                      siguiente.fecha.getTime() - trans.fecha.getTime(),
                                  )}`
                                : null,
                        });
                        break;
                    case 'entrega':
                        items.push({
                            id: `entrega-${p.id_factura}-${contador++}`,
                            tipo: 'entrega',
                            label: `Entregando ${p.numero_factura} · ${p.nombre_cliente || '—'}`,
                            numero,
                            color: '#06b6d4',
                            fecha: trans.fecha,
                            chip: siguiente
                                ? `Entrega: ${this.formatoDuracion(
                                      siguiente.fecha.getTime() - trans.fecha.getTime(),
                                  )}`
                                : null,
                        });
                        break;
                    case 'finalizado':
                        items.push({
                            id: `finalizado-${p.id_factura}-${contador++}`,
                            tipo: 'completado',
                            label: `Entregado ${p.numero_factura} · ${p.nombre_cliente || '—'}`,
                            numero,
                            color: '#10b981',
                            fecha: trans.fecha,
                            chip: null,
                        });
                        break;
                    case 'incidencia':
                        items.push({
                            id: `incidencia-${p.id_factura}-${contador++}`,
                            tipo: 'incidencia',
                            label: `Incidencia — ${p.numero_factura} · ${p.nombre_cliente || '—'}`,
                            numero,
                            color: '#ef4444',
                            fecha: trans.fecha,
                            chip: null,
                            observacion: trans.observacion,
                        });
                        break;
                }
            }
        }

        items.push({
            id: 'completado',
            tipo: 'completado',
            label: 'Viaje completado',
            icono: 'pi pi-flag-fill',
            color: '#10b981',
            fecha: viaje?.fecha_finalizacion
                ? new Date(viaje.fecha_finalizacion)
                : primeraGlobal('finalizado'),
            chip: null,
        });

        return items;
    }

    /** Formatea milisegundos a "Xh Ym" (o solo minutos si < 60). */
    formatoDuracion(ms: number): string {
        if (ms < 60_000) return 'menos de 1 min';
        const min = Math.floor(ms / 60_000);
        if (min < 60) return `${min} min`;
        const h = Math.floor(min / 60);
        return `${h}h ${min % 60} min`;
    }

    duracionTotalViaje(v: ViajeAdmin): string {
        if (!v.fecha_creacion || !v.fecha_finalizacion) return '—';
        return this.formatoDuracion(
            new Date(v.fecha_finalizacion).getTime() - new Date(v.fecha_creacion).getTime(),
        );
    }

    /** Separa el prefijo "[CÓDIGO]" de la observación de incidencia para poder
     *  mostrar el tipo con el pipe `tipoIncidencia` y el comentario aparte. */
    incidenciaObservacion(item: LineaTiempoItem): { codigo: string | null; texto: string } {
        const obs = item.observacion || '';
        const match = obs.match(/^\[([^\]]+)\]\s*(.*)$/s);
        if (match) {
            return { codigo: match[1] || null, texto: match[2] || '' };
        }
        return { codigo: null, texto: obs };
    }

    /** Pide confirmación y borra el viaje (para pruebas). */
    borrarViaje(v: ViajeAdmin) {
        this.confirmationService.confirm({
            message: `¿Borrar el viaje de ${v.chofer || 'Chofer'}? Se eliminarán el viaje, el historial de estados, las incidencias y sus fotos. Esto es irreversible (para pruebas).`,
            header: 'Borrar viaje',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Borrar',
            acceptIcon: 'pi pi-trash',
            rejectLabel: 'Cancelar',
            acceptButtonStyleClass: 'p-button-danger',
            accept: () => void this.confirmarBorrar(v),
        });
    }

    private async confirmarBorrar(v: ViajeAdmin) {
        if (this.eliminandoId()) return;
        this.eliminandoId.set(v.id_viaje);
        try {
            const res = await this.viajeService.eliminarViaje(v.id_viaje);
            if (res.fotos_eliminadas?.length) {
                await this.viajeService
                    .borrarFotosIncidencia(res.fotos_eliminadas)
                    .catch((err) =>
                        console.warn('No se pudieron borrar fotos de incidencia del storage', err),
                    );
            }
            this.viajesFinalizados.update((lista) =>
                lista.filter((x) => x.id_viaje !== v.id_viaje),
            );
            this.notif.add({
                severity: 'success',
                summary: 'Viaje borrado',
                detail: 'El viaje y sus datos asociados se eliminaron.',
            });
        } catch (err: any) {
            console.error('Error al borrar viaje', err);
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo borrar el viaje.',
            });
        } finally {
            this.eliminandoId.set(null);
        }
    }

    // ---------------- Análisis de ruta (planificada vs real) ----------------

    /** Viajes con el acordeón de análisis abierto. */
    readonly analisisAbierto = signal<Record<string, boolean>>({});

    toggleAnalisis(idViaje: string) {
        const abierto = !this.analisisAbierto()[idViaje];
        this.analisisAbierto.update((mapa) => ({ ...mapa, [idViaje]: abierto }));
        if (abierto) void this.cargarAnalisis(idViaje);
        else this.limpiarMapaAnalisis(idViaje);
    }

    private trazas = new Map<string, TrazaViajePunto[]>();
    private metricas = new Map<string, MetricasDesvio | null>();
    private analisisCargando = new Map<string, boolean>();
    private analisisError = new Map<string, string>();

    cargandoAnalisis(idViaje: string): boolean {
        return this.analisisCargando.get(idViaje) ?? false;
    }

    errorAnalisis(idViaje: string): string {
        return this.analisisError.get(idViaje) ?? '';
    }

    metricasAnalisis(idViaje: string): MetricasDesvio | null {
        return this.metricas.get(idViaje) ?? null;
    }

    trazaAnalisis(idViaje: string): TrazaViajePunto[] {
        return this.trazas.get(idViaje) ?? [];
    }

    private async cargarAnalisis(idViaje: string) {
        if (this.trazas.has(idViaje)) return;
        this.analisisCargando.set(idViaje, true);
        this.analisisError.set(idViaje, '');
        try {
            const traza = await this.viajeService.obtenerTrazaViaje(idViaje);
            this.trazas.set(idViaje, traza);
            const viaje = this.viajesFinalizados().find((v) => v.id_viaje === idViaje);
            const planeada = viaje?.ruta_detallada?.path ?? [];
            this.metricas.set(idViaje, calcularMetricasDesvio(traza, planeada));
            // Inicializar el mapa comparativo una vez que el div esté en el DOM.
            setTimeout(() => this.initMapaPorId(idViaje), 150);
        } catch (err: any) {
            this.analisisError.set(idViaje, err?.message || 'No se pudo cargar la traza.');
        } finally {
            this.analisisCargando.set(idViaje, false);
        }
    }

    private initMapaPorId(idViaje: string) {
        const el = document.getElementById(`mapa-analisis-${idViaje}`);
        if (el) this.initMapaAnalisis(idViaje, el);
    }

    // ---------------- Mapa comparativo ----------------

    private mapas = new Map<string, google.maps.Map>();
    private polylinesMapas = new Map<
        string,
        { planeada: google.maps.Polyline; real: google.maps.Polyline }
    >();

    initMapaAnalisis(idViaje: string, el: HTMLElement) {
        if (this.mapas.has(idViaje)) return;
        if (!el) return;
        if (el.clientHeight === 0) {
            // Aún no renderizado: reintentar en el siguiente frame.
            setTimeout(() => {
                const actual = document.getElementById(`mapa-analisis-${idViaje}`);
                if (actual) this.initMapaAnalisis(idViaje, actual);
            }, 200);
            return;
        }
        const mapa = new google.maps.Map(el, {
            center: { lat: environment.warehouseLat, lng: environment.warehouseLng },
            zoom: 11,
            mapId: 'seguimiento',
            disableDefaultUI: true,
        });
        this.mapas.set(idViaje, mapa);
        google.maps.event.addListenerOnce(mapa, 'idle', () => {
            const traza = this.trazas.get(idViaje) ?? [];
            const viaje = this.viajesFinalizados().find((v) => v.id_viaje === idViaje);
            const planeada = viaje?.ruta_detallada?.path ?? [];

            const realPath = traza
                .filter((t) => t.latitud != null && t.longitud != null)
                .map((t) => ({ lat: t.latitud, lng: t.longitud }));
            const planeadaPath = planeada.map((p) => ({ lat: p.lat, lng: p.lng }));

            const polylineReal = new google.maps.Polyline({
                path: realPath,
                strokeColor: '#ef4444',
                strokeWeight: 4,
                strokeOpacity: 0.9,
                map: mapa,
            });
            const polylinePlaneada = new google.maps.Polyline({
                path: planeadaPath,
                strokeColor: '#3b82f6',
                strokeWeight: 3,
                strokeOpacity: 0.9,
                map: mapa,
            });
            this.polylinesMapas.set(idViaje, {
                planeada: polylinePlaneada,
                real: polylineReal,
            });

            // Almacén (morado) + paradas (números).
            this.agregarMarcadorAlmacen(mapa);
            this.agregarMarcadoresParadas(mapa, viaje);

            // Encuadre que abarque ambas rutas.
            const bounds = new google.maps.LatLngBounds();
            for (const p of planeadaPath) bounds.extend(p);
            for (const p of realPath) bounds.extend(p);
            bounds.extend({ lat: environment.warehouseLat, lng: environment.warehouseLng });
            if (!bounds.isEmpty()) mapa.fitBounds(bounds, 60);
        });
    }

    private agregarMarcadorAlmacen(mapa: google.maps.Map) {
        const div = document.createElement('div');
        div.innerHTML =
            '<div style="width:26px;height:26px;background:#8b5cf6;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;"><svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></div>';
        new google.maps.marker.AdvancedMarkerElement({
            position: { lat: environment.warehouseLat, lng: environment.warehouseLng },
            map: mapa,
            content: div.firstElementChild as HTMLElement,
            title: 'Almacén central',
            zIndex: 1,
        });
    }

    private agregarMarcadoresParadas(mapa: google.maps.Map, viaje?: ViajeAdmin) {
        if (!viaje) return;
        const paradas = [...(viaje.paradas || [])].sort((a, b) => a.orden_visita - b.orden_visita);
        for (const [idx, p] of paradas.entries()) {
            if (p.latitud == null || p.longitud == null) continue;
            const div = document.createElement('div');
            div.innerHTML = `<div style="width:24px;height:24px;background:#f59e0b;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700">${idx + 1}</div>`;
            new google.maps.marker.AdvancedMarkerElement({
                position: { lat: p.latitud, lng: p.longitud },
                map: mapa,
                content: div.firstElementChild as HTMLElement,
                title: `${idx + 1} · ${p.nombre_cliente || ''}`,
                zIndex: 2,
            });
        }
    }

    /** Limpia el mapa comparativo de un viaje (al cerrar el análisis o destruir). */
    limpiarMapaAnalisis(idViaje: string) {
        const polylines = this.polylinesMapas.get(idViaje);
        if (polylines) {
            polylines.planeada.setMap(null);
            polylines.real.setMap(null);
            this.polylinesMapas.delete(idViaje);
        }
        const mapa = this.mapas.get(idViaje);
        if (mapa) {
            google.maps.event.clearInstanceListeners(mapa);
            this.mapas.delete(idViaje);
        }
    }
}
