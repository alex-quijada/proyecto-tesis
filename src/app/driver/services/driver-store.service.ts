import { Injectable, OnDestroy, inject, signal, computed, Signal } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';

import { AuthService } from '@/app/auth/service/auth.service';
import { Chofer } from '@/app/admin/pages/choferes/data/choferes-mock';
import { ViajeService } from '@/app/services/viaje.service';
import { ViajeChofer, ParadaViaje } from '@/app/services/viaje.types';
import { ConnectivityService } from '@/app/services/connectivity.service';
import { OfflineStorageService } from './offline-storage.service';
import { ChoferService, ChoferGuia, ChoferVehiculo } from './chofer.service';
import { TiemposService } from './tiempos.service';
import { NotificationService } from '@/app/services/notification.service';
import { TrazaService } from './traza.service';

export interface Incidencia {
    tipo: string;
    numeroGuia: string;
    descripcion: string;
    horaReporte: string;
    foto?: string;
}

export interface Entrega {
    id: string;
    idGuia: string;
    numeroGuia: string;
    numeroFactura: string;
    empresaSuministro: string;
    cliente: string;
    ruta: string;
    direccion: string;
    rif: string;
    precioCarga: number;
    estado: string;
    observaciones?: string;
    tuvoDevolucion: boolean;
    eventos: any[];
    incidencia?: Incidencia;
    fechaEntrega?: string;
    /** Momento en que la factura entró a 'embarque' (inicio real de carga). */
    fechaInicioCarga?: string;
    /** Última transición de estado (entrada al estado actual). */
    fechaUltimoCambio?: string;
    latitud?: number;
    longitud?: number;
}

export interface DriverInfo {
    nombre: string;
    documento: string;
    telefono: string;
    email: string;
    vehiculos: {
        id: string;
        placa: string;
        marca: string;
        modelo: string;
        anio: number;
        tipo: string;
    }[];
    licencia?: {
        numero: string;
        grado: string;
        fechaExpedicion?: string;
        fechaVencimiento: string;
    };
    certificadoMedico?: { numero: string; fechaExpedicion: string; fechaVencimiento: string };
    fechaIngreso?: string;
}

export interface EntregaPendiente {
    idFactura: string;
    numeroFactura: string;
    cliente: string;
    firma: string;
    observaciones?: string;
    ts: number;
}

export interface CargaCombustiblePendiente {
    idVehiculo: string;
    tipoCombustible: 'GASOLINA_95' | 'GASOLINA_91' | 'DIESEL';
    litros: number;
    costoPorLitro: number;
    tasaBs: number;
    ts: number;
}

export interface GuiaPendiente {
    id: string;
    numeroGuia: string;
    empresaSuministro: string;
    ruta: string;
    observaciones?: string;
    facturas: Entrega[];
}

const ORDEN_MUNICIPIOS: Record<string, number> = {
    PENINSULA_DE_MACANAO: 1,
    TUBORES: 2,
    DIAZ: 3,
    GARCIA: 4,
    ARISMENDI: 5,
    GOMEZ: 6,
    MANEIRO: 7,
    MARINO: 8,
    MARCANO: 9,
    ANTOLIN_DEL_CAMPO: 10,
    VILLALBA: 11,
};

function normalizarMunicipio(nombre: string): string {
    return nombre
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_');
}

@Injectable()
export class DriverStoreService implements OnDestroy {
    private authService = inject(AuthService);
    private choferService = inject(ChoferService);
    private viajeService = inject(ViajeService);
    private notif = inject(NotificationService);
    private connectivity = inject(ConnectivityService);
    private offlineStorage = inject(OfflineStorageService);
    private trazaService = inject(TrazaService);

    readonly driverInfo = signal<DriverInfo | null>(null);
    readonly guiasAsignadas = signal<Entrega[]>([]);
    readonly viajesChofer = signal<ViajeChofer[]>([]);
    readonly viajesCargados = signal(false);
    readonly cargandoViajes = signal(false);
    readonly firmasMap = new Map<string, string>();
    readonly cargando = signal(true);
    readonly datosOffline = signal(false);
    readonly pendientesSincronizar = signal(0);
    readonly sincronizando = signal(false);
    readonly refrescando = signal(false);
    /** El chofer decidió volver al almacén (hora de finalizar): el mapa debe
     *  navegar directo al almacén al abrirse. Se limpia al consumirlo. */
    readonly volviendoAlAlmacen = signal(false);
    /** El chofer reordenó manualmente las paradas del viaje (solo antes de
     *  iniciarlo). Al iniciar el viaje se respeta el orden manual en vez de
     *  recalcular VRPTW. Flag de sesión (no sobrevive reinicios). */
    readonly ordenManual = signal(false);
    /** Momento de la última carga exitosa de datos (para "actualizado hace"). */
    readonly ultimaActualizacion = signal<Date | null>(null);

    private uid: string | null = null;
    private realtimeCanal: RealtimeChannel | null = null;
    private debounceRealtime: ReturnType<typeof setTimeout> | null = null;
    private pollInterval: ReturnType<typeof setInterval> | null = null;
    private escuchandoReconexion = false;

    readonly guiasPendientes = computed(() =>
        this.guiasAsignadas().filter((g) => g.estado !== 'finalizado' && g.estado !== 'cancelado'),
    );

    readonly guiasCompletadas = computed(() =>
        this.guiasAsignadas().filter((g) => g.estado === 'finalizado' || g.estado === 'cancelado'),
    );

    /** Entregas terminales para el historial: finalizado, cancelado e incidencia. */
    readonly guiasHistorial = computed(() =>
        this.guiasAsignadas().filter(
            (g) =>
                g.estado === 'finalizado' || g.estado === 'cancelado' || g.estado === 'incidencia',
        ),
    );

    readonly municipiosDisponibles = computed(() => {
        const municipios = new Set(this.guiasHistorial().map((g) => g.ruta));
        return ['todas', ...Array.from(municipios).sort()];
    });

    readonly historialReciente = computed(() => this.guiasHistorial().slice(0, 5));

    readonly pendingCount = computed(() => this.guiasPendientes().length);
    readonly completedCount = computed(() => this.guiasCompletadas().length);

    readonly guiasPendientesAgrupadas = computed<GuiaPendiente[]>(() => {
        const mapa = new Map<string, GuiaPendiente>();
        for (const g of this.guiasPendientes()) {
            let grupo = mapa.get(g.idGuia);
            if (!grupo) {
                grupo = {
                    id: g.idGuia,
                    numeroGuia: g.numeroGuia,
                    empresaSuministro: g.empresaSuministro,
                    ruta: g.ruta,
                    observaciones: g.observaciones,
                    facturas: [],
                };
                mapa.set(g.idGuia, grupo);
            }
            grupo.facturas.push(g);
        }
        return Array.from(mapa.values());
    });

    readonly pendingGuiasCount = computed(() => this.guiasPendientesAgrupadas().length);

    /**
     * Guías pendientes que pertenecen al viaje activo del chofer. El home solo
     * muestra estas (las que el analista asignó al viaje), no todas las guías
     * registradas a nombre del chofer.
     */
    readonly guiasPendientesDelViaje = computed<GuiaPendiente[]>(() => {
        const viaje = this.activeViaje();
        if (!viaje) return [];
        const idsGuiaViaje = new Set(
            (viaje.paradas || []).map((p) => p.id_guia).filter((x): x is string => !!x),
        );
        if (idsGuiaViaje.size === 0) return [];
        return this.guiasPendientesAgrupadas().filter((g) => idsGuiaViaje.has(g.id));
    });

    readonly pendingGuiasViajeCount = computed(() => this.guiasPendientesDelViaje().length);

    /** Viaje activo del chofer (programado o en proceso). */
    readonly activeViaje = computed<ViajeChofer | null>(() => this.viajesChofer()[0] || null);

    /**
     * Facturas del viaje EN PROCESO que quedaron en 'incidencia' con al menos
     * una incidencia pendiente recuperable → deben re-entregarse.
     * EXCLUYE facturas marcadas por fin de jornada / fuera de horario (FUERA_HORARIO/CERRADO).
     */
    readonly reentregasPendientes = computed<ParadaViaje[]>(() => {
        const viaje = this.activeViaje();
        if (!viaje || viaje.estado !== 'proceso') return [];
        return (viaje.paradas || []).filter((p) => {
            if (p.estado_factura !== 'incidencia') return false;
            // No reentregar facturas marcadas por fin de jornada / fuera de horario
            const esFinJornada = p.incidencias?.some(
                (i) =>
                    i.tipo === 'FUERA_HORARIO' ||
                    i.tipo === 'CERRADO' ||
                    i.tipo === 'Cliente fuera de tiempo' ||
                    (i.descripcion || '').toUpperCase().includes('FUERA_HORARIO'),
            );
            if (esFinJornada) return false;

            return (
                p.incidencias?.some((i) => i.recuperable && !i.resuelta) ||
                p.incidencia_recuperable === true
            );
        });
    });

    /** Reactiva las re-entregas autorizadas: vuelven a 'proceso' y recarga. */
    async reagregarReentregas(): Promise<number> {
        const viaje = this.activeViaje();
        const pendientes = this.reentregasPendientes();
        if (!viaje || viaje.estado !== 'proceso' || pendientes.length < 1) return 0;
        const res = await this.viajeService.reagregarFacturaReenvio(
            viaje.id_viaje,
            pendientes.map((p) => p.id_factura),
        );
        await this.recargarViajes();
        return res.total_reactivadas;
    }

    async cargarDatos() {
        await this.authService.waitForInitialization();
        const user = this.authService.getCurrentUser();
        if (!user) return;
        this.uid = user.id;
        this.cargarPendientes();

        const setDriverInfo = (chofer?: Chofer) => {
            const nombreCompleto =
                user.user_metadata?.['nombre_completo'] || chofer?.nombreCompleto || 'Chofer';
            const prefijo =
                user.user_metadata?.['prefijo_doc'] || chofer?.documentoIdentidad?.prefijo || 'V';
            const cedula =
                user.user_metadata?.['cedula'] ?? chofer?.documentoIdentidad?.numero ?? '';

            this.driverInfo.set({
                nombre: nombreCompleto,
                documento: `${prefijo}-${cedula}`,
                telefono: chofer?.telefono || user.user_metadata?.['telefono'] || '',
                email: user.email || chofer?.email || '',
                vehiculos: this.driverInfo()?.vehiculos || [],
                licencia: chofer?.licencia,
                certificadoMedico: chofer?.certificadoMedico,
                fechaIngreso: chofer?.fechaIngreso || user.user_metadata?.['fechaIngreso'] || '',
            });
        };

        setDriverInfo();

        let choferes: Chofer[] = [];
        try {
            choferes = await this.choferService.obtenerChoferes();
            setDriverInfo(choferes.find((ch: any) => ch.id === user.id));
        } catch (err) {
            console.error('Error cargando perfil del chofer:', err);
        }

        try {
            const guias = await this.choferService.obtenerGuias();
            const vehiculos = await this.choferService.obtenerVehiculos().catch((e) => {
                console.error('Error cargando vehículos:', e);
                return [] as ChoferVehiculo[];
            });
            this.driverInfo.update((info) => ({
                ...(info || this.driverInfo()!),
                vehiculos: this.mapearVehiculos(guias, vehiculos),
            }));
            this.guiasAsignadas.set(
                await this.enriquecerConIncidencias(this.mapearEntregas(guias)),
            );
            this.datosOffline.set(false);
            this.ultimaActualizacion.set(new Date());
            await this.offlineStorage.guardar(this.uid, 'guias', this.guiasAsignadas());
        } catch (err) {
            console.error('Error cargando guías del chofer:', err);
            const caché = await this.offlineStorage.leer<Entrega[]>(this.uid, 'guias');
            if (caché && caché.data.length > 0) {
                this.guiasAsignadas.set(caché.data);
                this.datosOffline.set(true);
                console.info('[Offline] Guías cargadas desde la caché local.');
            } else {
                this.notif.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'No se pudieron cargar tus guías. Intenta de nuevo.',
                });
            }
        }

        await this.cargarViajes();
        this.initRealtime();
        this.iniciarPollingViajeActivo();

        this.cargando.set(false);
        this.escucharReconexion();
    }

    /**
     * Carga el viaje activo del chofer una sola vez por sesión (caché en memoria).
     * Las páginas Ruta y Mapa leen `viajesChofer()` del store en lugar de
     * llamar al RPC en cada ngOnInit → navegar entre ventanas es instantáneo.
     */
    async cargarViajes(force = false) {
        if (!force && this.viajesCargados()) return;
        this.cargandoViajes.set(true);
        try {
            const viajes = await this.viajeService.obtenerViajeChofer();
            this.viajesChofer.set(viajes);
            this.viajesCargados.set(true);
            this.ultimaActualizacion.set(new Date());
            if (this.uid) await this.offlineStorage.guardar(this.uid, 'viajes', viajes);
        } catch (err) {
            console.error('Error cargando el viaje del chofer:', err);
            if (this.uid) {
                const caché = await this.offlineStorage.leer<ViajeChofer[]>(this.uid, 'viajes');
                if (caché && caché.data.length > 0) {
                    this.viajesChofer.set(caché.data);
                    this.viajesCargados.set(true);
                    this.datosOffline.set(true);
                    console.info('[Offline] Viaje cargado desde la caché local.');
                }
            }
        } finally {
            this.cargandoViajes.set(false);
        }
    }

    async recargarViajes() {
        await this.cargarViajes(true);
    }

    // ---------------- Fase 2: Realtime ----------------

    /**
     * Suscribe al chofer a los cambios de su viaje en la BD. Ante cualquier
     * INSERT/UPDATE/DELETE que pueda ver (RLS), recarga el viaje con debounce.
     */
    private initRealtime() {
        const user = this.authService.getCurrentUser();
        if (!user) return;
        this.realtimeCanal = this.authService.client
            .channel(`viajes-chofer-${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'viajes',
                    filter: `id_chofer=eq.${user.id}`,
                },
                () => this.notificarCambioViaje(),
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'itinerario_viaje' },
                () => this.notificarCambioViaje(),
            )
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'incidencias' },
                () => this.notificarCambioViaje(),
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.info('[Realtime] Canal del chofer suscrito.');
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    console.warn('[Realtime] Canal del chofer con error, reintentando...', status);
                    this.reintentarSuscripcion();
                }
            });
    }

    /** Reintenta la suscripción del canal realtime si se cayó/erró. */
    private reintentarSuscripcion() {
        if (!this.realtimeCanal) return;
        const canal = this.realtimeCanal;
        this.realtimeCanal = null;
        void this.authService.client.removeChannel(canal).finally(() => {
            // Pequeño retraso antes de re-suscribir para evitar reintentos en loop.
            setTimeout(() => {
                const user = this.authService.getCurrentUser();
                if (user) this.initRealtime();
            }, 3000);
        });
    }

    private notificarCambioViaje() {
        if (this.debounceRealtime) clearTimeout(this.debounceRealtime);
        this.debounceRealtime = setTimeout(() => {
            void this.cargarViajes(true);
        }, 500);
    }

    // ---------------- Fase 4: reconexión ----------------

    /** Al reconectar: refetch completo + sincronizar la cola de firmas y las
     *  trazas de viajes que no alcanzaron a enviarse al finalizar. */
    private readonly alReconectar = () => {
        void this.sincronizarPendientes();
        void this.trazaService.sincronizarTrazasPendientes();
        void this.cargarViajes(true);
        void this.recargarGuias().catch(() => undefined);
    };

    private escucharReconexion() {
        if (this.escuchandoReconexion) return;
        this.escuchandoReconexion = true;
        window.addEventListener('online', this.alReconectar);

        this.connectivity.checkNow().then((online) => {
            if (online) void this.sincronizarPendientes();
        });
    }

    // ---------------- Fase 5: cola de firmas offline ----------------

    private async cargarPendientes() {
        if (!this.uid) return;
        const caché = await this.offlineStorage.leer<EntregaPendiente[]>(this.uid, 'pendientes');
        const cachéComb = await this.offlineStorage.leer<CargaCombustiblePendiente[]>(
            this.uid,
            'pendientesCombustible',
        );
        const total = (caché?.data.length ?? 0) + (cachéComb?.data.length ?? 0);
        this.pendientesSincronizar.set(total);
    }

    async finalizarEntrega(entrega: Entrega, firma: string, observaciones: string) {
        const hoy = this.fechaHoy();

        try {
            await this.choferService.finalizarEntrega(entrega.id, observaciones || null, firma);
            this.firmasMap.set(entrega.id, firma);
        } catch (err) {
            // Sin red (o fallo de red): encolar y marcar localmente como finalizado.
            if (this.uid) {
                const caché = await this.offlineStorage.leer<EntregaPendiente[]>(
                    this.uid,
                    'pendientes',
                );
                const pendientes = caché?.data ?? [];
                pendientes.push({
                    idFactura: entrega.id,
                    numeroFactura: entrega.numeroFactura,
                    cliente: entrega.cliente,
                    firma,
                    observaciones,
                    ts: Date.now(),
                });
                await this.offlineStorage.guardar(this.uid, 'pendientes', pendientes);
                this.pendientesSincronizar.set(pendientes.length);
                this.notif.add({
                    severity: 'warn',
                    summary: 'Entrega guardada localmente',
                    detail: 'Se sincronizará cuando recuperes conexión.',
                });
            } else {
                throw err;
            }
        }

        this.firmasMap.set(entrega.id, firma);
        this.guiasAsignadas.update((list) =>
            list.map((g) =>
                g.id === entrega.id
                    ? {
                          ...g,
                          estado: 'finalizado',
                          fechaEntrega: hoy,
                          observaciones: observaciones || g.observaciones,
                      }
                    : g,
            ),
        );

        await this.recargarGuias().catch(() => undefined);
        // El mapa lee las paradas desde el viaje: recargar para que el sheet
        // de entrega se limpie al quedar todas las facturas del punto finalizadas.
        await this.recargarViajes().catch(() => undefined);
    }

    /** Registra una carga de combustible del chofer; si no hay red, la encola. */
    async registrarCargaCombustible(params: {
        idVehiculo: string;
        tipoCombustible: 'GASOLINA_95' | 'GASOLINA_91' | 'DIESEL';
        litros: number;
        costoPorLitro: number;
        tasaBs: number;
    }): Promise<void> {
        try {
            await this.choferService.registrarCargaCombustible(params);
        } catch (err) {
            // Sin red (o fallo de red): encolar y sincronizar al reconectar.
            if (this.uid) {
                const caché = await this.offlineStorage.leer<CargaCombustiblePendiente[]>(
                    this.uid,
                    'pendientesCombustible',
                );
                const pendientes = caché?.data ?? [];
                pendientes.push({ ...params, ts: Date.now() });
                await this.offlineStorage.guardar(this.uid, 'pendientesCombustible', pendientes);
                this.pendientesSincronizar.update((n) => n + 1);
                this.notif.add({
                    severity: 'warn',
                    summary: 'Carga guardada localmente',
                    detail: 'Se sincronizará cuando recuperes conexión.',
                });
            } else {
                throw err;
            }
        }
    }

    /** Llegada GPS a un punto de entrega: sus facturas pasan a 'espera'. */
    async marcarParadaEnEspera(idsFacturas: string[]) {
        if (!idsFacturas.length) return;
        try {
            await this.choferService.llegarAParada(idsFacturas);
            await this.recargarViajes();
        } catch (err) {
            console.warn('[Entrega] Error al marcar la llegada', err);
        }
    }

    /** Botón "Iniciar entrega": las facturas del punto pasan a 'entrega'. */
    async iniciarEntrega(idsFacturas: string[]) {
        if (!idsFacturas.length) return;
        try {
            await this.choferService.iniciarEntrega(idsFacturas);
            await this.recargarViajes();
        } catch (err) {
            console.warn('[Entrega] Error al iniciar la entrega', err);
            throw err;
        }
    }

    /** Reporta una o varias incidencias sobre una factura. */
    async reportarIncidencia(
        idFactura: string,
        incidencias: {
            tipo?: string | null;
            descripcion?: string | null;
            foto?: string | null;
        }[],
    ) {
        try {
            await this.choferService.reportarIncidencia(idFactura, incidencias);
            await this.recargarViajes();
            await this.recargarGuias().catch(() => undefined);
        } catch (err) {
            console.warn('[Entrega] Error al reportar la incidencia', err);
            throw err;
        }
    }

    /** Envía la cola de firmas pendientes a la BD y la limpia. */
    async sincronizarPendientes() {
        if (!this.uid || this.sincronizando()) return;
        const caché = await this.offlineStorage.leer<EntregaPendiente[]>(this.uid, 'pendientes');
        const pendientes = caché?.data ?? [];
        const cachéComb = await this.offlineStorage.leer<CargaCombustiblePendiente[]>(
            this.uid,
            'pendientesCombustible',
        );
        const pendientesCombustible = cachéComb?.data ?? [];
        if (pendientes.length < 1 && pendientesCombustible.length < 1) return;

        this.sincronizando.set(true);
        const restantes: EntregaPendiente[] = [];
        try {
            for (const p of pendientes) {
                try {
                    await this.choferService.finalizarEntrega(
                        p.idFactura,
                        p.observaciones || null,
                        p.firma || null,
                    );
                } catch (err) {
                    console.warn('[Offline] Firma pendiente no sincronizada:', p.idFactura, err);
                    restantes.push(p);
                }
            }
            const restantesComb: CargaCombustiblePendiente[] = [];
            for (const p of pendientesCombustible) {
                try {
                    await this.choferService.registrarCargaCombustible(p);
                } catch (err) {
                    console.warn('[Offline] Carga de combustible no sincronizada:', p.ts, err);
                    restantesComb.push(p);
                }
            }
            if (restantes.length === 0 && restantesComb.length === 0) {
                if (pendientes.length) await this.offlineStorage.eliminar(this.uid, 'pendientes');
                if (pendientesCombustible.length)
                    await this.offlineStorage.eliminar(this.uid, 'pendientesCombustible');
                this.pendientesSincronizar.set(0);
                this.notif.add({
                    severity: 'success',
                    summary: 'Sincronizado',
                    detail: 'Tus entregas guardadas se sincronizaron correctamente.',
                });
            } else {
                if (restantes.length)
                    await this.offlineStorage.guardar(this.uid, 'pendientes', restantes);
                if (restantesComb.length)
                    await this.offlineStorage.guardar(
                        this.uid,
                        'pendientesCombustible',
                        restantesComb,
                    );
                this.pendientesSincronizar.set(restantes.length + restantesComb.length);
            }
            await this.recargarGuias().catch(() => undefined);
        } finally {
            this.sincronizando.set(false);
        }
    }

    private iniciarPollingViajeActivo() {
        if (this.pollInterval) return;
        this.pollInterval = setInterval(() => {
            const viaje = this.activeViaje();
            if (viaje && viaje.estado === 'proceso' && this.connectivity.isOnline()) {
                void this.cargarViajes(true);
            }
        }, 3000);
    }

    /** Marca que el chofer reordenó manualmente las paradas del viaje: al
     *  iniciarlo se respetará ese orden en vez de recalcular VRPTW. */
    marcarOrdenManual() {
        this.ordenManual.set(true);
    }

    ngOnDestroy() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        if (this.debounceRealtime) clearTimeout(this.debounceRealtime);
        if (this.escuchandoReconexion) {
            window.removeEventListener('online', this.alReconectar);
            this.escuchandoReconexion = false;
        }
        if (this.realtimeCanal) {
            void this.authService.client.removeChannel(this.realtimeCanal);
            this.realtimeCanal = null;
        }
    }

    async recargarGuias() {
        const guias = await this.choferService.obtenerGuias();
        this.guiasAsignadas.set(await this.enriquecerConIncidencias(this.mapearEntregas(guias)));
        this.ultimaActualizacion.set(new Date());
    }

    /** Rellena el campo `incidencia` real (tipo/descripción/foto) de las
     *  entregas en estado 'incidencia' consultando el RPC separado. */
    private async enriquecerConIncidencias(entregas: Entrega[]): Promise<Entrega[]> {
        const pendientes = entregas.filter((e) => e.estado === 'incidencia');
        if (pendientes.length === 0) return entregas;
        try {
            const resultados = await Promise.all(
                pendientes.map((e) =>
                    this.choferService.obtenerIncidenciaFactura(e.id).catch(() => null),
                ),
            );
            const porFactura = new Map<string, any>();
            pendientes.forEach((e, i) => {
                const inc = resultados[i];
                if (inc) porFactura.set(e.id, inc);
            });
            return entregas.map((e) => {
                const inc = porFactura.get(e.id);
                if (!inc) return e;
                return {
                    ...e,
                    incidencia: {
                        tipo: inc.tipo || 'Incidencia',
                        numeroGuia: e.numeroGuia,
                        descripcion: inc.descripcion || '',
                        horaReporte: inc.hora_reporte || '',
                        foto: inc.foto_url || undefined,
                    },
                };
            });
        } catch (err) {
            console.warn('[Store] No se pudieron enriquecer las incidencias:', err);
            return entregas;
        }
    }

    /** Refresca todo (viaje + guías) desde la BD. Para el botón "Refrescar". */
    async refrescarTodo() {
        if (this.refrescando()) return;
        this.refrescando.set(true);
        try {
            await Promise.all([
                this.cargarViajes(true),
                this.recargarGuias().catch(() => undefined),
            ]);
        } finally {
            this.refrescando.set(false);
        }
    }

    /** Compara el estado en memoria con la BD y actualiza solo si cambió. */
    async verificarDatosAlEntrar() {
        try {
            const [viajes, guias] = await Promise.all([
                this.viajeService.obtenerViajeChofer(),
                this.choferService.obtenerGuias().catch(() => null),
            ]);
            this.viajesChofer.set(viajes);
            this.viajesCargados.set(true);
            if (guias !== null) {
                this.guiasAsignadas.set(
                    await this.enriquecerConIncidencias(this.mapearEntregas(guias)),
                );
                this.ultimaActualizacion.set(new Date());
            }
        } catch (err) {
            console.warn('[Store] No se pudo verificar datos al entrar:', err);
        }
    }

    /** Tiempos y presentación de estados (lógica en TiemposService). */
    private tiempos = inject(TiemposService);

    get now(): Signal<Date> {
        return this.tiempos.now;
    }

    /** Tiempo real de carga (delegado a TiemposService). */
    getTiempoCarga(entrega: Entrega): string {
        return this.tiempos.getTiempoCarga(entrega);
    }

    /** Tiempo en el estado actual de la factura (delegado a TiemposService). */
    getTiempoEstado(entrega: Entrega): string {
        return this.tiempos.getTiempoEstado(entrega);
    }

    getEstadoLabel(e: string): string {
        return this.tiempos.getEstadoLabel(e);
    }

    getEstadoSeverity(
        e: string,
    ): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
        return this.tiempos.getEstadoSeverity(e);
    }

    getColorBorde(e: string): string {
        return this.tiempos.getColorBorde(e);
    }

    vehiculoPrincipal() {
        const v = this.driverInfo()?.vehiculos;
        return v && v.length > 0 ? v[0] : null;
    }

    tieneFirma(id: string): boolean {
        return this.firmasMap.has(id);
    }

    logout() {
        this.authService.logout();
    }

    get fechaActual(): string {
        return new Date().toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
    }

    private fechaHoy(): string {
        const a = new Date();
        return `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}-${String(
            a.getDate(),
        ).padStart(2, '0')}`;
    }

    private mapearEntregas(guias: ChoferGuia[]): Entrega[] {
        const entregas: Entrega[] = [];
        for (const guia of guias) {
            const municipio = guia.nombre_municipio || guia.id_municipio || '';
            for (const f of guia.facturas || []) {
                const estado = f.nombre_estado || 'nuevo';
                entregas.push({
                    id: f.id_factura,
                    idGuia: guia.id_guia,
                    numeroGuia: guia.codigo_guia || guia.id_guia.substring(0, 8).toUpperCase(),
                    numeroFactura: f.numero_factura || '',
                    empresaSuministro: guia.nombre_empresa || '',
                    cliente: f.nombre_cliente || 'Sin cliente',
                    ruta: municipio,
                    direccion: f.direccion_sucursal || '',
                    rif: f.rif_cliente || '',
                    precioCarga: Number(f.monto_dolares) || 0,
                    estado,
                    observaciones: guia.observaciones || undefined,
                    tuvoDevolucion: false,
                    eventos: [],
                    fechaEntrega: estado === 'finalizado' ? guia.fecha_despacho : undefined,
                    fechaInicioCarga: f.fecha_inicio_carga || undefined,
                    fechaUltimoCambio: f.fecha_ultimo_cambio || undefined,
                    latitud: f.latitud ?? undefined,
                    longitud: f.longitud ?? undefined,
                });
            }
        }

        entregas.sort((a, b) => {
            const estadoA = a.estado === 'finalizado' ? 1 : 0;
            const estadoB = b.estado === 'finalizado' ? 1 : 0;
            if (estadoA !== estadoB) return estadoA - estadoB;
            const rA = ORDEN_MUNICIPIOS[normalizarMunicipio(a.ruta)] ?? 99;
            const rB = ORDEN_MUNICIPIOS[normalizarMunicipio(b.ruta)] ?? 99;
            if (rA !== rB) return rA - rB;
            return (a.numeroFactura || '').localeCompare(b.numeroFactura || '');
        });

        return entregas;
    }

    private mapearVehiculos(
        guias: ChoferGuia[],
        vehiculos: ChoferVehiculo[],
    ): DriverInfo['vehiculos'] {
        const vehiculoMap = new Map(vehiculos.map((v) => [v.id_vehiculo, v]));
        const ids = [...new Set(guias.map((g) => g.id_vehiculo).filter(Boolean))];

        return ids
            .map((id) => {
                const detalle = vehiculoMap.get(id!);
                const deGuia = guias.find((g) => g.id_vehiculo === id);
                return {
                    id: id!,
                    placa: detalle?.placa || deGuia?.placa_vehiculo || '',
                    marca: detalle?.marca || deGuia?.marca_vehiculo || '',
                    modelo: detalle?.modelo || deGuia?.modelo_vehiculo || '',
                    anio: detalle?.anio || 0,
                    tipo: detalle?.tipo_nombre || '',
                };
            })
            .filter((v) => !!v.placa);
    }
}
