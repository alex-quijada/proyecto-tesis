import { Injectable, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { Capacitor } from '@capacitor/core';
import { Geolocation, Position } from '@capacitor/geolocation';

import {
    GoogleMapsOptimizationService,
    PasoRuta,
    RutaDetallada,
    Waypoint,
} from '@/app/admin/pages/map/map/google-maps-optimization.service';
import { RutaPersistida } from '@/app/services/viaje.types';
import { ConnectivityService } from '@/app/services/connectivity.service';
import { AuthService } from '@/app/auth/service/auth.service';
import { OfflineStorageService } from './offline-storage.service';
import {
    distanciaAPolyline,
    haversine,
    calcularBearing,
    LatLng,
} from '../pages/viajes/navegacion.util';

export interface ParadaNavegacion {
    id: string;
    nombreCliente: string;
    numeroGuia: string;
    numeroFactura: string;
    ordenVisita: number;
    latitud: number;
    longitud: number;
}

/** Estado de la simulación (progreso + posición) para pausar/guardar/restaurar. */
export interface EstadoSimulacion {
    distancia: number;
    parada: number;
    paso: number;
    posicion: { lat: number; lng: number } | null;
}

const UMBRAL_PASO_M = 25;
const UMBRAL_LLEGADA_M = 40;
const UMBRAL_RE_RUTEO_M = 300;
const DEBOUNCE_RE_RUTEO_MS = 60000;
const SIM_INTERVALO_MS = 200;
/** Velocidad de la simulación en m/s (configurable desde la UI). */
const VELOCIDAD_SIMULACION_DEFAULT = 40;

@Injectable()
export class NavigationService {
    private messageService = inject(MessageService);
    private googleOptimization = inject(GoogleMapsOptimizationService);
    private connectivity = inject(ConnectivityService);
    private authService = inject(AuthService);
    private offlineStorage = inject(OfflineStorageService);

    readonly navegando = signal(false);
    readonly pasos = signal<PasoRuta[]>([]);
    readonly path = signal<LatLng[]>([]);
    readonly legs = signal<{ path: LatLng[] }[]>([]);
    readonly pasoActual = signal(0);
    readonly paradaActual = signal(0);
    readonly posicionDriver = signal<LatLng | null>(null);
    readonly rumbo = signal(0);
    readonly simulando = signal(false);
    readonly pausado = signal(false);
    readonly distRestantePaso = signal(0);
    readonly distRestanteParada = signal(0);
    readonly recalculando = signal(false);
    readonly totalParadas = signal(0);
    /** Velocidad de la simulación en m/s (cambiable desde la UI). */
    readonly velocidadSimulacion = signal(VELOCIDAD_SIMULACION_DEFAULT);
    /** Último estado de la simulación (progreso + posición), para reanudar. */
    readonly estadoSimulacionGuardado = signal<EstadoSimulacion | null>(null);
    /** Índice del punto de entrega abierto (para restaurarlo al volver al mapa). */
    readonly puntoEntregaGuardado = signal<number | null>(null);

    private paradas: ParadaNavegacion[] = [];
    private warehouse: Waypoint = { lat: 0, lng: 0, name: '' };

    private watchId: number | string | null = null;
    private simInterval: ReturnType<typeof setInterval> | null = null;
    private saveInterval: ReturnType<typeof setInterval> | null = null;
    private viajeIdGuardado: string | null = null;
    private simDistanciaAcumulada = 0;
    private simDistAcum: number[] = [];
    private ultimoReRuteo = 0;
    private ultimaPos: LatLng | null = null;
    private ultimaLlegadaAnunciada = -1;
    private pausaPorEntrega = false;
    private readonly esNativo = Capacitor.isNativePlatform();

    /** Hook invocado al detectar la llegada a una parada (antes de avanzar). */
    onLlegadaParada: ((idx: number) => void) | null = null;

    async iniciarNavegacion(
        paradas: ParadaNavegacion[],
        warehouse: Waypoint,
        rutaPrecomputada?: RutaPersistida | null,
        viajeId?: string,
        origen?: Waypoint,
    ): Promise<boolean> {
        this.detener();
        if (paradas.length < 1) return false;

        this.viajeIdGuardado = viajeId ?? null;
        this.paradas = [...paradas].sort((a, b) => a.ordenVisita - b.ordenVisita);
        this.warehouse = warehouse;
        this.totalParadas.set(this.paradas.length);
        this.paradaActual.set(0);
        this.pasoActual.set(0);
        this.ultimaLlegadaAnunciada = -1;

        let ruta: RutaDetallada | null = null;
        if (rutaPrecomputada && rutaPrecomputada.pasos.length > 0) {
            ruta = {
                ...rutaPrecomputada,
                legs: rutaPrecomputada.legs || [],
            };
        } else if (!this.connectivity.isOnline()) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Sin conexión',
                detail: 'No se puede calcular la ruta. Conecta a internet o usa una ruta precalculada.',
            });
            this.navegando.set(false);
            return false;
        } else {
            const waypoints: Waypoint[] = this.paradas.map((p) => ({
                lat: p.latitud,
                lng: p.longitud,
                name: `${p.nombreCliente} - ${p.numeroGuia || p.numeroFactura}`,
            }));

            const inicio: Waypoint = origen ?? warehouse;
            ruta = await this.googleOptimization.getRutaDetallada(waypoints, inicio, warehouse);
        }
        if (!ruta || ruta.pasos.length < 1) {
            this.navegando.set(false);
            return false;
        }

        this.path.set(ruta.path);
        this.pasos.set(ruta.pasos);
        this.legs.set(ruta.legs || []);
        this.navegando.set(true);
        this.pausado.set(false);
        this.precalcularSim();

        const inicioRuta = ruta.path[0] || { lat: warehouse.lat, lng: warehouse.lng };
        this.posicionDriver.set({ lat: inicioRuta.lat, lng: inicioRuta.lng });

        if (this.simulando()) {
            this.iniciarSimulacion();
        } else {
            this.iniciarGps();
        }
        return true;
    }

    setVelocidadSimulacion(v: number) {
        this.velocidadSimulacion.set(v);
    }

    toggleSimulacion() {
        this.setModoSimulacion(!this.simulando());
    }

    togglePausa() {
        if (!this.navegando() || !this.simulando()) return;
        if (this.pausado()) {
            this.pausado.set(false);
            this.reanudarSimulacion();
        } else {
            this.pausado.set(true);
            this.detenerSimulacion();
        }
    }

    /** Pausa la simulación al llegar a una parada hasta completar la entrega. */
    pausarParaEntrega() {
        if (!this.navegando() || !this.simulando() || this.pausado()) return;
        this.pausaPorEntrega = true;
        this.pausado.set(true);
        this.detenerSimulacion();
    }

    /** Reanuda la simulación tras completar la entrega de la parada. */
    reanudarTrasEntrega() {
        if (!this.pausaPorEntrega) return;
        this.pausaPorEntrega = false;
        if (!this.navegando() || !this.simulando() || !this.pausado()) return;
        this.pausado.set(false);
        this.reanudarSimulacion();
    }

    /** Pausa la simulación (sin marcar entrega) y persiste su estado. */
    async pausarYGuardarSimulacion(viajeId: string) {
        if (!this.navegando() || !this.simulando()) return;
        this.pausaPorEntrega = false;
        this.pausado.set(true);
        this.detenerSimulacion();
        const estado: EstadoSimulacion = {
            distancia: this.simDistanciaAcumulada,
            parada: this.paradaActual(),
            paso: this.pasoActual(),
            posicion: this.posicionDriver(),
        };
        this.estadoSimulacionGuardado.set(estado);
        const uid = this.authService.getCurrentUser()?.id;
        if (uid) {
            await this.offlineStorage.guardar(uid, `simulacion:${viajeId}`, estado);
        }
    }

    /** Restaura una simulación guardada (queda pausada en el punto guardado). */
    async restaurarSimulacionSiExiste(viajeId: string): Promise<boolean> {
        this.viajeIdGuardado = viajeId;
        let estado = this.estadoSimulacionGuardado();
        if (!estado) {
            const uid = this.authService.getCurrentUser()?.id;
            if (!uid) return false;
            const caché = await this.offlineStorage.leer<EstadoSimulacion>(
                uid,
                `simulacion:${viajeId}`,
            );
            estado = caché?.data ?? null;
        }
        if (!estado) return false;
        // Cambiar al modo simulación (detiene el GPS que inició la navegación
        // por defecto) y reponer el progreso en pausa.
        if (!this.simulando()) this.setModoSimulacion(true);
        this.restaurarEstado(estado);
        return true;
    }

    /** Limpia el estado de simulación (memoria + persistencia). */
    async limpiarSimulacionGuardada(viajeId: string) {
        this.estadoSimulacionGuardado.set(null);
        const uid = this.authService.getCurrentUser()?.id;
        if (uid) await this.offlineStorage.eliminar(uid, `simulacion:${viajeId}`);
    }

    private restaurarEstado(estado: EstadoSimulacion) {
        if (!this.navegando()) return;
        this.simDistanciaAcumulada = Math.min(
            this.simDistAcum[this.simDistAcum.length - 1] ?? 0,
            estado.distancia,
        );
        this.paradaActual.set(estado.parada);
        this.pasoActual.set(estado.paso);
        const pos = estado.posicion ?? this.posicionEnDistancia(this.simDistanciaAcumulada);
        if (pos) {
            this.posicionDriver.set(pos);
            this.ultimaPos = pos;
        }
        this.pausado.set(true);
        this.detenerSimulacion();
        this.detenerGuardadoPeriodico();
    }

    setModoSimulacion(activo: boolean) {
        if (activo === this.simulando()) return;

        if (activo) {
            this.simulando.set(true);
            this.pausado.set(false);
            this.detenerGps();
            if (this.navegando()) {
                this.iniciarSimulacion();
            }
        } else {
            this.simulando.set(false);
            this.pausado.set(false);
            this.detenerSimulacion();
            this.detenerGuardadoPeriodico();
            if (this.navegando()) {
                this.iniciarGps();
            }
        }
    }

    detener() {
        this.detenerGps();
        this.detenerSimulacion();
        this.detenerGuardadoPeriodico();
        this.navegando.set(false);
        this.pasos.set([]);
        this.path.set([]);
        this.legs.set([]);
        this.pasoActual.set(0);
        this.paradaActual.set(0);
        this.posicionDriver.set(null);
        this.ultimaPos = null;
        this.ultimaLlegadaAnunciada = -1;
        this.rumbo.set(0);
        this.pausado.set(false);
        this.paradas = [];
    }

    reiniciarSimulacion() {
        if (!this.navegando() || this.path().length < 1) return;

        this.simDistanciaAcumulada = 0;
        this.paradaActual.set(0);
        this.pasoActual.set(0);
        this.ultimaLlegadaAnunciada = -1;
        this.distRestantePaso.set(0);
        this.distRestanteParada.set(0);

        if (this.simulando()) {
            const inicio = this.path()[0] || this.warehouse;
            this.posicionDriver.set({ lat: inicio.lat, lng: inicio.lng });
            this.pausado.set(false);
            this.iniciarSimulacion();
        }
    }

    /** Fija una posición inicial para que el conductor siempre se vea en el mapa. */
    inicializarPosicion(warehouse: Waypoint) {
        if (this.posicionDriver()) return;
        this.posicionDriver.set({ lat: warehouse.lat, lng: warehouse.lng });
        if (!this.simulando()) {
            this.iniciarGps();
        }
    }

    private iniciarGps() {
        if (this.esNativo) {
            void this.iniciarGpsNativo();
            return;
        }
        if (!('geolocation' in navigator)) {
            this.messageService.add({
                severity: 'warn',
                summary: 'GPS no disponible',
                detail: 'Este navegador no soporta geolocalización. Usa el modo Simular.',
            });
            return;
        }
        this.watchId = navigator.geolocation.watchPosition(
            (pos) => {
                this.manejarPosicion(pos.coords.latitude, pos.coords.longitude);
            },
            (err) => {
                console.error('Error de geolocalización', err);
                this.messageService.add({
                    severity: 'warn',
                    summary: 'Error de GPS',
                    detail: 'No se pudo obtener tu ubicación. Usa el modo Simular.',
                });
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
        );
    }

    private async iniciarGpsNativo() {
        try {
            const permisos = await Geolocation.requestPermissions({ permissions: ['location'] });
            if (permisos.location !== 'granted') {
                this.messageService.add({
                    severity: 'warn',
                    summary: 'GPS denegado',
                    detail: 'Se requiere el permiso de ubicación. Usa el modo Simular.',
                });
                return;
            }
        } catch (err) {
            console.error('Error solicitando permisos GPS', err);
        }

        const callback = (position: Position | null, err?: unknown) => {
            if (err || !position) {
                console.error('Error de geolocalización', err);
                this.messageService.add({
                    severity: 'warn',
                    summary: 'Error de GPS',
                    detail: 'No se pudo obtener tu ubicación. Usa el modo Simular.',
                });
                return;
            }
            this.manejarPosicion(position.coords.latitude, position.coords.longitude);
        };

        try {
            const id = await Geolocation.watchPosition(
                {
                    enableHighAccuracy: true,
                    maximumAge: 5000,
                    timeout: 15000,
                    interval: 1000,
                    minimumUpdateInterval: 1000,
                },
                callback,
            );
            this.watchId = id;
        } catch (err) {
            console.error('Error iniciando geolocalización', err);
            this.messageService.add({
                severity: 'warn',
                summary: 'Error de GPS',
                detail: 'No se pudo obtener tu ubicación. Usa el modo Simular.',
            });
        }
    }

    private detenerGps() {
        if (this.watchId === null) return;
        if (this.esNativo) {
            const id = this.watchId as string;
            void Geolocation.clearWatch({ id }).catch((err) => console.error('clearWatch', err));
        } else {
            navigator.geolocation.clearWatch(this.watchId as number);
        }
        this.watchId = null;
    }

    private precalcularSim() {
        this.simDistanciaAcumulada = 0;
        this.simDistAcum = [0];
        const path = this.path();
        for (let i = 1; i < path.length; i++) {
            this.simDistAcum.push(this.simDistAcum[i - 1] + haversine(path[i - 1], path[i]));
        }
    }

    private iniciarSimulacion() {
        if (this.path().length < 2) return;
        this.simDistanciaAcumulada = 0;

        const inicio = this.path()[0];
        if (inicio) this.posicionDriver.set({ lat: inicio.lat, lng: inicio.lng });

        this.reanudarSimulacion();
        // Guardar el estado periódicamente para que sobreviva a cierres abruptos
        // (el ngOnDestroy no corre si la app se mata por completo).
        this.iniciarGuardadoPeriodico();
    }

    private iniciarGuardadoPeriodico() {
        if (this.saveInterval || !this.viajeIdGuardado) return;
        this.saveInterval = setInterval(() => {
            void this.guardarEstadoSimulacion();
        }, 5000);
    }

    private async guardarEstadoSimulacion() {
        const viajeId = this.viajeIdGuardado;
        if (!viajeId) return;
        const uid = this.authService.getCurrentUser()?.id;
        if (!uid) return;
        const estado: EstadoSimulacion = {
            distancia: this.simDistanciaAcumulada,
            parada: this.paradaActual(),
            paso: this.pasoActual(),
            posicion: this.posicionDriver(),
        };
        this.estadoSimulacionGuardado.set(estado);
        await this.offlineStorage.guardar(uid, `simulacion:${viajeId}`, estado);
    }

    private reanudarSimulacion() {
        if (this.path().length < 2) return;
        this.detenerSimulacion();

        const mover = () => {
            const total = this.simDistAcum[this.simDistAcum.length - 1];
            if (total <= 0) return;
            const avance = this.velocidadSimulacion() * (SIM_INTERVALO_MS / 1000);
            this.simDistanciaAcumulada = Math.min(total, this.simDistanciaAcumulada + avance);

            const pos = this.posicionEnDistancia(this.simDistanciaAcumulada);
            if (pos) this.manejarPosicion(pos.lat, pos.lng);
        };

        this.simInterval = setInterval(mover, SIM_INTERVALO_MS);
    }

    private detenerSimulacion() {
        if (this.simInterval) {
            clearInterval(this.simInterval);
            this.simInterval = null;
        }
    }

    private detenerGuardadoPeriodico() {
        if (this.saveInterval) {
            clearInterval(this.saveInterval);
            this.saveInterval = null;
        }
    }

    private posicionEnDistancia(d: number): LatLng | null {
        const path = this.path();
        let i = 1;
        while (i < path.length && this.simDistAcum[i] < d) i++;
        if (i >= path.length) {
            const last = path[path.length - 1];
            return last ? { lat: last.lat, lng: last.lng } : null;
        }
        const prev = path[i - 1];
        const next = path[i];
        const segLen = this.simDistAcum[i] - this.simDistAcum[i - 1];
        const t = segLen > 0 ? (d - this.simDistAcum[i - 1]) / segLen : 0;
        return {
            lat: prev.lat + (next.lat - prev.lat) * t,
            lng: prev.lng + (next.lng - prev.lng) * t,
        };
    }

    private manejarPosicion(lat: number, lng: number) {
        const pos: LatLng = { lat, lng };
        this.posicionDriver.set(pos);

        if (this.ultimaPos) {
            this.rumbo.set(calcularBearing(this.ultimaPos, pos));
        }
        this.ultimaPos = pos;

        this.avanzarPaso(pos);
        this.comprobarLlegadaParada(pos);
        this.comprobarReRuteo(pos);
    }

    private avanzarPaso(pos: LatLng) {
        const pasos = this.pasos();
        if (pasos.length < 1) return;

        let idx = this.pasoActual();
        // Avanza monótonamente en el orden real de la ruta: al llegar al fin
        // del paso actual (< UMBRAL_PASO_M), pasa al siguiente. No salta entre
        // paradas ni se adelanta a pasos de otra leg (heurística anterior).
        while (idx + 1 < pasos.length && haversine(pos, pasos[idx].fin) < UMBRAL_PASO_M) {
            idx++;
        }
        this.pasoActual.set(idx);
        this.distRestantePaso.set(Math.round(haversine(pos, pasos[idx].fin)));
    }

    private comprobarLlegadaParada(pos: LatLng) {
        const paradas = this.paradas;
        if (paradas.length < 1) return;
        const idx = this.paradaActual();
        if (idx >= paradas.length) return;

        const parada = paradas[idx];
        const dist = haversine(pos, { lat: parada.latitud, lng: parada.longitud });
        this.distRestanteParada.set(Math.round(dist));

        if (dist < UMBRAL_LLEGADA_M) {
            // En simulación el punto sigue el path exacto, así que se puede
            // llegar mucho más cerca del destino que en GPS real (donde el
            // margen de 40 m compensa la imprecisión de la señal). Aquí se
            // acerca el marcador hasta ~3 m del punto de entrega antes de
            // detenerse, en vez de quedarse en el borde del área.
            if (this.simulando() && dist > 3) {
                // Interpolar desde la PARADA hacia la posición actual: el punto
                // queda a 3 m de la parada (no desde pos hacia parada).
                const t = 3 / dist;
                const cerca: LatLng = {
                    lat: parada.latitud + (pos.lat - parada.latitud) * t,
                    lng: parada.longitud + (pos.lng - parada.longitud) * t,
                };
                this.posicionDriver.set(cerca);
                this.ultimaPos = cerca;
                this.distRestanteParada.set(3);
            }

            // Anunciar la llegada una sola vez por parada (la última no avanza
            // paradaActual, así que sin este latch el toast se repetía cada tick).
            if (idx === this.ultimaLlegadaAnunciada) return;
            this.ultimaLlegadaAnunciada = idx;
            this.onLlegadaParada?.(idx);
            // En simulación: detenerse en la parada hasta completar la entrega.
            this.pausarParaEntrega();
            if (idx < paradas.length - 1) {
                this.paradaActual.set(idx + 1);
                this.messageService.add({
                    severity: 'success',
                    summary: 'Has llegado',
                    detail: `${parada.nombreCliente} — ${parada.numeroGuia || parada.numeroFactura}`,
                });
            } else {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Ruta completada',
                    detail: 'Llegaste a la última parada.',
                });
            }
        }
    }

    private comprobarReRuteo(pos: LatLng) {
        if (!this.connectivity.isOnline()) return;
        if (this.simulando()) return;
        if (this.path().length < 1) return;
        const ahora = Date.now();
        if (ahora - this.ultimoReRuteo < DEBOUNCE_RE_RUTEO_MS) return;

        const desvio = distanciaAPolyline(pos, this.path());
        if (desvio <= UMBRAL_RE_RUTEO_M) return;

        void this.reRutear(pos);
    }

    private async reRutear(pos: LatLng) {
        this.ultimoReRuteo = Date.now();
        this.recalculando.set(true);

        const restantes = this.paradas.slice(this.paradaActual());
        const waypoints: Waypoint[] = restantes.map((p) => ({
            lat: p.latitud,
            lng: p.longitud,
            name: `${p.nombreCliente} - ${p.numeroGuia || p.numeroFactura}`,
        }));

        if (waypoints.length < 1) {
            this.recalculando.set(false);
            return;
        }

        const ruta = await this.googleOptimization.getRutaDetallada(
            waypoints,
            { lat: pos.lat, lng: pos.lng, name: 'Posición actual' },
            this.warehouse,
        );

        this.recalculando.set(false);

        if (!ruta || ruta.pasos.length < 1) {
            this.messageService.add({
                severity: 'warn',
                summary: 'No se pudo recalcular',
                detail: 'Se mantiene la ruta actual.',
            });
            return;
        }

        this.path.set(ruta.path);
        this.pasos.set(ruta.pasos);
        this.legs.set(ruta.legs || []);
        this.pasoActual.set(0);
        this.precalcularSim();
        this.messageService.add({
            severity: 'info',
            summary: 'Ruta recalculada',
            detail: 'Se ajustó la ruta desde tu posición actual.',
        });
    }
}
