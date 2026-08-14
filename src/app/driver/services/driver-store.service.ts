import { Injectable, OnDestroy, inject, signal, computed } from '@angular/core';
import { MessageService } from 'primeng/api';
import { RealtimeChannel } from '@supabase/supabase-js';

import { AuthService } from '@/app/auth/service/auth.service';
import { ESTADOS_FACTURA } from '@/app/admin/pages/rutas/data/rutas-mock';
import { Chofer } from '@/app/admin/pages/choferes/data/choferes-mock';
import { ViajeService } from '@/app/services/viaje.service';
import { ViajeChofer } from '@/app/services/viaje.types';
import { ConnectivityService } from '@/app/services/connectivity.service';
import { OfflineStorageService } from './offline-storage.service';
import { ChoferService, ChoferGuia, ChoferVehiculo } from './chofer.service';

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
    private messageService = inject(MessageService);
    private connectivity = inject(ConnectivityService);
    private offlineStorage = inject(OfflineStorageService);

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

    readonly now = signal(new Date());
    private guiaStartTimes = new Map<string, Date>();
    private timerId: ReturnType<typeof setInterval> | null = null;
    private uid: string | null = null;
    private realtimeCanal: RealtimeChannel | null = null;
    private debounceRealtime: ReturnType<typeof setTimeout> | null = null;
    private escuchandoReconexion = false;

    readonly guiasPendientes = computed(() =>
        this.guiasAsignadas().filter((g) => g.estado !== 'finalizado' && g.estado !== 'cancelado'),
    );

    readonly guiasCompletadas = computed(() =>
        this.guiasAsignadas().filter((g) => g.estado === 'finalizado' || g.estado === 'cancelado'),
    );

    readonly municipiosDisponibles = computed(() => {
        const municipios = new Set(this.guiasCompletadas().map((g) => g.ruta));
        return ['todas', ...Array.from(municipios).sort()];
    });

    readonly historialReciente = computed(() => this.guiasCompletadas().slice(0, 5));

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
            this.guiasAsignadas.set(this.mapearEntregas(guias));
            this.initGuiaStartTimes();
            this.datosOffline.set(false);
            await this.offlineStorage.guardar(this.uid, 'guias', this.guiasAsignadas());
        } catch (err) {
            console.error('Error cargando guías del chofer:', err);
            const caché = await this.offlineStorage.leer<Entrega[]>(this.uid, 'guias');
            if (caché && caché.data.length > 0) {
                this.guiasAsignadas.set(caché.data);
                this.initGuiaStartTimes();
                this.datosOffline.set(true);
                console.info('[Offline] Guías cargadas desde la caché local.');
            } else {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'No se pudieron cargar tus guías. Intenta de nuevo.',
                });
            }
        }

        await this.cargarViajes();
        this.initRealtime();

        this.initTimer();
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
            .subscribe();
    }

    private notificarCambioViaje() {
        if (this.debounceRealtime) clearTimeout(this.debounceRealtime);
        this.debounceRealtime = setTimeout(() => {
            void this.cargarViajes(true);
        }, 500);
    }

    // ---------------- Fase 4: reconexión ----------------

    /** Al reconectar: refetch completo + sincronizar la cola de firmas. */
    private readonly alReconectar = () => {
        void this.sincronizarPendientes();
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
        this.pendientesSincronizar.set(caché?.data.length ?? 0);
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
                this.messageService.add({
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

    /** Reporta una incidencia sobre una factura. */
    async reportarIncidencia(idFactura: string, observaciones?: string) {
        try {
            await this.choferService.reportarIncidencia(idFactura, observaciones || null);
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
        if (pendientes.length < 1) return;

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
            if (restantes.length === 0) {
                await this.offlineStorage.eliminar(this.uid, 'pendientes');
                this.pendientesSincronizar.set(0);
                this.messageService.add({
                    severity: 'success',
                    summary: 'Sincronizado',
                    detail: 'Tus entregas guardadas se sincronizaron correctamente.',
                });
            } else {
                await this.offlineStorage.guardar(this.uid, 'pendientes', restantes);
                this.pendientesSincronizar.set(restantes.length);
            }
            await this.recargarGuias().catch(() => undefined);
        } finally {
            this.sincronizando.set(false);
        }
    }

    ngOnDestroy() {
        if (this.timerId) clearInterval(this.timerId);
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
        this.guiasAsignadas.set(this.mapearEntregas(guias));
        this.initGuiaStartTimes();
    }

    private initTimer() {
        this.timerId = setInterval(() => this.now.set(new Date()), 30000);
    }

    private initGuiaStartTimes() {
        this.guiaStartTimes.clear();
        this.guiasPendientes().forEach((g, i) => {
            this.guiaStartTimes.set(g.id, new Date(Date.now() - (7 + i * 12) * 60000));
        });
    }

    getTiempoCarga(guiaId: string): string {
        const start = this.guiaStartTimes.get(guiaId);
        if (!start) return 'Pendiente';
        const mins = Math.floor((this.now().getTime() - start.getTime()) / 60000);
        if (mins < 1) return 'Menos de 1 min';
        return `${mins} mins subiendo mercancía`;
    }

    getEstadoLabel(e: string): string {
        if (e === 'cancelado' || e === 'CANCELADO') return 'Cancelado';
        const found = ESTADOS_FACTURA.find((ef) => ef.value === e);
        return found?.label || e;
    }

    getEstadoSeverity(
        e: string,
    ): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
        if (e === 'cancelado' || e === 'CANCELADO') return 'danger';
        const found = ESTADOS_FACTURA.find((ef) => ef.value === e);
        return (found?.severity as any) || 'info';
    }

    getColorBorde(e: string): string {
        switch (e) {
            case 'nuevo':
                return 'border-l-surface-300';
            case 'embarque':
                return 'border-l-yellow-500';
            case 'proceso':
                return 'border-l-blue-500';
            case 'espera':
                return 'border-l-orange-500';
            case 'entrega':
                return 'border-l-fuchsia-500';
            case 'incidencia':
                return 'border-l-red-500';
            case 'finalizado':
                return 'border-l-green-500';
            default:
                return 'border-l-surface-300';
        }
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
                    incidencia:
                        estado === 'incidencia'
                            ? {
                                  tipo: 'Incidencia',
                                  numeroGuia: guia.codigo_guia || '',
                                  descripcion:
                                      guia.observaciones ||
                                      'Se reportó una incidencia en la entrega',
                                  horaReporte: '',
                              }
                            : undefined,
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
