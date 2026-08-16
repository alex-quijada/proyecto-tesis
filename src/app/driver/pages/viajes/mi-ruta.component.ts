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
    ViewChild,
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
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';

import { ViajeService } from '@/app/services/viaje.service';
import { RutaPersistida } from '@/app/services/viaje.types';
import {
    GoogleMapsOptimizationService,
    Waypoint,
} from '../../../admin/pages/map/map/google-maps-optimization.service';
import { environment } from '@/environments/environment';
import { ConnectivityService } from '@/app/services/connectivity.service';
import { DriverStoreService } from '../../services/driver-store.service';
import { NavigationService, ParadaNavegacion } from '../../services/navigation.service';
import { FirmaDialogComponent } from '../../components/firma-dialog/firma-dialog.component';
import { haversine, iconoManiobra, limpiarHtmlInstruccion, LatLng } from './navegacion.util';

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
    montoDolares?: number;
    rif?: string;
    observaciones?: string;
}

/** Punto de entrega: agrupa las facturas que comparten coordenadas (misma dirección). */
interface PuntoEntrega {
    key: string;
    ordenVisita: number;
    nombreCliente: string;
    direccion: string;
    latitud: number;
    longitud: number;
    facturaIds: string[];
    facturas: ParadaMapa[];
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
        DialogModule,
        TextareaModule,
        FirmaDialogComponent,
    ],
    templateUrl: './mi-ruta.component.html',
    styleUrl: './mi-ruta.component.css',
})
export class MiRutaComponent implements OnInit {
    private messageService = inject(MessageService);
    private viajeService = inject(ViajeService);
    private googleOptimization = inject(GoogleMapsOptimizationService);
    private destroyRef = inject(DestroyRef);
    private connectivity = inject(ConnectivityService);
    navigation = inject(NavigationService);
    store = inject(DriverStoreService);

    private esNativo = Capacitor.isNativePlatform();
    private readonly apiKey = this.esNativo
        ? environment.androidGoogleMapsKey
        : environment.googleMapsKey;

    private mapaEl = viewChild<ElementRef<HTMLElement>>('mapaElement');

    topOffset = signal(77);
    bottomOffset = signal(68);
    siguiendo = signal(true);
    verPasos = signal(true);
    vista3d = signal(true);
    pasosAbiertos = signal(true);
    puntosAbiertos = signal(false);
    controlesAbiertos = signal(false);
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

        // Re-sincroniza las paradas cuando el viaje/guías cambian (llegadas GPS,
        // inicio de entrega, firmas, incidencias): mantiene el sheet al día.
        effect(() => {
            this.store.viajesChofer();
            this.store.guiasAsignadas();
            this.sincronizarParadas();
        });

        // Al completar todas las facturas del punto, volver al panel de navegación.
        effect(() => {
            const punto = this.puntoActual();
            if (!punto) return;
            const pendientes = punto.facturas.filter(
                (f) => f.estado !== 'finalizado' && f.estado !== 'incidencia',
            );
            if (pendientes.length === 0) this.puntoEntrega.set(null);
        });

        this.destroyRef.onDestroy(() => {
            window.removeEventListener('resize', medirOffsets);
            document.documentElement.classList.remove('mapa-nativo');
            if (this.navigation.onLlegadaParada) this.navigation.onLlegadaParada = null;
            if (this.mapa) void this.mapa.destroy().catch(() => undefined);
        });
    }

    paradas = signal<ParadaMapa[]>([]);
    cargando = signal(true);
    iniciando = signal(false);
    sheetExpandido = signal(false);

    @ViewChild(FirmaDialogComponent) private firmaDialog!: FirmaDialogComponent;

    puntoEntrega = signal<number | null>(null);
    entregando = signal(false);
    finalizando = signal(false);
    firmaGuia = signal<ParadaMapa | null>(null);
    incidenciaGuia = signal<ParadaMapa | null>(null);
    incidenciaTexto = signal('');

    /** Puntos de entrega: facturas agrupadas por coordenadas (misma dirección). */
    readonly puntos = computed<PuntoEntrega[]>(() => {
        const mapa = new Map<string, PuntoEntrega>();
        const conCoords = this.paradas()
            .filter((p) => p.latitud != null && p.longitud != null)
            .sort((a, b) => a.ordenVisita - b.ordenVisita);
        for (const p of conCoords) {
            const key = `${p.latitud},${p.longitud}`;
            let punto = mapa.get(key);
            if (!punto) {
                punto = {
                    key,
                    ordenVisita: p.ordenVisita,
                    nombreCliente: p.nombreCliente,
                    direccion: p.direccion,
                    latitud: p.latitud!,
                    longitud: p.longitud!,
                    facturaIds: [],
                    facturas: [],
                };
                mapa.set(key, punto);
            }
            punto.ordenVisita = Math.min(punto.ordenVisita, p.ordenVisita);
            punto.facturaIds.push(p.id);
            punto.facturas.push(p);
        }
        return Array.from(mapa.values()).sort((a, b) => a.ordenVisita - b.ordenVisita);
    });

    /** Los 3 pasos siguientes al que se muestra en grande (maniobra actual). */
    readonly pasosSiguientes = computed(() => {
        const pasoActual = this.navigation.pasoActual();
        return this.navigation.pasos().slice(pasoActual + 1, pasoActual + 4);
    });

    /** El chofer está cerca del almacén (regresó del viaje). */
    readonly cercaDeAlmacen = computed(() => {
        const pos = this.navigation.posicionDriver();
        if (!pos) return false;
        return haversine(pos, { lat: environment.warehouseLat, lng: environment.warehouseLng }) < 100;
    });

    /** Todas las entregas del viaje quedaron finalizadas (o con incidencia). */
    readonly viajeCompletado = computed(() => {
        const pts = this.puntos();
        return (
            pts.length > 0 &&
            pts.every((p) =>
                p.facturas.every(
                    (f) => f.estado === 'finalizado' || f.estado === 'incidencia',
                ),
            )
        );
    });

    readonly puntoActual = computed<PuntoEntrega | null>(() => {
        const idx = this.puntoEntrega();
        if (idx === null || idx < 0) return null;
        return this.puntos()[idx] ?? null;
    });

    readonly facturasEnEspera = computed(() =>
        (this.puntoActual()?.facturas || []).filter((f) => f.estado === 'espera'),
    );

    readonly facturasEnEntrega = computed(() =>
        (this.puntoActual()?.facturas || []).filter((f) => f.estado === 'entrega'),
    );

    readonly facturasPendientesPunto = computed(() =>
        (this.puntoActual()?.facturas || []).filter(
            (f) => f.estado !== 'finalizado' && f.estado !== 'incidencia',
        ),
    );

    /** Objeto mínimo para el firma-dialog compartido. */
    readonly firmaGuiaData = computed(() => {
        const g = this.firmaGuia();
        if (!g) return null;
        return {
            numeroGuia: g.numeroGuia,
            cliente: g.nombreCliente,
            precioCarga: g.montoDolares || 0,
        };
    });

    private mapa!: GoogleMap;
    private markerIds: string[] = [];
    private driverMarkerId: string | null = null;
    private routePolylineIds: string[] = [];
    private segmentPolylineIds: string[] = [];
    private currentLocationEnabled = false;
    private ultimoRefreshMarker = 0;
    private sheetDragStartY = 0;
    private sheetDragActivo = false;

    readonly activeViaje = computed(() => this.store.viajesChofer()[0] || null);

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
        await this.store.cargarViajes();
        this.sincronizarParadas();
        this.cargando.set(false);

        // Llegada GPS a un punto → facturas del punto a 'espera' + abrir sheet de entrega.
        this.navigation.onLlegadaParada = (idx: number) => this.alLlegarAPunto(idx);

        setTimeout(() => void this.mostrarRutaEnMapa(), 100);
    }

    private async alLlegarAPunto(idx: number) {
        const punto = this.puntos()[idx];
        if (!punto) return;
        this.puntoEntrega.set(idx);
        try {
            await this.store.marcarParadaEnEspera(punto.facturaIds);
        } catch {
            /* el sheet sigue abierto aunque falle el RPC (offline) */
        }
    }

    private sincronizarParadas() {
        const viaje = this.store.viajesChofer()[0] || null;
        if (viaje) {
            const entregas = this.store.guiasAsignadas();
            this.paradas.set(
                (viaje.paradas || [])
                    .slice()
                    .sort((a, b) => a.orden_visita - b.orden_visita)
                    .map((p) => {
                        const entrega = entregas.find((e) => e.id === p.id_factura);
                        return {
                            id: p.id_factura,
                            ordenVisita: p.orden_visita,
                            numeroGuia: p.codigo_guia || entrega?.numeroGuia || p.id_guia || '',
                            numeroFactura: p.numero_factura || entrega?.numeroFactura || '',
                            nombreCliente: p.nombre_cliente || entrega?.cliente || 'Sin cliente',
                            direccion: p.direccion || entrega?.direccion || '',
                            estado: p.estado_factura || entrega?.estado || 'embarque',
                            latitud: p.latitud,
                            longitud: p.longitud,
                            montoDolares: Number(p.monto_dolares) || entrega?.precioCarga || 0,
                            rif: entrega?.rif,
                            observaciones: entrega?.observaciones,
                        };
                    }),
            );
        } else {
            this.paradas.set([]);
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
        const conPuntos = this.puntos();

        const paradasNav: ParadaNavegacion[] = conPuntos.map((p) => ({
            id: p.key,
            ordenVisita: p.ordenVisita,
            numeroGuia: p.facturas[0]?.numeroGuia || '',
            numeroFactura: p.facturas[0]?.numeroFactura || '',
            nombreCliente: p.nombreCliente,
            latitud: p.latitud,
            longitud: p.longitud,
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
                await this.seguirCamara(pos);
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
            await this.seguirCamara(pos);
        }
    }

    /**
     * Mueve la cámara siguiendo al chofer. Con `vista3d` activa usa la
     * perspectiva isométrica tipo Google Maps Navigation: cámara inclinada
     * 45° (angle), rotada según el rumbo y con zoom cercano.
     */
    private async seguirCamara(pos: LatLng) {
        const config = {
            coordinate: { lat: pos.lat, lng: pos.lng },
            animate: true,
            ...(this.vista3d()
                ? { zoom: 17, angle: 45, bearing: this.navigation.rumbo() }
                : {}),
        };
        try {
            await this.mapa.setCamera(config);
        } catch (err) {
            console.error('Error siguiendo cámara', err);
        }
    }

    toggleVista3d() {
        this.vista3d.update((v) => !v);
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

        // Se respeta el orden actual de las paradas (el definido por la ventana
        // Ruta del chofer o el admin): no se reordena aquí.
        const conPuntos = this.puntos();
        if (conPuntos.length < 1) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Sin coordenadas',
                detail: 'Las paradas no tienen ubicación para calcular la ruta.',
            });
            return;
        }

        this.iniciando.set(true);
        try {
            const warehouse: Waypoint = {
                lat: environment.warehouseLat,
                lng: environment.warehouseLng,
                name: 'Almacén',
            };

            // Fuera de línea: usar la ruta detallada persistida en el viaje
            // (calculada antes y guardada con guardarRutaViaje) sin Directions.
            if (!this.connectivity.isOnline()) {
                const persistida = viaje.ruta_detallada;
                if (!persistida || persistida.pasos.length < 1) {
                    this.messageService.add({
                        severity: 'warn',
                        summary: 'Sin conexión',
                        detail: 'No hay ruta precalculada guardada. Conecta a internet primero.',
                    });
                    this.iniciando.set(false);
                    return;
                }
                await this.iniciarNavegacion(persistida);
                this.messageService.add({
                    severity: 'success',
                    summary: 'Viaje iniciado',
                    detail: 'Navegando con la ruta guardada (sin conexión).',
                });
                this.iniciando.set(false);
                return;
            }

            // Cerrar el viaje: viaje → 'proceso' y todas sus facturas → 'proceso'
            // (iniciar_viaje persiste también el orden actual de las paradas).
            const idsOrdenadas = conPuntos.flatMap((p) => p.facturaIds);
            await this.viajeService.iniciarViaje(viaje.id_viaje, idsOrdenadas);
            await this.store.recargarViajes();

            const waypoints: Waypoint[] = conPuntos.map((p) => ({
                lat: p.latitud,
                lng: p.longitud,
                name: `${p.nombreCliente} - ${
                    p.facturas[0]?.numeroGuia || p.facturas[0]?.numeroFactura
                }`,
            }));

            // Ruta detallada con el orden actual (getRutaDetallada usa
            // optimizeWaypoints: false). No se persiste un orden nuevo.
            const detallada = await this.googleOptimization.getRutaDetallada(
                waypoints,
                warehouse,
                warehouse,
            );
            if (detallada) {
                await this.viajeService.guardarRutaViaje(viaje.id_viaje, detallada);
            }

            await this.iniciarNavegacion(detallada);

            this.messageService.add({
                severity: 'success',
                summary: 'Viaje iniciado',
                detail: 'La navegación comenzó desde el almacén respetando el orden de tu ruta.',
            });
        } catch (err) {
            console.error('Error al iniciar el viaje', err);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudo iniciar el viaje. Intenta nuevamente.',
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

    /** Gesto pull up/pull down sobre el grabber de los pasos (arriba). */
    onTopSheetDragStart(event: TouchEvent | MouseEvent) {
        this.sheetDragStartY = this.eventY(event);
        this.sheetDragActivo = true;
    }

    onTopSheetDragEnd(event: TouchEvent | MouseEvent) {
        this.resolverDragSheet(this.pasosAbiertos, event);
    }

    /** Gesto pull up/pull down sobre el grabber de "Puntos de entrega" (abajo). */
    onPuntosSheetDragStart(event: TouchEvent | MouseEvent) {
        this.sheetDragStartY = this.eventY(event);
        this.sheetDragActivo = true;
    }

    onPuntosSheetDragEnd(event: TouchEvent | MouseEvent) {
        this.resolverDragSheet(this.puntosAbiertos, event);
    }

    private resolverDragSheet(
        sig: { set(v: boolean): void; update(f: (v: boolean) => boolean): void },
        event: TouchEvent | MouseEvent,
    ) {
        if (!this.sheetDragActivo) return;
        this.sheetDragActivo = false;
        const delta = this.eventY(event) - this.sheetDragStartY;
        if (Math.abs(delta) < 40) {
            sig.update((v) => !v);
        } else if (delta > 0) {
            sig.set(false);
        } else {
            sig.set(true);
        }
    }

    toggleControles() {
        this.controlesAbiertos.update((v) => !v);
    }

    toggleSheet() {
        this.sheetExpandido.update((v) => !v);
    }

    /** Gesto tipo "pull down / pull up" sobre el grabber del bottom sheet. */
    onSheetDragStart(event: TouchEvent | MouseEvent) {
        this.sheetDragStartY = this.eventY(event);
        this.sheetDragActivo = true;
    }

    onSheetDragEnd(event: TouchEvent | MouseEvent) {
        if (!this.sheetDragActivo) return;
        this.sheetDragActivo = false;
        const delta = this.eventY(event) - this.sheetDragStartY;
        // Arrastre hacia abajo (>40px): cerrar. Hacia arriba (<-40px): abrir.
        // Sin arrastre (tap): alternar.
        if (Math.abs(delta) < 40) {
            this.toggleSheet();
        } else if (delta > 0) {
            this.sheetExpandido.set(false);
        } else {
            this.sheetExpandido.set(true);
        }
    }

    private eventY(event: TouchEvent | MouseEvent): number {
        if (event instanceof TouchEvent) {
            const touch = event.changedTouches?.[0] ?? event.touches?.[0];
            return touch ? touch.clientY : 0;
        }
        return (event as MouseEvent).clientY;
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

    // ---------------- Flujo de entrega ----------------

    async iniciarEntregaPunto() {
        const punto = this.puntoActual();
        if (!punto) return;
        this.entregando.set(true);
        try {
            await this.store.iniciarEntrega(punto.facturaIds);
            this.messageService.add({
                severity: 'success',
                summary: 'Entrega iniciada',
                detail: 'Marca cada factura como finalizada o reporta una incidencia.',
            });
        } catch (err: any) {
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo iniciar la entrega.',
            });
        } finally {
            this.entregando.set(false);
        }
    }

    abrirFirma(factura: ParadaMapa) {
        this.firmaGuia.set(factura);
        if (this.firmaDialog) {
            this.firmaDialog.guia = this.firmaGuiaData();
            this.firmaDialog.open();
        }
    }

    onFirmaCancelada() {
        this.firmaGuia.set(null);
    }

    async onFirmaConfirmada(event: { firma: string; observaciones: string }) {
        const factura = this.firmaGuia();
        if (!factura) return;
        try {
            await this.store.finalizarEntrega(
                this.crearEntregaStore(factura),
                event.firma,
                event.observaciones,
            );
            this.messageService.add({
                severity: 'success',
                summary: 'Entrega completada',
                detail: `${factura.nombreCliente} — ${factura.numeroFactura || factura.numeroGuia}`,
            });
        } catch (err: any) {
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo guardar la entrega.',
            });
        } finally {
            this.firmaGuia.set(null);
        }
    }

    abrirIncidencia(factura: ParadaMapa) {
        this.incidenciaGuia.set(factura);
        this.incidenciaTexto.set('');
    }

    cerrarIncidencia() {
        this.incidenciaGuia.set(null);
        this.incidenciaTexto.set('');
    }

    async onIncidenciaConfirmada() {
        const factura = this.incidenciaGuia();
        if (!factura) return;
        try {
            await this.store.reportarIncidencia(factura.id, this.incidenciaTexto());
            this.messageService.add({
                severity: 'warn',
                summary: 'Incidencia reportada',
                detail: `${factura.nombreCliente} — ${factura.numeroFactura || factura.numeroGuia}`,
            });
        } catch (err: any) {
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo reportar la incidencia.',
            });
        } finally {
            this.cerrarIncidencia();
        }
    }

    private crearEntregaStore(factura: ParadaMapa) {
        return {
            id: factura.id,
            idGuia: '',
            numeroGuia: factura.numeroGuia,
            numeroFactura: factura.numeroFactura,
            empresaSuministro: '',
            cliente: factura.nombreCliente,
            ruta: '',
            direccion: factura.direccion,
            rif: factura.rif || '',
            precioCarga: factura.montoDolares || 0,
            estado: factura.estado,
            observaciones: factura.observaciones,
            tuvoDevolucion: false,
            eventos: [],
            latitud: factura.latitud ?? undefined,
            longitud: factura.longitud ?? undefined,
        };
    }

    // ---------------- Helpers UX/UI ----------------

    private puntoCompletado(p: PuntoEntrega): boolean {
        return p.facturas.every((f) => f.estado === 'finalizado' || f.estado === 'incidencia');
    }

    /** % de puntos completados (facturas finalizado/incidencia). */
    progresoParadas(): number {
        const pts = this.puntos();
        if (!pts.length) return 0;
        const done = pts.filter((p) => this.puntoCompletado(p)).length;
        return Math.round((done / pts.length) * 100);
    }

    puntoEntregadasCount(): number {
        const p = this.puntoActual();
        return p
            ? p.facturas.filter(
                  (f) => f.estado === 'finalizado' || f.estado === 'incidencia',
              ).length
            : 0;
    }

    puntoTotalMonto(): number {
        const p = this.puntoActual();
        return p?.facturas.reduce((s, f) => s + (f.montoDolares || 0), 0) ?? 0;
    }

    puntoTienePendientes(i: number): boolean {
        const p = this.puntos()[i];
        return !!p && !this.puntoCompletado(p);
    }

    /** Abre el sheet de entrega de un punto pendiente (desde la lista). */
    abrirPunto(i: number) {
        if (this.puntoTienePendientes(i)) this.puntoEntrega.set(i);
    }

    /** Colapsa la vista de entrega y vuelve al panel de navegación. */
    cerrarVistaEntrega() {
        this.puntoEntrega.set(null);
    }

    /** Finaliza el viaje al regresar al almacén con todas las entregas hechas. */
    async finalizarViaje() {
        const viaje = this.activeViaje();
        if (!viaje || this.finalizando()) return;
        this.finalizando.set(true);
        try {
            await this.viajeService.finalizarViaje(viaje.id_viaje);
            await this.store.recargarViajes();
            this.puntoEntrega.set(null);
            this.messageService.add({
                severity: 'success',
                summary: 'Viaje finalizado',
                detail: 'Regresaste al almacén con todas las entregas completadas.',
            });
        } catch (err: any) {
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo finalizar el viaje.',
            });
        } finally {
            this.finalizando.set(false);
        }
    }
}
