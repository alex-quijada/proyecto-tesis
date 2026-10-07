import {
    Component,
    OnDestroy,
    OnInit,
    computed,
    effect,
    inject,
    signal,
    viewChild,
    ElementRef,
    afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService } from 'primeng/api';
import { NotificationService } from '@/app/services/notification.service';
import { TipoIncidenciaPipe } from '@/app/shared/pipes/tipo-incidencia.pipe';

import { environment } from '@/environments/environment';
import { ViajeAdmin, ParadaViaje } from '@/app/services/viaje.types';
import { ViajeService } from '@/app/services/viaje.service';
import {
    SeguimientoService,
    PosicionChofer,
    HistorialViajeRow,
} from './services/seguimiento.service';
import {
    esHoraDeVolver,
    duracionLegMin,
    tiempoViajeDistanciaMin,
    distanciaHasta,
} from '@/app/driver/services/fuera-horario.util';

interface ChoferMonitoreo {
    idChofer: string;
    nombre: string;
    placa: string | null;
    color: string;
    estadoViaje: 'proceso' | 'programado' | 'sin-viaje';
    idViaje: string | null;
    municipios: string[];
    entregasHechas: number;
    entregasPendientes: number;
    totalEntregas: number;
    latitud: number;
    longitud: number;
    actualizadoEn: Date;
    online: boolean;
}

interface ParadaDetalle {
    idFactura: string;
    numeroFactura: string;
    cliente: string;
    municipio: string;
    estado: string;
    incidenciaId?: string;
    incidenciaRecuperable?: boolean;
    incidenciaTipo?: string;
    incidenciaDescripcion?: string;
    /** Incidencias pendientes (resuelta != true) de la factura, si las hay. */
    incidenciasPendientes?: { tipo?: string; descripcion?: string }[];
}

interface PuntoEntregaInfo {
    parada: ParadaViaje;
    viaje: ViajeAdmin;
    lat: number;
    lng: number;
    estado: string;
    orden: number;
    cliente: string;
}

interface LineaTiempoItem {
    id: string;
    tipo:
        | 'almacen'
        | 'salida'
        | 'llegada'
        | 'proceso'
        | 'entrega'
        | 'incidencia'
        | 'pendiente'
        | 'completado';
    label: string;
    numero?: number;
    icono?: string;
    color: string;
    fecha: Date | null;
    chip?: string | null;
    estadoParada?: string | null;
    /** Punto actual del viaje (donde está el camión ahora) → se resalta en la UI. */
    actual?: boolean;
}

const PALETA = [
    '#3b82f6',
    '#10b981',
    '#8b5cf6',
    '#f59e0b',
    '#ef4444',
    '#06b6d4',
    '#ec4899',
    '#f97316',
    '#84cc16',
    '#14b8a6',
];

const OFFLINE_MS = 2 * 60 * 1000;
const TICK_MS = 30_000;

function colorDeChofer(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return PALETA[h % PALETA.length];
}

@Component({
    selector: 'app-seguimiento',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        TagModule,
        SkeletonModule,
        SelectButtonModule,
        TooltipModule,
        TipoIncidenciaPipe,
        ConfirmDialogModule,
        ToastModule,
    ],
    providers: [SeguimientoService, ConfirmationService],
    templateUrl: './seguimiento.component.html',
})
export class SeguimientoComponent implements OnInit, OnDestroy {
    protected readonly service = inject(SeguimientoService);
    private confirmationService = inject(ConfirmationService);
    private notif = inject(NotificationService);
    private viajeService = inject(ViajeService);
    private mapaEl = viewChild.required<ElementRef<HTMLDivElement>>('mapaElement');

    readonly cargando = this.service.cargando;
    readonly conectado = this.service.conectado;
    readonly ultimaActualizacion = this.service.ultimaActualizacion;

    readonly filtro = signal<'en-ruta' | 'en-linea' | 'todos'>('en-ruta');
    readonly filtroOpciones = [
        { label: 'En ruta', value: 'en-ruta' },
        { label: 'En línea', value: 'en-linea' },
        { label: 'Todos', value: 'todos' },
    ];

    readonly choferSeleccionado = signal<string | null>(null);
    readonly tick = signal(Date.now());
    readonly mapaListo = signal(false);

    readonly detalleAbierto = signal(false);
    readonly detalleChoferId = signal<string | null>(null);
    readonly historial = signal<HistorialViajeRow[]>([]);
    readonly cargandoHistorial = signal(false);
    readonly errorHistorial = signal('');

    /** Detalle del chofer seleccionado, derivado en vivo de `monitoreo`
     *  (se actualiza en tiempo real con posiciones y viajes). */
    readonly detalleActual = computed<ChoferMonitoreo | null>(() => {
        const id = this.detalleChoferId();
        return id ? (this.monitoreo().find((c) => c.idChofer === id) ?? null) : null;
    });

    /** ¿El viaje está en "hora de volver al almacén"? Misma fórmula que el chofer
     *  (horaActual + viaje + 12 servicio + 15 gracia > ventana_fin) usando la
     *  posición en vivo del chofer y la duración del leg hacia la siguiente
     *  parada pendiente. Se marca en rojo para que el analista pueda ampliar la
     *  ventana si quiere darle más chance al chofer. */
    readonly fueraHorario = computed(() => {
        const c = this.detalleActual();
        if (!c?.idViaje) return false;
        const viaje = this.viajes().find((v) => v.id_viaje === c.idViaje);
        if (!viaje || viaje.estado !== 'proceso') return false;
        const pendientes = (viaje.paradas || [])
            .filter((p) => p.estado_factura !== 'finalizado' && p.estado_factura !== 'incidencia')
            .sort((a, b) => a.orden_visita - b.orden_visita);
        if (pendientes.length < 1) return false;
        const siguiente = pendientes[0];

        let viajeMin = 0;
        const legs = viaje.ruta_detallada?.legs || [];
        if (legs.length > 0) {
            const idxLeg = Math.max(
                0,
                Math.min((siguiente.orden_visita || 1) - 1, legs.length - 1),
            );
            const dur = duracionLegMin(legs[idxLeg]);
            if (dur !== null) viajeMin = Math.max(1, Math.round(dur));
        }
        if (viajeMin === 0 && siguiente.latitud != null && siguiente.longitud != null) {
            const desde = { lat: c.latitud, lng: c.longitud };
            viajeMin = Math.max(
                1,
                Math.round(
                    tiempoViajeDistanciaMin(
                        distanciaHasta(desde, {
                            lat: siguiente.latitud,
                            lng: siguiente.longitud,
                        }),
                    ),
                ),
            );
        }

        return esHoraDeVolver({
            ventanaFin: viaje.ventana_fin,
            horaActual: new Date(),
            tiempoViajeSiguienteMin: viajeMin,
        });
    });

    private mapa!: google.maps.Map;
    private markers = new Map<string, google.maps.marker.AdvancedMarkerElement>();
    private puntosEntrega = new Map<string, google.maps.marker.AdvancedMarkerElement>();
    private polylines = new Map<string, google.maps.Polyline>();
    private infoWindow: google.maps.InfoWindow | null = null;
    private readonly tipoIncidenciaPipe = new TipoIncidenciaPipe();
    private ajustado = false;
    /** Chofer al que ya se le encuadró la vista: evitar re-encuadrar en cada
     *  actualización de posición (se perdería el zoom/pan manual del admin). */
    private ultimoEncuadreId: string | null = null;
    private tickTimer: ReturnType<typeof setInterval> | null = null;
    private debounceHistorial: ReturnType<typeof setTimeout> | null = null;

    readonly monitoreo = computed<ChoferMonitoreo[]>(() => {
        const ahora = this.tick();
        const posiciones = this.service.posiciones();
        const viajes = this.service.viajes();
        const lista: ChoferMonitoreo[] = [];

        for (const pos of Object.values(posiciones)) {
            const viaje = viajes.find(
                (v) =>
                    v.id_chofer === pos.id_chofer &&
                    (v.estado === 'proceso' || v.estado === 'programado'),
            );
            const municipios = viaje
                ? Array.from(
                      new Set(
                          viaje.paradas.map((p) => p.municipio).filter((m): m is string => !!m),
                      ),
                  )
                : [];

            const total = viaje?.total_facturas ?? viaje?.paradas?.length ?? 0;
            const pendientes =
                (viaje?.facturas_proceso ?? 0) +
                (viaje?.facturas_embarque ?? 0) +
                (viaje?.facturas_espera ?? 0) +
                (viaje?.facturas_entrega ?? 0);
            const hechas = Math.max(0, total - pendientes);

            const actualizado = new Date(pos.actualizado_en);
            lista.push({
                idChofer: pos.id_chofer,
                nombre: pos.nombre_chofer || 'Chofer',
                placa: pos.placa_vehiculo ?? viaje?.placa_vehiculo ?? null,
                color: colorDeChofer(pos.id_chofer),
                estadoViaje: viaje ? (viaje.estado as 'proceso' | 'programado') : 'sin-viaje',
                idViaje: viaje?.id_viaje ?? null,
                municipios,
                entregasHechas: hechas,
                entregasPendientes: pendientes,
                totalEntregas: total,
                latitud: pos.latitud,
                longitud: pos.longitud,
                actualizadoEn: actualizado,
                online: ahora - actualizado.getTime() < OFFLINE_MS,
            });
        }

        return lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
    });

    readonly monitoreoFiltrado = computed<ChoferMonitoreo[]>(() => {
        const lista = this.monitoreo();
        switch (this.filtro()) {
            case 'en-ruta':
                return lista.filter((c) => c.estadoViaje !== 'sin-viaje');
            case 'en-linea':
                return lista.filter((c) => c.online);
            default:
                // "Todos": solo choferes con viaje (evita mostrar al admin logueado
                // u otros usuarios sin viaje que tengan una posición registrada).
                return lista.filter((c) => c.estadoViaje !== 'sin-viaje');
        }
    });

    readonly totales = computed(() => {
        // Solo choferes con viaje (excluye admin/usuarios sin viaje con posición).
        const lista = this.monitoreo().filter((c) => c.estadoViaje !== 'sin-viaje');
        return {
            enRuta: lista.filter((c) => c.estadoViaje === 'proceso').length,
            enEspera: lista.filter((c) => c.estadoViaje === 'programado').length,
            online: lista.filter((c) => c.online).length,
            offline: lista.filter((c) => !c.online).length,
        };
    });

    readonly incidencias = computed<number>(
        () => this.historial().filter((r) => r.estado === 'incidencia').length,
    );

    readonly lineaTiempo = computed<LineaTiempoItem[]>(() => {
        const ahora = this.tick();
        const items: LineaTiempoItem[] = [];

        // Historial por factura: TODAS las transiciones {estado, fecha} en orden cronológico
        // (sin deduplicar, para reflejar re-entregas: proceso→espera→…→incidencia→proceso→…).
        const porFactura = new Map<string, { estado: string; fecha: Date }[]>();
        for (const h of this.historial()) {
            let lista = porFactura.get(h.id_factura);
            if (!lista) {
                lista = [];
                porFactura.set(h.id_factura, lista);
            }
            lista.push({ estado: h.estado, fecha: new Date(h.fecha_cambio) });
        }
        for (const lista of porFactura.values()) {
            lista.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
        }

        const detalle = this.detalleActual();
        const viaje = detalle?.idViaje
            ? this.viajes().find((v) => v.id_viaje === detalle.idViaje)
            : null;

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
            chip: embarque
                ? proceso
                    ? `Espera de carga: ${this.formatoDuracion(proceso.getTime() - embarque.getTime())}`
                    : `Cargando: ${this.formatoDuracion(ahora - embarque.getTime())}`
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

        // Por cada parada en orden de visita: mostrar TODAS sus transiciones en orden.
        // El camión solo está "en camino" hacia la PRIMERA parada aún no
        // alcanzada (estado 'proceso'): a las paradas posteriores se les
        // oculta su transición de salida y quedan listadas como pendientes.
        const paradas = this.paradasDetalle();
        const idxDestinoActual = paradas.findIndex((p) => p.estado === 'proceso');
        for (const [idx, p] of paradas.entries()) {
            const numero = idx + 1;
            const transiciones = porFactura.get(p.idFactura) ?? [];

            if (transiciones.length === 0) {
                items.push({
                    id: `pendiente-${p.idFactura}`,
                    tipo: 'pendiente',
                    label: `Parada ${numero} · ${p.cliente}`,
                    numero,
                    icono: 'pi pi-map-marker',
                    color: '#e2e8f0',
                    fecha: null,
                    chip: null,
                    estadoParada: p.estado,
                });
                continue;
            }

            let contador = 0;
            // Índice (en `items`) del último item generado para esta parada:
            // si es el destino actual del camión, ese item es el "punto actual".
            let idxUltimoItemParada = -1;
            for (let t = 0; t < transiciones.length; t++) {
                const trans = transiciones[t];
                const siguiente = transiciones[t + 1];

                switch (trans.estado) {
                    case 'proceso':
                        // Oculto el "En camino a" de paradas más adelante del
                        // destino actual del camión (primera en 'proceso').
                        // Si no hay destino activo (viaje completado o camión
                        // detenido) se muestran todas: es historial.
                        if (idxDestinoActual >= 0 && idx > idxDestinoActual) break;
                        items.push({
                            id: `proceso-${p.idFactura}-${contador++}`,
                            tipo: 'proceso',
                            label: `En camino a ${p.cliente}`,
                            numero,
                            icono: 'pi pi-truck',
                            color: '#3b82f6',
                            fecha: trans.fecha,
                            chip: null,
                            estadoParada: 'proceso',
                        });
                        idxUltimoItemParada = items.length - 1;
                        break;

                    case 'espera':
                        items.push({
                            id: `llegada-${p.idFactura}-${contador++}`,
                            tipo: 'llegada',
                            label: `Llegada a ${p.cliente}`,
                            numero,
                            icono: 'pi pi-map-marker',
                            color: '#f59e0b',
                            fecha: trans.fecha,
                            chip: siguiente
                                ? `Espera: ${this.formatoDuracion(
                                      siguiente.fecha.getTime() - trans.fecha.getTime(),
                                  )}`
                                : `En espera: ${this.formatoDuracion(ahora - trans.fecha.getTime())}`,
                            estadoParada: 'espera',
                        });
                        idxUltimoItemParada = items.length - 1;
                        break;

                    case 'entrega':
                        items.push({
                            id: `entrega-${p.idFactura}-${contador++}`,
                            tipo: 'entrega',
                            label: `Entregando ${p.numeroFactura} · ${p.cliente}`,
                            numero,
                            icono: 'pi pi-bolt',
                            color: '#06b6d4',
                            fecha: trans.fecha,
                            chip: siguiente
                                ? `Entrega: ${this.formatoDuracion(
                                      siguiente.fecha.getTime() - trans.fecha.getTime(),
                                  )}`
                                : `Entregando: ${this.formatoDuracion(ahora - trans.fecha.getTime())}`,
                            estadoParada: 'entrega',
                        });
                        idxUltimoItemParada = items.length - 1;
                        break;

                    case 'finalizado':
                        items.push({
                            id: `finalizado-${p.idFactura}-${contador++}`,
                            tipo: 'completado',
                            label: `Entregado ${p.numeroFactura} · ${p.cliente}`,
                            numero,
                            icono: 'pi pi-check-circle',
                            color: '#10b981',
                            fecha: trans.fecha,
                            chip: null,
                            estadoParada: 'finalizado',
                        });
                        break;

                    case 'incidencia':
                        items.push({
                            id: `incidencia-${p.idFactura}-${contador++}`,
                            tipo: 'incidencia',
                            label: `Incidencia — ${p.numeroFactura} · ${p.cliente}`,
                            numero,
                            icono: 'pi pi-exclamation-circle',
                            color: '#ef4444',
                            fecha: trans.fecha,
                            chip: null,
                            estadoParada: 'incidencia',
                        });
                        idxUltimoItemParada = items.length - 1;
                        break;
                }
            }

            if (contador === 0 && transiciones.length > 0) {
                // Todas sus transiciones estaban ocultas (parada futura):
                // listarla como pendiente para que siga visible en la ruta.
                items.push({
                    id: `pendiente-${p.idFactura}`,
                    tipo: 'pendiente',
                    label: `Parada ${numero} · ${p.cliente}`,
                    numero,
                    icono: 'pi pi-map-marker',
                    color: '#e2e8f0',
                    fecha: null,
                    chip: null,
                    estadoParada: p.estado,
                });
                idxUltimoItemParada = items.length - 1;
            }

            // Punto actual: la primera parada aún activa (en camino, espera o
            // entrega). Su último item generado se resalta en la línea de tiempo.
            const esActiva =
                p.estado === 'proceso' || p.estado === 'espera' || p.estado === 'entrega';
            if (esActiva && idxUltimoItemParada >= 0 && !items.some((it) => it.actual)) {
                items[idxUltimoItemParada].actual = true;
            }
        }

        if (viaje?.estado === 'finalizado') {
            items.push({
                id: 'completado',
                tipo: 'completado',
                label: 'Viaje completado',
                icono: 'pi pi-flag-fill',
                color: '#10b981',
                fecha: primeraGlobal('finalizado'),
                chip: null,
            });
        }

        return items;
    });

    readonly paradasDetalle = computed<ParadaDetalle[]>(() => {
        const c = this.detalleActual();
        if (!c?.idViaje) return [];
        const viaje = this.viajes().find((v) => v.id_viaje === c.idViaje);
        if (!viaje) return [];
        return [...viaje.paradas]
            .sort((a, b) => a.orden_visita - b.orden_visita)
            .map((p) => {
                const inc = p.incidencias?.[0];
                return {
                    idFactura: p.id_factura,
                    numeroFactura: p.numero_factura,
                    cliente: p.nombre_cliente ?? '—',
                    municipio: p.municipio ?? '',
                    estado: p.estado_factura ?? '',
                    incidenciaId: p.incidencia_id,
                    incidenciaRecuperable: p.incidencia_recuperable,
                    incidenciaTipo: inc?.tipo ?? p.incidencia_tipo,
                    incidenciaDescripcion: inc?.descripcion ?? p.incidencia_descripcion,
                    incidenciasPendientes: (p.incidencias || []).filter((i) => i.resuelta !== true),
                };
            });
    });

    readonly entregasConteo = computed(() => {
        const paradas = this.paradasDetalle();
        const hechas = paradas.filter((p) => p.estado === 'finalizado').length;
        return { hechas, pendientes: paradas.length - hechas, total: paradas.length };
    });
    constructor() {
        afterNextRender(() => this.initMap());

        effect(() => {
            if (!this.mapaListo()) return;
            this.monitoreoFiltrado();
            this.choferSeleccionado();
            this.actualizarMarcadores();
            this.dibujarRutas();
            this.actualizarPuntosEntrega();
        });

        effect(() => {
            if (!this.mapaListo()) return;
            const id = this.choferSeleccionado();
            if (id && this.ultimoEncuadreId !== id) {
                this.ultimoEncuadreId = id;
                this.encuadrarChofer(id);
            }
            if (!id) this.ultimoEncuadreId = null;
        });

        // Refetch silencioso del historial del viaje cuando cambian sus datos
        // en tiempo real (llegadas, entregas, incidencias) → Recorrido en vivo.
        effect(() => {
            const id = this.detalleChoferId();
            const viajes = this.service.viajes();
            const viaje = id
                ? viajes.find(
                      (v) =>
                          v.id_chofer === id &&
                          (v.estado === 'proceso' || v.estado === 'programado'),
                  )
                : null;
            if (id && viaje?.id_viaje && this.detalleAbierto()) {
                if (this.debounceHistorial) clearTimeout(this.debounceHistorial);
                this.debounceHistorial = setTimeout(() => {
                    void this.cargarHistorial(viaje.id_viaje, true);
                }, 400);
            }
        });
    }

    async ngOnInit() {
        this.service.initRealtime();
        await this.service.cargar();
        this.tickTimer = setInterval(() => this.tick.set(Date.now()), TICK_MS);
    }

    ngOnDestroy() {
        if (this.tickTimer) clearInterval(this.tickTimer);
        if (this.debounceHistorial) clearTimeout(this.debounceHistorial);
        if (this.infoWindow) {
            this.infoWindow.close();
            this.infoWindow = null;
        }
        for (const m of this.markers.values()) m.map = null;
        this.markers.clear();
        for (const m of this.puntosEntrega.values()) m.map = null;
        this.puntosEntrega.clear();
        for (const p of this.polylines.values()) p.setMap(null);
        this.polylines.clear();
        if (this.mapa) {
            google.maps.event.clearInstanceListeners(this.mapa);
            this.mapa = undefined!;
        }
    }

    seleccionarChofer(id: string | null) {
        this.choferSeleccionado.set(this.choferSeleccionado() === id ? null : id);
    }

    abrirDetallePorIdChofer(idChofer: string) {
        const c = this.monitoreo().find((m) => m.idChofer === idChofer);
        if (c) {
            this.abrirDetalle(c);
        } else {
            this.seleccionarChofer(idChofer);
        }
    }

    abrirDetalle(c: ChoferMonitoreo) {
        this.seleccionarChofer(c.idChofer);
        this.detalleChoferId.set(c.idChofer);
        this.historial.set([]);
        this.errorHistorial.set('');
        this.detalleAbierto.set(true);
        if (c.idViaje) void this.cargarHistorial(c.idViaje);
    }

    cerrarDetalle() {
        this.detalleAbierto.set(false);
        this.detalleChoferId.set(null);
        this.historial.set([]);
        this.errorHistorial.set('');
    }

    async cargarHistorial(idViaje: string, silencioso = false) {
        if (!silencioso) this.cargandoHistorial.set(true);
        if (!silencioso) this.errorHistorial.set('');
        try {
            this.historial.set(await this.service.obtenerHistorialViaje(idViaje));
        } catch (err: any) {
            if (!silencioso) {
                console.error('[Seguimiento] Error al cargar historial del viaje', err);
                this.errorHistorial.set(
                    err?.message || 'No se pudo cargar el historial del viaje.',
                );
            }
        } finally {
            if (!silencioso) this.cargandoHistorial.set(false);
        }
    }

    refrescar() {
        void this.service.refrescar();
    }

    readonly ventanaEditando = signal(false);
    readonly ventanaInicio = signal('08:00');
    readonly ventanaFin = signal('16:30');
    readonly resolviendoId = signal<string | null>(null);

    /** Ventana laboral del viaje seleccionado. */
    ventanaLabel(c: ChoferMonitoreo): string {
        const viaje = c.idViaje ? this.viajes().find((v) => v.id_viaje === c.idViaje) : null;
        if (!viaje) return '';
        const ini = (viaje.ventana_inicio || '08:00').slice(0, 5);
        const fin = (viaje.ventana_fin || '16:30').slice(0, 5);
        return `${ini} - ${fin}`;
    }

    editarVentana(c: ChoferMonitoreo) {
        const viaje = c.idViaje ? this.viajes().find((v) => v.id_viaje === c.idViaje) : null;
        this.ventanaInicio.set((viaje?.ventana_inicio || '08:00').slice(0, 5));
        this.ventanaFin.set((viaje?.ventana_fin || '16:30').slice(0, 5));
        this.ventanaEditando.set(true);
    }

    async guardarVentana(c: ChoferMonitoreo) {
        if (!c.idViaje) return;
        try {
            await this.viajeService.actualizarVentanaViaje(
                c.idViaje,
                this.ventanaInicio(),
                this.ventanaFin(),
            );
            this.ventanaEditando.set(false);
            this.notif.add({
                severity: 'success',
                summary: 'Ventana actualizada',
                detail: `${this.ventanaInicio()} - ${this.ventanaFin()}`,
            });
            await this.service.refrescar();
            if (c.idViaje) await this.cargarHistorial(c.idViaje);
        } catch (err: any) {
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo actualizar la ventana laboral.',
            });
        }
    }

    cancelarVentana() {
        this.ventanaEditando.set(false);
    }

    /** Facturas del viaje seleccionado en estado 'incidencia' que requieren
     *  resolución manual. Se EXCLUYEN las incidencias que se reactivan solas
     *  al terminar el viaje (CERRADO / FUERA_HORARIO): no deben mostrarse
     *  como "por resolver". */
    readonly incidenciasPendientes = computed<ParadaDetalle[]>(() => {
        const autoResolubles = new Set(['CERRADO', 'FUERA_HORARIO']);
        return this.paradasDetalle().filter((p) => {
            if (p.estado !== 'incidencia') return false;
            // Si tiene incidencias multi, decidir por el tipo de la primera
            // pendiente; si no, usar el tipo del fallback.
            const tipos = (
                p.incidenciasPendientes?.length
                    ? p.incidenciasPendientes.map((i) => i.tipo)
                    : [p.incidenciaTipo]
            ).filter((t): t is string => !!t);
            const tiposRelevantes = tipos.filter((t) => !autoResolubles.has(t));
            return tiposRelevantes.length > 0;
        });
    });

    async resolverIncidencia(factura: ParadaDetalle) {
        if (this.resolviendoId()) return;
        this.resolviendoId.set(factura.idFactura);
        try {
            await this.viajeService.resolverIncidencia(factura.idFactura);
            this.notif.add({
                severity: 'success',
                summary: 'Incidencia resuelta',
                detail: `${factura.numeroFactura} — ${factura.cliente} volvió a disponible.`,
            });
            await this.service.refrescar();
            const c = this.detalleActual();
            if (c?.idViaje) await this.cargarHistorial(c.idViaje);
        } catch (err: any) {
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo resolver la incidencia.',
            });
        } finally {
            this.resolviendoId.set(null);
        }
    }

    readonly togglingRecuperableId = signal<string | null>(null);

    async toggleRecuperable(factura: ParadaDetalle) {
        if (!factura.incidenciaId || this.togglingRecuperableId()) return;
        this.togglingRecuperableId.set(factura.incidenciaId);
        const objetivo = factura.incidenciaRecuperable === true ? false : true;
        try {
            await this.viajeService.setIncidenciaRecuperable(factura.incidenciaId, objetivo);
            this.notif.add({
                severity: 'success',
                summary: objetivo ? 'Re-despachable' : 'Terminal',
                detail: `${factura.numeroFactura} — ${factura.cliente} marcada como ${
                    objetivo ? 'recuperable' : 'no recuperable'
                }.`,
            });
            await this.service.refrescar();
            const c = this.detalleActual();
            if (c?.idViaje) await this.cargarHistorial(c.idViaje);
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

    reiniciarViaje(c: ChoferMonitoreo) {
        const viaje = this.viajes().find((v) => v.id_viaje === c.idViaje);
        this.confirmationService.confirm({
            message: `¿Reiniciar el viaje de ${c.nombre}? El viaje volverá a "programado" y sus ${
                viaje?.total_facturas ?? 0
            } facturas a "embarque". Se borrarán las firmas, incidencias, fotos de incidencia y el historial de estados.`,
            header: 'Reiniciar viaje',
            icon: 'pi pi-refresh',
            rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Reiniciar', icon: 'pi pi-check', severity: 'danger' },
            accept: () => void this.confirmarReinicio(c),
        });
    }

    private async confirmarReinicio(c: ChoferMonitoreo) {
        if (!c.idViaje) return;
        try {
            const fotos = await this.service.reiniciarViaje(c.idViaje);
            // Borrar del bucket los objetos de fotos de incidencia limpiados en BD.
            if (fotos.length > 0) {
                await this.viajeService
                    .borrarFotosIncidencia(fotos)
                    .catch((err) =>
                        console.warn('No se pudieron borrar fotos de incidencia del storage', err),
                    );
            }
            this.notif.add({
                severity: 'success',
                summary: 'Viaje reiniciado',
                detail: `El viaje de ${c.nombre} volvió a programado (incidencias, fotos e historial limpiados).`,
            });
            await this.service.refrescar();
            if (c.idViaje) await this.cargarHistorial(c.idViaje);
        } catch (err: any) {
            console.error('Error al reiniciar viaje', err);
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo reiniciar el viaje.',
            });
        }
    }

    // ---------------- Mapa ----------------

    private initMap() {
        const el = this.mapaEl()?.nativeElement;
        if (!el) return;
        this.mapa = new google.maps.Map(el, {
            center: { lat: environment.warehouseLat, lng: environment.warehouseLng },
            zoom: 10,
            mapId: 'seguimiento',
            disableDefaultUI: true,
        });
        this.mapa.addListener('click', () => {
            this.infoWindow?.close();
        });
        google.maps.event.addListenerOnce(this.mapa, 'idle', () => {
            this.mapaListo.set(true);
            this.agregarMarcadorAlmacen();
        });
    }

    private agregarMarcadorAlmacen() {
        const div = document.createElement('div');
        div.innerHTML =
            '<div style="width:28px;height:28px;background:#8b5cf6;border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></div>';
        const marker = new google.maps.marker.AdvancedMarkerElement({
            position: { lat: environment.warehouseLat, lng: environment.warehouseLng },
            map: this.mapa,
            content: div.firstElementChild as HTMLElement,
            title: 'Almacén central',
            zIndex: 1,
        });
    }

    private actualizarMarcadores() {
        if (!this.mapa) return;
        const lista = this.monitoreoFiltrado();

        if (!this.ajustado && lista.length > 0) {
            this.ajustado = true;
            this.encuadrarTodos();
        }

        const vistos = new Set<string>();
        for (const c of lista) {
            vistos.add(c.idChofer);
            const pos = { lat: c.latitud, lng: c.longitud };
            const marcador = this.markers.get(c.idChofer);
            if (marcador) {
                marcador.position = pos;
            } else {
                const nuevo = new google.maps.marker.AdvancedMarkerElement({
                    position: pos,
                    map: this.mapa,
                    content: this.crearContenidoMarcador(c),
                    title: c.nombre,
                    zIndex: c.idChofer === this.choferSeleccionado() ? 3 : 2,
                });
                nuevo.addListener('gmp-click', () => this.seleccionarChofer(c.idChofer));
                this.markers.set(c.idChofer, nuevo);
            }
        }

        for (const [id, m] of this.markers) {
            if (!vistos.has(id)) {
                m.map = null;
                this.markers.delete(id);
            }
        }
    }

    private crearContenidoMarcador(c: ChoferMonitoreo): HTMLElement {
        const base = c.online ? c.color : '#9ca3af';
        const div = document.createElement('div');
        div.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;gap:2px;transform:translateY(-14px)">
                <div style="width:34px;height:34px;background:${base};border-radius:50%;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;">
                    <i class="pi pi-truck"></i>
                </div>
                <span style="background:#fff;color:#111827;font-size:11px;font-weight:600;padding:1px 7px;border-radius:999px;box-shadow:0 1px 3px rgba(0,0,0,.25);white-space:nowrap">${c.nombre}</span>
            </div>`;
        return div.firstElementChild as HTMLElement;
    }

    /**
     * Puntos de entrega en el mapa. Sin chofer seleccionado se muestran todos;
     * al seleccionar un chofer solo los de su viaje. Azul = pendiente,
     * verde = entregado, rojo/amarillo = incidencia.
     * Al hacer clic en un punto, se abre un InfoWindow interactivo con detalles
     * completos de la entrega y las incidencias (con pipe y fotos).
     */
    private actualizarPuntosEntrega() {
        if (!this.mapa) return;
        const seleccion = this.choferSeleccionado();
        const activos = this.viajes().filter(
            (v) => v.estado === 'proceso' || v.estado === 'programado',
        );
        const viajes = seleccion ? activos.filter((v) => v.id_chofer === seleccion) : activos;

        const visibles = new Map<string, PuntoEntregaInfo>();
        for (const v of viajes) {
            for (const p of v.paradas) {
                if (p.latitud == null || p.longitud == null) continue;
                visibles.set(p.id_factura, {
                    parada: p,
                    viaje: v,
                    lat: p.latitud as number,
                    lng: p.longitud as number,
                    estado: p.estado_factura || '',
                    orden: p.orden_visita,
                    cliente: p.nombre_cliente || 'Cliente',
                });
            }
        }

        for (const [id, m] of this.puntosEntrega) {
            if (!visibles.has(id)) {
                m.map = null;
                this.puntosEntrega.delete(id);
            }
        }

        for (const [id, info] of visibles) {
            const m = this.puntosEntrega.get(id);
            const pos = { lat: info.lat, lng: info.lng };
            if (m) {
                m.position = pos;
                m.content = this.crearContenidoPuntoEntrega(info);
                google.maps.event.clearListeners(m, 'gmp-click');
                m.addListener('gmp-click', () => this.abrirInfoPuntoEntrega(info, m));
            } else {
                const nuevo = new google.maps.marker.AdvancedMarkerElement({
                    position: pos,
                    map: this.mapa,
                    content: this.crearContenidoPuntoEntrega(info),
                    title: `#${info.orden} · ${info.cliente} (${this.estadoFacturaLabel(info.estado)})`,
                    zIndex: 4,
                });
                nuevo.addListener('gmp-click', () => this.abrirInfoPuntoEntrega(info, nuevo));
                this.puntosEntrega.set(id, nuevo);
            }
        }
    }

    private crearContenidoPuntoEntrega(info: PuntoEntregaInfo): HTMLElement {
        let color = '#3b82f6';
        let icono = String(info.orden);

        switch (info.estado) {
            case 'finalizado':
                color = '#10b981';
                icono = '&#10003;';
                break;
            case 'incidencia':
                color = '#ef4444';
                icono = '&#33;';
                break;
            case 'entrega':
                color = '#06b6d4';
                icono = '⚡';
                break;
            case 'espera':
                color = '#f59e0b';
                icono = '⏳';
                break;
            case 'proceso':
                color = '#3b82f6';
                icono = String(info.orden);
                break;
            default:
                color = '#64748b';
                icono = String(info.orden);
                break;
        }

        const div = document.createElement('div');
        div.style.cursor = 'pointer';
        div.innerHTML = `
            <div style="width:26px;height:26px;background:${color};border-radius:50%;border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;cursor:pointer;transition:transform .15s ease;" title="Toca para ver detalles de la entrega">
                ${icono}
            </div>`;
        return div.firstElementChild as HTMLElement;
    }

    private abrirInfoPuntoEntrega(
        info: PuntoEntregaInfo,
        marker: google.maps.marker.AdvancedMarkerElement,
    ) {
        if (!this.infoWindow) {
            this.infoWindow = new google.maps.InfoWindow({
                maxWidth: 340,
            });
        }
        const contenido = this.crearContenidoInfoWindow(info);
        this.infoWindow.setContent(contenido);
        this.infoWindow.open({
            anchor: marker,
            map: this.mapa,
        });

        setTimeout(() => {
            const btn = document.getElementById(`btn-ver-viaje-${info.parada.id_factura}`);
            if (btn) {
                btn.onclick = () => {
                    this.abrirDetallePorIdChofer(info.viaje.id_chofer);
                    this.infoWindow?.close();
                };
            }
        }, 50);
    }

    private crearContenidoInfoWindow(info: PuntoEntregaInfo): HTMLElement {
        let badgeBg = '#f1f5f9';
        let badgeColor = '#475569';
        let badgeBorder = '#cbd5e1';
        let badgeLabel = 'Pendiente';

        switch (info.estado) {
            case 'finalizado':
                badgeBg = '#dcfce7';
                badgeColor = '#15803d';
                badgeBorder = '#86efac';
                badgeLabel = 'Entregado';
                break;
            case 'incidencia':
                badgeBg = '#fee2e2';
                badgeColor = '#b91c1c';
                badgeBorder = '#fca5a5';
                badgeLabel = 'Incidencia';
                break;
            case 'entrega':
                badgeBg = '#cffafe';
                badgeColor = '#0e7490';
                badgeBorder = '#67e8f9';
                badgeLabel = 'Entregando';
                break;
            case 'espera':
                badgeBg = '#fef3c7';
                badgeColor = '#b45309';
                badgeBorder = '#fde68a';
                badgeLabel = 'En espera';
                break;
            case 'proceso':
                badgeBg = '#dbeafe';
                badgeColor = '#1d4ed8';
                badgeBorder = '#93c5fd';
                badgeLabel = 'En camino';
                break;
            case 'embarque':
                badgeBg = '#f3e8ff';
                badgeColor = '#7e22ce';
                badgeBorder = '#d8b4fe';
                badgeLabel = 'En carga';
                break;
        }

        const montoUsd =
            info.parada.monto_dolares != null
                ? `$${Number(info.parada.monto_dolares).toFixed(2)} USD`
                : '';
        const montoBs =
            info.parada.monto_bss != null || info.parada.monto_ves != null
                ? `Bs. ${Number(info.parada.monto_bss ?? info.parada.monto_ves).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '';
        const montoText = [montoUsd, montoBs].filter(Boolean).join(' · ');

        let outcomeHtml = '';
        if (
            info.estado === 'incidencia' ||
            (info.parada.incidencias && info.parada.incidencias.length > 0)
        ) {
            const incs =
                info.parada.incidencias && info.parada.incidencias.length > 0
                    ? info.parada.incidencias
                    : [
                          {
                              tipo: info.parada.incidencia_tipo,
                              descripcion: info.parada.incidencia_descripcion,
                              foto: info.parada.incidencia_foto,
                              recuperable: info.parada.incidencia_recuperable,
                              hora_reporte: undefined,
                          },
                      ];

            outcomeHtml = `
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:8px 10px;margin-bottom:8px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:4px;">
                    <span style="font-weight:700;color:#dc2626;font-size:12px;display:flex;align-items:center;gap:4px;">
                        ⚠️ Incidencia reportada
                    </span>
                    <span style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:999px;${
                        info.parada.incidencia_recuperable === true
                            ? 'background:#fef3c7;color:#b45309;border:1px solid #fde68a;'
                            : 'background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;'
                    }">
                        ${info.parada.incidencia_recuperable === true ? 'Recuperable (Re-despachable)' : 'Terminal (No recuperable)'}
                    </span>
                </div>
                ${incs
                    .map((inc, i) => {
                        const tipoLabel =
                            this.tipoIncidenciaPipe.transform(inc.tipo) ||
                            inc.tipo ||
                            'Incidencia no especificada';
                        return `
                    <div style="${i > 0 ? 'margin-top:6px;padding-top:6px;border-top:1px dashed #fca5a5;' : ''}">
                        <div style="font-size:11px;font-weight:700;color:#b91c1c;">
                            ${tipoLabel}
                        </div>
                        ${inc.descripcion ? `<div style="font-size:11px;color:#475569;margin-top:2px;font-style:italic;">"${inc.descripcion}"</div>` : ''}
                        ${inc.hora_reporte ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px;">Reportado a las ${inc.hora_reporte}</div>` : ''}
                        ${inc.foto ? `<div style="margin-top:6px;"><a href="${inc.foto}" target="_blank" rel="noopener noreferrer" title="Toca para ver la foto completa"><img src="${inc.foto}" style="width:100%;max-height:120px;object-fit:cover;border-radius:6px;border:1px solid #fecaca;display:block;" alt="Foto de incidencia"/></a></div>` : ''}
                    </div>
                    `;
                    })
                    .join('')}
            </div>`;
        } else if (info.estado === 'finalizado') {
            outcomeHtml = `
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 10px;margin-bottom:8px;display:flex;align-items:center;gap:8px;">
                <div style="width:22px;height:22px;border-radius:50%;background:#16a34a;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:11px;flex-shrink:0;">
                    ✓
                </div>
                <div style="font-size:12px;color:#166534;font-weight:600;">
                    Entrega completada y confirmada con éxito.
                </div>
            </div>`;
        } else if (info.estado === 'entrega') {
            outcomeHtml = `
            <div style="background:#ecfeff;border:1px solid #a5f3fc;border-radius:8px;padding:8px 10px;margin-bottom:8px;display:flex;align-items:center;gap:8px;">
                <div style="width:22px;height:22px;border-radius:50%;background:#0891b2;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;">
                    ⚡
                </div>
                <div style="font-size:12px;color:#155e75;font-weight:600;">
                    Chofer actualmente en el punto entregando la mercancía.
                </div>
            </div>`;
        } else if (info.estado === 'espera') {
            outcomeHtml = `
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;margin-bottom:8px;display:flex;align-items:center;gap:8px;">
                <div style="width:22px;height:22px;border-radius:50%;background:#d97706;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;">
                    ⏳
                </div>
                <div style="font-size:12px;color:#92400e;font-weight:600;">
                    Chofer en el sitio en espera de recepción por el cliente.
                </div>
            </div>`;
        } else if (info.estado === 'proceso') {
            outcomeHtml = `
            <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 10px;margin-bottom:8px;display:flex;align-items:center;gap:8px;">
                <div style="width:22px;height:22px;border-radius:50%;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;">
                    🚚
                </div>
                <div style="font-size:12px;color:#1e40af;font-weight:600;">
                    Vehículo en camino hacia este punto de entrega.
                </div>
            </div>`;
        }

        let contactHtml = '';
        const detallesContacto: string[] = [];
        if (info.parada.contacto || info.parada.telefono) {
            detallesContacto.push(
                `👤 ${info.parada.contacto || 'Contacto'} ${info.parada.telefono ? '(' + info.parada.telefono + ')' : ''}`,
            );
        }
        if (info.parada.referencia) {
            detallesContacto.push(`🧭 ${info.parada.referencia}`);
        }
        if (info.parada.nota_sucursal) {
            detallesContacto.push(`📝 ${info.parada.nota_sucursal}`);
        }
        if (detallesContacto.length > 0) {
            contactHtml = `
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;margin-bottom:8px;font-size:11px;color:#475569;">
                ${detallesContacto.map((c) => `<div style="margin-bottom:2px;">${c}</div>`).join('')}
            </div>`;
        }

        const div = document.createElement('div');
        div.innerHTML = `
        <div style="font-family:inherit;font-size:13px;color:#1e293b;max-width:320px;padding:4px 2px;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;">
                <div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="background:#3b82f6;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:999px;">
                            #${info.orden}
                        </span>
                        <span style="font-weight:700;font-size:13px;color:#0f172a;">
                            ${info.cliente}
                        </span>
                    </div>
                    <div style="font-size:11px;color:#64748b;margin-top:2px;">
                        Factura ${info.parada.numero_factura} ${info.parada.codigo_guia ? '· Guía ' + info.parada.codigo_guia : ''}
                    </div>
                </div>
                <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:6px;white-space:nowrap;background:${badgeBg};color:${badgeColor};border:1px solid ${badgeBorder};">
                    ${badgeLabel}
                </span>
            </div>

            <div style="margin-bottom:8px;font-size:11px;color:#334155;line-height:1.4;">
                ${info.parada.direccion ? `<div style="display:flex;align-items:flex-start;gap:4px;margin-bottom:3px;"><span style="color:#94a3b8;">📍</span> <span>${info.parada.direccion}${info.parada.municipio ? ' (' + info.parada.municipio + ')' : ''}</span></div>` : ''}
                ${montoText ? `<div style="display:flex;align-items:center;gap:4px;font-weight:600;color:#0f172a;margin-top:2px;"><span style="color:#94a3b8;">💵</span> <span>${montoText}</span></div>` : ''}
                ${info.viaje.chofer ? `<div style="display:flex;align-items:center;gap:4px;font-size:11px;color:#64748b;margin-top:2px;"><span style="color:#94a3b8;">🚚</span> <span>${info.viaje.chofer} ${info.viaje.placa_vehiculo ? '· ' + info.viaje.placa_vehiculo : ''}</span></div>` : ''}
            </div>

            ${outcomeHtml}
            ${contactHtml}

            <div style="margin-top:8px;padding-top:6px;border-top:1px solid #f1f5f9;display:flex;justify-content:flex-end;">
                <button id="btn-ver-viaje-${info.parada.id_factura}" style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;color:#334155;cursor:pointer;display:flex;align-items:center;gap:4px;">
                    <span>Ver viaje de ${info.viaje.chofer || 'chofer'}</span>
                    <span>&rarr;</span>
                </button>
            </div>
        </div>`;
        return div.firstElementChild as HTMLElement;
    }

    private dibujarRutas() {
        if (!this.mapa) return;
        // Solo trazamos líneas para viajes en proceso (en ruta activa)
        const activos = this.viajes().filter((v) => v.estado === 'proceso');
        const seleccion = this.choferSeleccionado();
        const idsActivos = new Set(activos.map((v) => v.id_viaje));

        for (const [id, pl] of this.polylines) {
            if (!idsActivos.has(id)) {
                pl.setMap(null);
                this.polylines.delete(id);
            }
        }

        for (const v of activos) {
            const path = this.obtenerPathViaje(v);
            if (!path || path.length < 2) continue;
            const color = colorDeChofer(v.id_chofer);
            const esSeleccion = v.id_chofer === seleccion;
            const pl = this.polylines.get(v.id_viaje);
            if (pl) {
                pl.setPath(path);
                pl.setOptions({
                    strokeColor: color,
                    strokeWeight: esSeleccion ? 5 : 3,
                    strokeOpacity: esSeleccion ? 1 : 0.55,
                    zIndex: esSeleccion ? 2 : 1,
                });
            } else {
                const nueva = new google.maps.Polyline({
                    path,
                    map: this.mapa,
                    strokeColor: color,
                    strokeWeight: esSeleccion ? 5 : 3,
                    strokeOpacity: esSeleccion ? 1 : 0.55,
                    zIndex: esSeleccion ? 2 : 1,
                });
                this.polylines.set(v.id_viaje, nueva);
            }
        }
    }

    private obtenerPathViaje(v: ViajeAdmin): { lat: number; lng: number }[] | null {
        // No generar trazo si el viaje aún no ha iniciado (sigue en acumulación/programado)
        if (v.estado !== 'proceso') {
            return null;
        }
        if (v.ruta_detallada?.path && v.ruta_detallada.path.length > 1) {
            return v.ruta_detallada.path;
        }
        const puntos = v.paradas
            .filter((p) => p.latitud != null && p.longitud != null)
            .sort((a, b) => a.orden_visita - b.orden_visita)
            .map((p) => ({ lat: p.latitud as number, lng: p.longitud as number }));
        return puntos.length > 1 ? puntos : null;
    }

    private encuadrarTodos() {
        const lista = this.monitoreoFiltrado();
        if (lista.length < 1) return;
        const bounds = new google.maps.LatLngBounds();
        bounds.extend({ lat: environment.warehouseLat, lng: environment.warehouseLng });
        for (const c of lista) bounds.extend({ lat: c.latitud, lng: c.longitud });
        this.mapa.fitBounds(bounds, 60);
    }

    private encuadrarChofer(id: string) {
        if (!this.mapa) return;
        const c = this.monitoreo().find((m) => m.idChofer === id);
        if (!c) return;
        const viaje = this.viajes().find((v) => v.id_viaje === c.idViaje);
        const path = viaje ? this.obtenerPathViaje(viaje) : null;
        if (path && path.length > 1) {
            const bounds = new google.maps.LatLngBounds();
            for (const p of path) bounds.extend(p);
            this.mapa.fitBounds(bounds, 60);
        } else if (viaje && viaje.paradas.length > 0) {
            const bounds = new google.maps.LatLngBounds();
            bounds.extend({ lat: c.latitud, lng: c.longitud });
            for (const p of viaje.paradas) {
                if (p.latitud != null && p.longitud != null) {
                    bounds.extend({ lat: p.latitud, lng: p.longitud });
                }
            }
            this.mapa.fitBounds(bounds, 60);
        } else {
            this.mapa.panTo({ lat: c.latitud, lng: c.longitud });
            this.mapa.setZoom(12);
        }
    }

    private viajes() {
        return this.service.viajes();
    }

    // ---------------- Helpers de plantilla ----------------

    estadoSeverity(
        estado: string,
    ): 'success' | 'info' | 'warn' | 'secondary' | 'danger' | 'contrast' | undefined {
        switch (estado) {
            case 'proceso':
                return 'info';
            case 'programado':
                return 'warn';
            default:
                return 'secondary';
        }
    }

    estadoLabel(estado: string): string {
        switch (estado) {
            case 'proceso':
                return 'En ruta';
            case 'programado':
                return 'Por iniciar';
            default:
                return 'Sin viaje';
        }
    }

    rutaLabel(c: ChoferMonitoreo): string {
        if (c.municipios.length < 1) return 'Sin ruta asignada';
        return `Ruta ${c.municipios.join(' / ')}`;
    }

    progreso(c: ChoferMonitoreo): number {
        return c.totalEntregas > 0 ? Math.round((c.entregasHechas / c.totalEntregas) * 100) : 0;
    }

    private formatoDuracion(ms: number): string {
        if (ms < 60_000) return 'menos de 1 min';
        const min = Math.floor(ms / 60_000);
        if (min < 60) return `${min} min`;
        const h = Math.floor(min / 60);
        return `${h}h ${min % 60} min`;
    }

    formatHora(fecha: Date | null): string {
        if (!fecha) return '—';
        return fecha.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
    }

    formatFecha(fecha: Date | null): string {
        if (!fecha) return '';
        const hoy = new Date();
        const mismoDia =
            fecha.getDate() === hoy.getDate() &&
            fecha.getMonth() === hoy.getMonth() &&
            fecha.getFullYear() === hoy.getFullYear();
        return mismoDia
            ? `hoy ${this.formatHora(fecha)}`
            : fecha.toLocaleDateString('es-VE', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
              });
    }

    estadoFacturaLabel(estado: string): string {
        switch (estado) {
            case 'finalizado':
                return 'Entregado';
            case 'entrega':
                return 'Entregando';
            case 'espera':
                return 'En espera';
            case 'proceso':
                return 'En camino';
            case 'embarque':
                return 'En carga';
            case 'incidencia':
                return 'Incidencia';
            default:
                return 'Nuevo';
        }
    }

    estadoFacturaSeverity(
        estado: string,
    ): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | undefined {
        switch (estado) {
            case 'finalizado':
                return 'success';
            case 'incidencia':
                return 'danger';
            case 'espera':
            case 'entrega':
                return 'warn';
            case 'proceso':
                return 'info';
            default:
                return 'secondary';
        }
    }

    relativo(fecha: Date): string {
        const diff = Math.max(0, Date.now() - fecha.getTime());
        const seg = Math.floor(diff / 1000);
        if (seg < 60) return `hace ${seg}s`;
        const min = Math.floor(seg / 60);
        if (min < 60) return `hace ${min}min`;
        const hrs = Math.floor(min / 60);
        if (hrs < 24) return `hace ${hrs}h`;
        return fecha.toLocaleDateString();
    }

    formatoActualizacion(): string {
        const f = this.ultimaActualizacion();
        if (!f) return '—';
        return f.toLocaleTimeString();
    }
}
