import {
    Component,
    CUSTOM_ELEMENTS_SCHEMA,
    DestroyRef,
    OnInit,
    inject,
    signal,
    computed,
    ElementRef,
    viewChild,
    afterNextRender,
    effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { Capacitor } from '@capacitor/core';
import { GoogleMap, LatLngBounds, Marker, Polyline } from '@capacitor/google-maps';

import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { SelectButtonModule } from 'primeng/selectbutton';

import { ViajeService } from '@/app/services/viaje.service';
import { ViajeChofer } from '@/app/services/viaje.types';
import { RutaPersistida } from '@/app/services/viaje.types';
import {
    GoogleMapsOptimizationService,
    Waypoint,
} from '../../../admin/pages/map/map/google-maps-optimization.service';
import { environment } from '@/environments/environment';
import { NavigationService, ParadaNavegacion } from '../../services/navigation.service';
import { iconoManiobra, limpiarHtmlInstruccion, LatLng } from './navegacion.util';

interface ParadaMapa {
    id: string;
    ordenVisita: number;
    numeroGuia: string;
    numeroFactura: string;
    nombreCliente: string;
    direccion: string;
    estado: string;
    latitud?: number | null;
    longitud?: number | null;
}

@Component({
    selector: 'app-mi-ruta',
    standalone: true,
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        TagModule,
        TooltipModule,
        SelectButtonModule,
    ],
    templateUrl: './mi-ruta.component.html',
    styleUrl: './mi-ruta.component.css',
})
export class MiRutaComponent implements OnInit {
    private messageService = inject(MessageService);
    private viajeService = inject(ViajeService);
    private googleOptimization = inject(GoogleMapsOptimizationService);
    private destroyRef = inject(DestroyRef);
    navigation = inject(NavigationService);

    private esNativo = Capacitor.isNativePlatform();
    private readonly apiKey = this.esNativo
        ? environment.androidGoogleMapsKey
        : environment.googleMapsKey;

    private mapaEl = viewChild<ElementRef<HTMLElement>>('mapaElement');

    topOffset = signal(77);
    bottomOffset = signal(68);
    siguiendo = signal(true);
    verPasos = signal(true);
    private mapaListo = signal(false);

    constructor() {
        const medirOffsets = () => {
            const topbar = document.querySelector('app-driver-topbar') as HTMLElement | null;
            const nav = document.querySelector('app-driver-bottom-nav') as HTMLElement | null;
            const topbarDiv = topbar?.firstElementChild as HTMLElement | null;
            const navDiv = nav?.firstElementChild as HTMLElement | null;
            if (topbarDiv) this.topOffset.set(topbarDiv.getBoundingClientRect().bottom);
            if (navDiv)
                this.bottomOffset.set(window.innerHeight - navDiv.getBoundingClientRect().top);
        };
        afterNextRender(medirOffsets);
        window.addEventListener('resize', medirOffsets);

        afterNextRender(() => {
            // Android dibuja el mapa nativo debajo del WebView: requiere transparencia total.
            document.documentElement.classList.add('mapa-nativo');
        });

        effect(() => {
            const pos = this.navigation.posicionDriver();
            const listo = this.mapaListo();
            if (pos && listo) void this.moverMarcadorChofer(pos);
        });

        effect(() => {
            const navegando = this.navigation.navegando();
            const path = this.navigation.path();
            const legs = this.navigation.legs();
            const listo = this.mapaListo();
            if (!listo) return;
            if (navegando && legs.length > 0) {
                void this.dibujarRutaPorTramos(legs);
            } else if (navegando && path.length > 0) {
                void this.dibujarPolyline(path);
            } else if (!navegando) {
                void this.limpiarPolyline();
            }
        });

        this.destroyRef.onDestroy(() => {
            window.removeEventListener('resize', medirOffsets);
            document.documentElement.classList.remove('mapa-nativo');
            if (this.mapa) void this.mapa.destroy().catch(() => undefined);
        });
    }

    viajes = signal<ViajeChofer[]>([]);
    paradas = signal<ParadaMapa[]>([]);
    cargando = signal(true);
    iniciando = signal(false);

    private mapa!: GoogleMap;
    private markerIds: string[] = [];
    private driverMarkerId: string | null = null;
    private routePolylineIds: string[] = [];
    private segmentPolylineIds: string[] = [];
    private currentLocationEnabled = false;
    private ultimoRefreshMarker = 0;

    readonly activeViaje = computed(() => this.viajes()[0] || null);

    get fechaActual(): string {
        const hoy = new Date();
        return hoy.toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
    }

    get viajeAbierto(): boolean {
        return this.activeViaje()?.estado === 'programado';
    }

    get viajeEnProceso(): boolean {
        return this.activeViaje()?.estado === 'proceso';
    }

    async ngOnInit() {
        await this.cargarViaje();
        this.cargando.set(false);
    }

    private async cargarViaje() {
        try {
            const viajes = await this.viajeService.obtenerViajeChofer();
            this.viajes.set(viajes);

            const viaje = viajes[0];
            if (viaje) {
                this.paradas.set(
                    (viaje.paradas || [])
                        .slice()
                        .sort((a, b) => a.orden_visita - b.orden_visita)
                        .map((p) => ({
                            id: p.id_factura,
                            ordenVisita: p.orden_visita,
                            numeroGuia: p.codigo_guia || '',
                            numeroFactura: p.numero_factura || '',
                            nombreCliente: p.nombre_cliente || '',
                            direccion: p.direccion || '',
                            estado: p.estado_factura || 'embarque',
                            latitud: p.latitud,
                            longitud: p.longitud,
                        })),
                );
            } else {
                this.paradas.set([]);
            }

            setTimeout(() => void this.mostrarRutaEnMapa(), 100);
        } catch (err) {
            console.error('Error al cargar viaje', err);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudo cargar tu viaje.',
            });
        }
    }

    private async initMapa() {
        if (this.mapa || !this.mapaEl()) return;
        const el = this.mapaEl()!.nativeElement;
        if (!el) return;
        if (el.clientHeight === 0) {
            setTimeout(() => void this.initMapa(), 150);
            return;
        }
        try {
            this.mapa = await GoogleMap.create({
                id: 'mi-ruta-chofer',
                element: el,
                apiKey: this.apiKey,
                config: {
                    center: { lat: environment.warehouseLat, lng: environment.warehouseLng },
                    zoom: 10,
                    styles: [
                        {
                            featureType: 'poi',
                            elementType: 'labels',
                            stylers: [{ visibility: 'off' }],
                        },
                        {
                            featureType: 'transit',
                            elementType: 'labels.icon',
                            stylers: [{ visibility: 'off' }],
                        },
                    ],
                },
            });
            this.mapaListo.set(true);
        } catch (err) {
            console.error('Error al crear el mapa', err);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudo inicializar el mapa.',
            });
        }
    }

    private limpiarPolyline(): Promise<void> {
        if (this.routePolylineIds.length > 0 && this.mapa) {
            const ids = this.routePolylineIds;
            this.routePolylineIds = [];
            return this.mapa.removePolylines(ids).catch(() => undefined);
        }
        this.routePolylineIds = [];
        return Promise.resolve();
    }

    private limpiarSegmentos(): Promise<void> {
        if (this.segmentPolylineIds.length > 0 && this.mapa) {
            const ids = this.segmentPolylineIds;
            this.segmentPolylineIds = [];
            return this.mapa.removePolylines(ids).catch(() => undefined);
        }
        this.segmentPolylineIds = [];
        return Promise.resolve();
    }

    private async quitarMarcadorDriver() {
        if (this.driverMarkerId && this.mapa) {
            const id = this.driverMarkerId;
            this.driverMarkerId = null;
            try {
                await this.mapa.removeMarker(id);
            } catch {
                /* noop */
            }
            return;
        }
        this.driverMarkerId = null;
    }

    private async dibujarPolyline(path: LatLng[]) {
        await this.limpiarPolyline();
        if (!this.mapa || path.length < 2) return;
        try {
            this.routePolylineIds = await this.mapa.addPolylines([
                {
                    path: path.map((p) => ({ lat: p.lat, lng: p.lng })),
                    geodesic: true,
                    strokeColor: '#22c55e',
                    strokeOpacity: 0.85,
                    strokeWeight: 5,
                    zIndex: 2,
                } as Polyline,
            ]);
        } catch (err) {
            console.error('Error dibujando la ruta', err);
        }
    }

    /** Dibuja la ruta por tramos siguiendo las calles: una polyline por cada
     *  leg de Google (almacén → parada 1, parada 1 → parada 2, …). Cada leg
     *  usa su path detallado (street-following), no solo los extremos de las
     *  maniobras. */
    private async dibujarRutaPorTramos(legs: { path: LatLng[] }[]) {
        await this.limpiarSegmentos();
        if (!this.mapa || legs.length < 1) return;

        const polylines: Polyline[] = legs
            .filter((leg) => leg.path.length >= 2)
            .map((leg) => ({
                path: leg.path.map((p) => ({ lat: p.lat, lng: p.lng })),
                geodesic: true,
                strokeColor: '#22c55e',
                strokeOpacity: 0.85,
                strokeWeight: 5,
                zIndex: 2,
            }));
        if (polylines.length < 1) return;
        try {
            this.segmentPolylineIds = await this.mapa.addPolylines(polylines);
        } catch (err) {
            console.error('Error dibujando los tramos', err);
        }
    }

    private async mostrarRutaEnMapa() {
        await this.initMapa();
        if (!this.mapa) return;

        if (this.markerIds.length > 0) {
            const ids = this.markerIds;
            this.markerIds = [];
            try {
                await this.mapa.removeMarkers(ids);
            } catch {
                /* noop */
            }
        }

        const conCoords = this.paradas()
            .filter((p) => p.latitud != null && p.longitud != null)
            .sort((a, b) => a.ordenVisita - b.ordenVisita);

        const warehouse: Waypoint = {
            lat: environment.warehouseLat,
            lng: environment.warehouseLng,
            name: 'Almacén',
        };

        const marcadores: Marker[] = [
            {
                coordinate: { lat: warehouse.lat, lng: warehouse.lng },
                title: 'Almacén',
                tintColor: { r: 139, g: 92, b: 246, a: 255 },
                zIndex: 5,
            },
            ...conCoords.map((p, i) => this.crearMarcadorEntrega(i, p)),
        ];
        try {
            this.markerIds = await this.mapa.addMarkers(marcadores);
        } catch (err) {
            console.error('Error añadiendo marcadores', err);
        }

        const lats = [warehouse.lat, ...conCoords.map((p) => p.latitud!)];
        const lngs = [warehouse.lng, ...conCoords.map((p) => p.longitud!)];
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);
        try {
            await this.mapa.fitBounds(
                new LatLngBounds({
                    southwest: { lat: minLat, lng: minLng },
                    center: { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 },
                    northeast: { lat: maxLat, lng: maxLng },
                }),
                80,
            );
        } catch (err) {
            console.error('Error ajustando la cámara', err);
        }

        this.navigation.inicializarPosicion(warehouse);

        const pos = this.navigation.posicionDriver();
        if (pos) await this.moverMarcadorChofer(pos);

        const rutaPersistida = this.activeViaje()?.ruta_detallada;
        if (rutaPersistida && rutaPersistida.legs && rutaPersistida.legs.length > 0) {
            await this.dibujarRutaPorTramos(rutaPersistida.legs);
        } else if (rutaPersistida && rutaPersistida.path.length > 1) {
            await this.dibujarPolyline(rutaPersistida.path);
        }

        const navegando = this.navigation.navegando();
        const path = this.navigation.path();
        if (navegando && path.length > 0) {
            await this.dibujarPolyline(path);
        }

        if (this.viajeEnProceso) {
            await this.iniciarNavegacion();
        } else if (this.navigation.navegando()) {
            this.navigation.detener();
        }
    }

    private async iniciarNavegacion(rutaPrecomputada?: RutaPersistida | null) {
        const conCoords = this.paradas()
            .filter((p) => p.latitud != null && p.longitud != null)
            .sort((a, b) => a.ordenVisita - b.ordenVisita);

        const paradasNav: ParadaNavegacion[] = conCoords.map((p) => ({
            id: p.id,
            ordenVisita: p.ordenVisita,
            numeroGuia: p.numeroGuia,
            numeroFactura: p.numeroFactura,
            nombreCliente: p.nombreCliente,
            latitud: p.latitud!,
            longitud: p.longitud!,
        }));

        const warehouse: Waypoint = {
            lat: environment.warehouseLat,
            lng: environment.warehouseLng,
            name: 'Almacén',
        };

        const rutaPersistida = rutaPrecomputada ?? this.activeViaje()?.ruta_detallada;
        const ok = await this.navigation.iniciarNavegacion(paradasNav, warehouse, rutaPersistida);
        if (!ok && this.viajeEnProceso) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Sin navegación',
                detail: 'No se pudo calcular la ruta detallada para este viaje.',
            });
        }
    }

    private async moverMarcadorChofer(pos: LatLng) {
        if (!this.mapa) return;
        const navegando = this.navigation.navegando();

        // Nativos + GPS real: punto azul nativo (enableCurrentLocation), sin marcador propio.
        if (this.esNativo && !this.navigation.simulando()) {
            if (!this.currentLocationEnabled) {
                this.currentLocationEnabled = true;
                try {
                    await this.mapa.enableCurrentLocation(true);
                } catch (err) {
                    console.error('enableCurrentLocation', err);
                }
            }
            await this.quitarMarcadorDriver();
            if (navegando && this.siguiendo()) {
                await this.mapa.setCamera({
                    coordinate: { lat: pos.lat, lng: pos.lng },
                    animate: true,
                });
            }
            return;
        }

        if (this.esNativo && this.currentLocationEnabled) {
            this.currentLocationEnabled = false;
            try {
                await this.mapa.enableCurrentLocation(false);
            } catch {
                /* noop */
            }
        }

        // En nativo no existe mover un marker: se recrea con throttle (~1 s) para no saturar el bridge.
        const ahora = Date.now();
        if (this.esNativo && ahora - this.ultimoRefreshMarker < 1000) return;
        this.ultimoRefreshMarker = ahora;

        await this.quitarMarcadorDriver();
        try {
            this.driverMarkerId = await this.mapa.addMarker({
                coordinate: { lat: pos.lat, lng: pos.lng },
                title: 'Tu posición',
                tintColor: { r: 37, g: 99, b: 235, a: 255 },
                zIndex: 99,
            });
        } catch (err) {
            console.error('Error moviendo el marcador del chofer', err);
        }

        if (navegando && this.siguiendo()) {
            await this.mapa.setCamera({
                coordinate: { lat: pos.lat, lng: pos.lng },
                animate: true,
            });
        }
    }

    private crearMarcadorEntrega(index: number, p: ParadaMapa): Marker {
        return {
            coordinate: { lat: p.latitud!, lng: p.longitud! },
            title: `${index + 1} · ${p.nombreCliente} · ${p.numeroGuia || p.numeroFactura}`,
            tintColor: { r: 245, g: 158, b: 11, a: 255 },
            zIndex: 1,
        };
    }

    async iniciarViaje() {
        const viaje = this.activeViaje();
        if (!viaje || !this.viajeAbierto) return;

        const conCoords = this.paradas().filter((p) => p.latitud != null && p.longitud != null);
        if (conCoords.length < 1) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Sin coordenadas',
                detail: 'Las paradas no tienen ubicación para calcular la ruta.',
            });
            return;
        }

        this.iniciando.set(true);
        try {
            const waypoints: Waypoint[] = conCoords.map((p) => ({
                lat: p.latitud!,
                lng: p.longitud!,
                name: `${p.nombreCliente} - ${p.numeroGuia || p.numeroFactura}`,
            }));
            const warehouse: Waypoint = {
                lat: environment.warehouseLat,
                lng: environment.warehouseLng,
                name: 'Almacén',
            };

            const result = await this.googleOptimization.optimize(waypoints, warehouse, warehouse);
            const orderedIds = result
                ? result.order.map((idx) => conCoords[idx].id)
                : conCoords.map((p) => p.id);

            // Modo prueba: solo se persiste el orden de paradas (actualizar_orden_viaje).
            // NO se cambia el estado del viaje ni de las facturas (iniciar_viaje).
            await this.viajeService.actualizarOrdenViaje(viaje.id_viaje, orderedIds);

            const detallada = result
                ? await this.googleOptimization.getRutaDetallada(
                      result.order.map((idx) => waypoints[idx]),
                      warehouse,
                      warehouse,
                  )
                : null;
            if (detallada) {
                await this.viajeService.guardarRutaViaje(viaje.id_viaje, detallada);
            }

            await this.iniciarNavegacion(detallada);

            this.messageService.add({
                severity: 'success',
                summary: 'Simulación lista',
                detail: 'La ruta fue optimizada y la navegación iniciada desde el almacén.',
            });
        } catch (err) {
            console.error('Error al iniciar simulación', err);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudo iniciar la simulación. Intenta nuevamente.',
            });
        } finally {
            this.iniciando.set(false);
        }
    }

    toggleSimulacion() {
        this.navigation.toggleSimulacion();
    }

    togglePausa() {
        this.navigation.togglePausa();
    }

    readonly modoOpciones = [
        { label: 'Modo normal', value: 'gps' },
        { label: 'Modo simulación', value: 'simulacion' },
    ];

    get modoNavegacion(): string {
        return this.navigation.simulando() ? 'simulacion' : 'gps';
    }

    set modoNavegacion(v: string) {
        this.navigation.setModoSimulacion(v === 'simulacion');
    }

    reiniciarSimulacion() {
        this.navigation.reiniciarSimulacion();
    }

    toggleSeguimiento() {
        this.siguiendo.update((v) => !v);
    }

    toggleVerPasos() {
        this.verPasos.update((v) => !v);
    }

    formatearDistancia(m: number): string {
        if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
        return `${Math.round(m)} m`;
    }

    formatearDuracion(s: number): string {
        if (s >= 60) return `${Math.round(s / 60)} min`;
        return `${Math.round(s)} s`;
    }

    iconoManiobra = iconoManiobra;
    limpiarHtmlInstruccion = limpiarHtmlInstruccion;
}
