import { Injectable, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';

import {
    GoogleMapsOptimizationService,
    PasoRuta,
    RutaDetallada,
    Waypoint,
} from '@/app/admin/pages/map/map/google-maps-optimization.service';
import { RutaPersistida } from '@/app/services/viaje.types';
import { distanciaAPolyline, haversine, LatLng } from '../pages/viajes/navegacion.util';

export interface ParadaNavegacion {
    id: string;
    nombreCliente: string;
    numeroGuia: string;
    numeroFactura: string;
    ordenVisita: number;
    latitud: number;
    longitud: number;
}

const UMBRAL_PASO_M = 25;
const UMBRAL_LLEGADA_M = 40;
const UMBRAL_RE_RUTEO_M = 300;
const DEBOUNCE_RE_RUTEO_MS = 60000;
const SIM_VELOCIDAD_M_POR_TICK = 250;
const SIM_INTERVALO_MS = 200;

@Injectable()
export class NavigationService {
    private messageService = inject(MessageService);
    private googleOptimization = inject(GoogleMapsOptimizationService);

    readonly navegando = signal(false);
    readonly pasos = signal<PasoRuta[]>([]);
    readonly path = signal<LatLng[]>([]);
    readonly legs = signal<{ path: LatLng[] }[]>([]);
    readonly pasoActual = signal(0);
    readonly paradaActual = signal(0);
    readonly posicionDriver = signal<LatLng | null>(null);
    readonly simulando = signal(false);
    readonly pausado = signal(false);
    readonly distRestantePaso = signal(0);
    readonly distRestanteParada = signal(0);
    readonly recalculando = signal(false);
    readonly totalParadas = signal(0);

    private paradas: ParadaNavegacion[] = [];
    private warehouse: Waypoint = { lat: 0, lng: 0, name: '' };

    private watchId: number | null = null;
    private simInterval: ReturnType<typeof setInterval> | null = null;
    private simDistanciaAcumulada = 0;
    private simDistAcum: number[] = [];
    private ultimoReRuteo = 0;

    async iniciarNavegacion(
        paradas: ParadaNavegacion[],
        warehouse: Waypoint,
        rutaPrecomputada?: RutaPersistida | null,
    ): Promise<boolean> {
        this.detener();
        if (paradas.length < 1) return false;

        this.paradas = [...paradas].sort((a, b) => a.ordenVisita - b.ordenVisita);
        this.warehouse = warehouse;
        this.totalParadas.set(this.paradas.length);
        this.paradaActual.set(0);
        this.pasoActual.set(0);

        let ruta: RutaDetallada | null = null;
        if (rutaPrecomputada && rutaPrecomputada.pasos.length > 0) {
            ruta = {
                ...rutaPrecomputada,
                legs: rutaPrecomputada.legs || [],
            };
        } else {
            const waypoints: Waypoint[] = this.paradas.map((p) => ({
                lat: p.latitud,
                lng: p.longitud,
                name: `${p.nombreCliente} - ${p.numeroGuia || p.numeroFactura}`,
            }));

            ruta = await this.googleOptimization.getRutaDetallada(waypoints, warehouse, warehouse);
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

        const inicio = ruta.path[0] || { lat: warehouse.lat, lng: warehouse.lng };
        this.posicionDriver.set({ lat: inicio.lat, lng: inicio.lng });

        if (this.simulando()) {
            this.iniciarSimulacion();
        } else {
            this.iniciarGps();
        }
        return true;
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
            if (this.navegando()) {
                this.iniciarGps();
            }
        }
    }

    detener() {
        this.detenerGps();
        this.detenerSimulacion();
        this.navegando.set(false);
        this.pasos.set([]);
        this.path.set([]);
        this.legs.set([]);
        this.pasoActual.set(0);
        this.paradaActual.set(0);
        this.posicionDriver.set(null);
        this.pausado.set(false);
        this.paradas = [];
    }

    reiniciarSimulacion() {
        if (!this.navegando() || this.path().length < 1) return;

        this.simDistanciaAcumulada = 0;
        this.paradaActual.set(0);
        this.pasoActual.set(0);
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

    private detenerGps() {
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
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
    }

    private reanudarSimulacion() {
        if (this.path().length < 2) return;
        this.detenerSimulacion();

        const mover = () => {
            const total = this.simDistAcum[this.simDistAcum.length - 1];
            if (total <= 0) return;
            this.simDistanciaAcumulada = Math.min(
                total,
                this.simDistanciaAcumulada + SIM_VELOCIDAD_M_POR_TICK,
            );

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

        this.avanzarPaso(pos);
        this.comprobarLlegadaParada(pos);
        this.comprobarReRuteo(pos);
    }

    private avanzarPaso(pos: LatLng) {
        const pasos = this.pasos();
        if (pasos.length < 1) return;

        let mejor = this.pasoActual();
        let mejorDist = Infinity;
        for (let i = 0; i < pasos.length; i++) {
            const d = haversine(pos, pasos[i].fin);
            if (d < mejorDist) {
                mejorDist = d;
                mejor = i;
            }
        }

        if (mejor >= this.pasoActual()) this.pasoActual.set(mejor);
        this.distRestantePaso.set(Math.round(mejorDist));
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
