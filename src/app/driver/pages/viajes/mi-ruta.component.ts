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
import { NotificationService } from '@/app/services/notification.service';
import { FormsModule } from '@angular/forms';
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
    RutaDetallada,
    Waypoint,
} from '../../../admin/pages/map/map/google-maps-optimization.service';
import { environment } from '@/environments/environment';
import { ConnectivityService } from '@/app/services/connectivity.service';
import { DriverStoreService } from '../../services/driver-store.service';
import { NavigationService, ParadaNavegacion } from '../../services/navigation.service';
import { FirmaDialogComponent } from '../../components/firma-dialog/firma-dialog.component';
import {
    IncidenciaDialogComponent,
    IncidenciaGuia,
    IncidenciaDatos,
} from '../../components/incidencia-dialog/incidencia-dialog.component';
import { haversine, iconoManiobra, limpiarHtmlInstruccion, LatLng } from './navegacion.util';
import { ordenarPorVentana } from '../../services/time-window.router';
import { TrazaService } from '../../services/traza.service';
import {
    esHoraDeVolver,
    duracionLegMin,
    tiempoViajeDistanciaMin,
    distanciaHasta,
} from '../../services/fuera-horario.util';

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
    horaDesde?: string | null;
    horaHasta?: string | null;
    referencia?: string | null;
    contacto?: string | null;
    telefono?: string | null;
    notaSucursal?: string | null;
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
    horaDesde?: string | null;
    horaHasta?: string | null;
    referencia?: string | null;
    contacto?: string | null;
    telefono?: string | null;
    notaSucursal?: string | null;
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
        IncidenciaDialogComponent,
    ],
    templateUrl: './mi-ruta.component.html',
    styleUrl: './mi-ruta.component.css',
})
export class MiRutaComponent implements OnInit {
    private notif = inject(NotificationService);
    private viajeService = inject(ViajeService);
    private googleOptimization = inject(GoogleMapsOptimizationService);
    private destroyRef = inject(DestroyRef);
    private connectivity = inject(ConnectivityService);
    private trazaService = inject(TrazaService);
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
    pasosAbiertos = signal(false);
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

        // Re-entrega automática: si el admin autorizó una incidencia recuperable
        // de este viaje (Realtime → store), reactivar la factura y recalcular la
        // ruta desde la posición actual, llevando la parada extra primero.
        effect(() => {
            const reentregas = this.store.reentregasPendientes();
            if (reentregas.length < 1) {
                this.reentregasProcesadas.clear();
                return;
            }
            const viaje = this.activeViaje();
            if (!viaje || viaje.estado !== 'proceso') return;
            const nuevas = reentregas.filter((p) => !this.reentregasProcesadas.has(p.id_factura));
            if (nuevas.length < 1) return;
            for (const p of nuevas) this.reentregasProcesadas.add(p.id_factura);
            void this.procesarReentrega(nuevas.map((p) => p.id_factura));
        });

        // Si el admin reinicia el viaje (vuelve a 'programado') mientras el mapa
        // está navegando, detener la navegación y limpiar el estado de simulación.
        effect(() => {
            const viaje = this.activeViaje();
            if (viaje?.estado === 'programado' && this.navigation.navegando()) {
                this.navigation.detener();
                this.puntoEntrega.set(null);
                this.navigation.puntoEntregaGuardado.set(null);
                const id = viaje.id_viaje;
                if (id) void this.navigation.limpiarSimulacionGuardada(id);
            }
        });

        // Al completar todas las facturas del punto, volver al panel de navegación
        // y reanudar la simulación (que quedó detenida en la parada).
        effect(() => {
            const punto = this.puntoActual();
            if (!punto) return;
            const pendientes = punto.facturas.filter(
                (f) => f.estado !== 'finalizado' && f.estado !== 'incidencia',
            );
            if (pendientes.length === 0) {
                this.puntoEntrega.set(null);
                this.navigation.puntoEntregaGuardado.set(null);
                this.navigation.reanudarTrasEntrega();
            }
        });

        this.destroyRef.onDestroy(() => {
            window.removeEventListener('resize', medirOffsets);
            document.documentElement.classList.remove('mapa-nativo');
            if (this.navigation.onLlegadaParada) this.navigation.onLlegadaParada = null;
            // Guardar el punto de entrega abierto para restaurarlo al volver.
            this.navigation.puntoEntregaGuardado.set(this.puntoEntrega());
            // Al salir del mapa, pausar y guardar la simulación (si está activa).
            const viaje = this.activeViaje();
            if (viaje) void this.navigation.pausarYGuardarSimulacion(viaje.id_viaje);
            this.detenerAnimacionMarcador();
            if (this.mapa) void this.mapa.destroy().catch(() => undefined);
        });
    }

    paradas = signal<ParadaMapa[]>([]);
    cargando = signal(true);
    iniciando = signal(false);
    sheetExpandido = signal(false);

    @ViewChild(FirmaDialogComponent) private firmaDialog!: FirmaDialogComponent;
    @ViewChild(IncidenciaDialogComponent) private incidenciaDialog!: IncidenciaDialogComponent;

    puntoEntrega = signal<number | null>(null);
    detallePuntoAbierto = signal(false);
    entregando = signal(false);
    finalizando = signal(false);
    firmaGuia = signal<ParadaMapa | null>(null);
    incidenciaGuia = signal<ParadaMapa | null>(null);
    readonly incidenciaGuiaData = computed<IncidenciaGuia | null>(() => {
        const g = this.incidenciaGuia();
        return g
            ? {
                  cliente: g.nombreCliente,
                  numeroGuia: g.numeroGuia,
                  numeroFactura: g.numeroFactura,
              }
            : null;
    });

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
            if (punto.horaDesde == null && p.horaDesde != null) punto.horaDesde = p.horaDesde;
            if (punto.horaHasta == null && p.horaHasta != null) punto.horaHasta = p.horaHasta;
            if (punto.referencia == null && p.referencia != null) punto.referencia = p.referencia;
            if (punto.contacto == null && p.contacto != null) punto.contacto = p.contacto;
            if (punto.telefono == null && p.telefono != null) punto.telefono = p.telefono;
            if (punto.notaSucursal == null && p.notaSucursal != null)
                punto.notaSucursal = p.notaSucursal;
        }
        return Array.from(mapa.values()).sort((a, b) => a.ordenVisita - b.ordenVisita);
    });

    /** La parada de entrega activa a la que se está navegando actualmente. */
    readonly paradaNavegando = computed<PuntoEntrega | null>(() => {
        const paradaNav = this.navigation.paradaNavegando();
        if (paradaNav) {
            const punto = this.puntos().find(
                (p) => p.key === paradaNav.id || p.facturaIds.includes(paradaNav.id),
            );
            if (punto) return punto;
        }
        const idx = this.navigation.paradaActual();
        return this.puntos()[idx] ?? null;
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
        return (
            haversine(pos, { lat: environment.warehouseLat, lng: environment.warehouseLng }) < 15
        );
    });

    /** Navegando directo al almacén (viaje en regreso, sin paradas restantes). */
    readonly volviendoAlAlmacen = computed(
        () => this.navigation.navegando() && this.navigation.totalParadas() === 0,
    );

    /** Todas las entregas del viaje quedaron finalizadas (o con incidencia). */
    readonly viajeCompletado = computed(() => {
        const pts = this.puntos();
        return (
            pts.length > 0 &&
            pts.every((p) =>
                p.facturas.every((f) => f.estado === 'finalizado' || f.estado === 'incidencia'),
            )
        );
    });

    /** Paradas pendientes (facturas no finalizadas ni con incidencia). */
    readonly paradasPendientes = computed(() => {
        const pts = this.puntos();
        return pts
            .filter((p) => p.facturas.some((f) => f.estado !== 'finalizado' && f.estado !== 'incidencia'))
            .sort((a, b) => a.ordenVisita - b.ordenVisita);
    });

    /** Minutos estimados de viaje hasta la siguiente parada pendiente. Usa la
     *  duración del leg de la ruta detallada si existe; si no, distancia/35km/h. */
    readonly tiempoViajeSiguienteMin = computed(() => {
        const viaje = this.activeViaje();
        const pendientes = this.paradasPendientes();
        if (pendientes.length < 1) return 0;
        const siguiente = pendientes[0];

        // Legs de la ruta detallada: el leg i va hacia la parada i+1 (orden_visita 1-based).
        const legs = viaje?.ruta_detallada?.legs || [];
        if (legs.length > 0) {
            const idxLeg = Math.max(0, Math.min((siguiente.ordenVisita || 1) - 1, legs.length - 1));
            const dur = duracionLegMin(legs[idxLeg]);
            if (dur !== null) return Math.max(1, Math.round(dur));
        }

        const pos = this.navigation.posicionDriver();
        if (!pos) return 0;
        const dist = distanciaHasta(pos, { lat: siguiente.latitud, lng: siguiente.longitud });
        return Math.max(1, Math.round(tiempoViajeDistanciaMin(dist)));
    });

    /** ¿Es hora de volver al almacén? horaActual + viaje + 12 (servicio) + 15 (gracia) > ventana_fin. */
    readonly esHoraDeVolver = computed(() => {
        const viaje = this.activeViaje();
        if (!viaje || viaje.estado !== 'proceso') return false;
        if (this.viajeCompletado()) return false;
        return esHoraDeVolver({
            ventanaFin: viaje.ventana_fin,
            horaActual: this.store.now(),
            tiempoViajeSiguienteMin: this.tiempoViajeSiguienteMin(),
        });
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
    private driverPosDisplay: LatLng | null = null;
    private animMarcador: ReturnType<typeof setInterval> | null = null;
    private marcadorDestino: LatLng | null = null;
    private marcadorActualizando = false;
    private ultimoSeguimientoCamara = 0;
    private sheetPointer = { x: 0, y: 0 };
    private sheetPointerActivo = false;
    private arrastreReconocido = false;
    /** Evita loops: marcas de re-entrega ya procesadas (facturaId → ts). */
    private reentregasProcesadas = new Set<string>();
    private reagregandoReentrega = false;

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
        this.navigation.onLlegadaParada = (idx: number, parada?: ParadaNavegacion) =>
            this.alLlegarAPunto(idx, parada);

        if (this.store.volviendoAlAlmacen()) {
            // Viene de la página ruta ("Volver al almacén"): navegar directo al
            // almacén sin re-iniciar la ruta de entregas.
            this.store.volviendoAlAlmacen.set(false);
            void this.mostrarRutaEnMapa(false).then(() => {
                const viaje = this.activeViaje();
                if (viaje?.estado === 'proceso') {
                    void this.volverAlAlmacen();
                }
            });
            return;
        }

        setTimeout(() => void this.mostrarRutaEnMapa(), 100);
    }

    private async alLlegarAPunto(idx: number, paradaNav?: ParadaNavegacion) {
        const puntos = this.puntos();
        let targetIndex = -1;

        if (paradaNav) {
            targetIndex = puntos.findIndex(
                (p) => p.key === paradaNav.id || p.facturaIds.includes(paradaNav.id),
            );
        }

        if (targetIndex < 0 && idx >= 0 && idx < puntos.length) {
            targetIndex = idx;
        }

        if (targetIndex < 0) return;

        const punto = puntos[targetIndex];
        if (!punto) return;

        this.puntoEntrega.set(targetIndex);
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
                            horaDesde: p.hora_desde,
                            horaHasta: p.hora_hasta,
                            referencia: p.referencia,
                            contacto: p.contacto,
                            telefono: p.telefono,
                            notaSucursal: p.nota_sucursal,
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
            this.notif.add({
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

    /** @param iniciarAuto Si false, solo dibuja marcadores/polylines sin arrancar
     *  la navegación (útil al volver al almacén: la arranca `volverAlAlmacen`). */
    private async mostrarRutaEnMapa(iniciarAuto = true) {
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

        const navegando = this.navigation.navegando();
        const path = this.navigation.path();

        // La ruta persistida (almacén → paradas) es la que se guardó al cerrar
        // el viaje; tras una re-entrega la ruta real ya no empieza en el
        // almacén. Solo dibujarla como vista previa cuando la navegación está
        // inactiva (viaje programado / reapertura); con navegación en curso la
        // dibujan los legs reales (effect de navigation), no la ruta vieja.
        if (!navegando) {
            const rutaPersistida = this.activeViaje()?.ruta_detallada;
            if (rutaPersistida && rutaPersistida.legs && rutaPersistida.legs.length > 0) {
                await this.dibujarRutaPorTramos(rutaPersistida.legs);
            } else if (rutaPersistida && rutaPersistida.path.length > 1) {
                await this.dibujarPolyline(rutaPersistida.path);
            }
        }

        if (navegando && path.length > 0) {
            await this.dibujarPolyline(path);
        }

        const viaje = this.activeViaje();
        if (this.viajeEnProceso) {
            if (!navegando) {
                if (!iniciarAuto) {
                    // Modo "volver al almacén": no arrancar la ruta de entregas
                    // (lo hace `volverAlAlmacen` navegando directo al almacén).
                    return;
                }
                // La navegación se detuvo (p. ej. se reabrió la app): arrancar
                // y restaurar la simulación guardada si existe (queda pausada).
                await this.iniciarNavegacion();
                const restaurado = viaje
                    ? await this.navigation.restaurarSimulacionSiExiste(viaje.id_viaje)
                    : false;
                const posRest = this.navigation.posicionDriver();
                if (posRest) await this.moverMarcadorChofer(posRest);
                if (restaurado) this.restaurarEntrega();
            } else {
                // Ya navegando (se cambió de ventana y se volvió): restaurar la
                // vista de entrega que estaba abierta al salir.
                this.restaurarEntrega();
            }
            // Si ya navegando, se mantiene el recorrido actual (no se reinicia).
        } else if (this.navigation.navegando()) {
            this.navigation.detener();
        }
    }

    /** Restaura la vista de entrega (Iniciar/Finalizar) si se estaba en un punto
     *  de entrega al salir, o si la posición está dentro del rango. */
    private restaurarEntrega() {
        const guardado = this.navigation.puntoEntregaGuardado();
        const puntos = this.puntos();
        // 1) Si había un punto de entrega abierto al salir, restaurarlo.
        if (guardado != null && guardado >= 0 && guardado < puntos.length) {
            const punto = puntos[guardado];
            if (
                punto &&
                punto.facturas.some((f) => f.estado === 'entrega' || f.estado === 'espera')
            ) {
                this.puntoEntrega.set(guardado);
                return;
            }
        }
        // 2) Si no, abrir según el rango de la posición actual.
        this.abrirEntregaSiEnRango();
    }

    /** Si la posición actual está en el rango de la parada, abre el sheet de
     *  entrega (Iniciar entrega / Finalizar según el estado de la factura). */
    private abrirEntregaSiEnRango() {
        const viaje = this.activeViaje();
        if (!viaje) return;
        const punto = this.paradaNavegando();
        if (!punto) return;
        const pos = this.navigation.posicionDriver();
        if (!pos) return;
        const dist = haversine(pos, { lat: punto.latitud, lng: punto.longitud });
        if (dist < 15) {
            const idx = this.puntos().findIndex((p) => p.key === punto.key);
            if (idx >= 0) this.puntoEntrega.set(idx);
        }
    }

    private async iniciarNavegacion(rutaPrecomputada?: RutaPersistida | null) {
        this.pasosAbiertos.set(false);
        const conPuntos = this.puntos();
        const viaje = this.activeViaje();

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

        const rutaPersistida = rutaPrecomputada ?? viaje?.ruta_detallada;
        const ok = await this.navigation.iniciarNavegacion(
            paradasNav,
            warehouse,
            rutaPersistida,
            viaje?.id_viaje,
        );
        if (!ok && this.viajeEnProceso) {
            this.notif.add({
                severity: 'warn',
                summary: 'Sin navegación',
                detail: 'No se pudo calcular la ruta detallada para este viaje.',
            });
        }
    }

    /**
     * Ordena los puntos de entrega respetando las ventanas de recepción
     * (VRPTW: cierres próximos primero, aún-no-abiertas después, cerradas
     * al final) y devuelve las paradas navegables en ese orden.
     */
    private construirParadasOrdenadas(
        puntos: PuntoEntrega[],
        origen: { lat: number; lng: number },
    ): { paradas: ParadaNavegacion[]; cerradas: PuntoEntrega[] } {
        const ruteables = puntos.map((p) => ({
            id: p.key,
            latitud: p.latitud,
            longitud: p.longitud,
            horaDesde: p.horaDesde,
            horaHasta: p.horaHasta,
        }));

        const res = ordenarPorVentana(ruteables, origen, undefined, {
            tiempoServicio: 12,
            velocidadKmh: 35,
        });

        const mapa = new Map(puntos.map((p) => [p.key, p]));
        const paradas: ParadaNavegacion[] = res.orden
            .map((r) => mapa.get(r.id))
            .filter((p): p is PuntoEntrega => !!p)
            .map((p, i) => ({
                id: p.key,
                ordenVisita: i,
                numeroGuia: p.facturas[0]?.numeroGuia || '',
                numeroFactura: p.facturas[0]?.numeroFactura || '',
                nombreCliente: p.nombreCliente,
                latitud: p.latitud,
                longitud: p.longitud,
            }));

        const cerradas = res.cerradas
            .map((r) => mapa.get(r.id))
            .filter((p): p is PuntoEntrega => !!p);

        return { paradas, cerradas };
    }

    /**
     * Procesa una re-entrega autorizada por el admin: reactiva las facturas
     * (incidencia recuperable → proceso), reconstruye la navegación con las
     * paradas pendientes y recalcula la ruta OPTIMIZADA desde la posición
     * actual del chofer (la re-entrega se integra según su ubicación, no
     * forzada primero). Aplica a GPS real y a modo simulación.
     */
    private async procesarReentrega(idsFacturas: string[]) {
        if (this.reagregandoReentrega) return;
        this.reagregandoReentrega = true;
        try {
            const viaje = this.activeViaje();
            if (!viaje) return;

            const total = await this.store.reagregarReentregas();
            if (total < 1) return;

            this.notif.add({
                severity: 'info',
                summary: 'Re-entrega autorizada',
                detail: 'Se volverá a entregar una parada pendiente. Recalculando ruta optimizada…',
            });

            // Paradas pendientes (no finalizadas) con coordenadas, ya con la
            // re-entrega reactivada a 'proceso'.
            const puntos = this.puntos()
                .filter((p) => p.facturas.some((f) => f.estado !== 'finalizado'))
                .sort((a, b) => a.ordenVisita - b.ordenVisita);

            if (puntos.length < 1) return;

            const warehouse: Waypoint = {
                lat: environment.warehouseLat,
                lng: environment.warehouseLng,
                name: 'Almacén',
            };

            // Origen = posición actual del chofer (desde donde está ahora).
            const pos = this.navigation.posicionDriver();
            let origen: Waypoint | undefined = pos
                ? { lat: pos.lat, lng: pos.lng, name: 'Posición actual' }
                : undefined;

            // Sin posición en vivo (p. ej. al reentrar al mapa y la navegación
            // aún no arrancó): recuperar la última conocida de la simulación
            // guardada. Si tampoco existe, partir de la primera parada
            // pendiente. NUNCA del almacén: eso regeneraría la ruta desde
            // cero y devolvería el marcador al inicio del viaje.
            if (!origen) {
                const guardado = this.navigation.estadoSimulacionGuardado();
                if (guardado?.posicion) {
                    origen = {
                        lat: guardado.posicion.lat,
                        lng: guardado.posicion.lng,
                        name: 'Posición guardada',
                    };
                }
            }

            // Sin conexión: no se puede recalcular con Directions; se mantiene.
            if (!this.connectivity.isOnline() && !origen) return;

            const origenCoords: { lat: number; lng: number } = origen
                ? { lat: origen.lat, lng: origen.lng }
                : puntos.length > 0
                  ? { lat: puntos[0].latitud, lng: puntos[0].longitud }
                  : { lat: warehouse.lat, lng: warehouse.lng };

            // Ordenar paradas pendientes usando Google Maps TSP (red vial real:
            // sentidos de vía, flechas, giros y tiempos reales de viaje).
            let paradasNav: ParadaNavegacion[] = [];
            let detallada: RutaDetallada | null = null;
            let cerradas: PuntoEntrega[] = [];
            const origenWaypoint: Waypoint = origen ?? {
                lat: origenCoords.lat,
                lng: origenCoords.lng,
                name: 'Posición actual',
            };

            const waypoints: Waypoint[] = puntos.map((p) => ({
                lat: p.latitud,
                lng: p.longitud,
                name: `${p.nombreCliente} - ${p.facturas[0]?.numeroGuia || p.facturas[0]?.numeroFactura || ''}`,
            }));

            if (this.connectivity.isOnline()) {
                try {
                    const optRes = await this.googleOptimization.optimize(
                        waypoints,
                        origenWaypoint,
                        warehouse,
                    );

                    if (optRes && optRes.order && optRes.order.length > 0) {
                        const ordenados = optRes.order
                            .map((idx) => puntos[idx])
                            .filter((p): p is PuntoEntrega => !!p);

                        paradasNav = ordenados.map((p, i) => ({
                            id: p.key,
                            ordenVisita: i,
                            numeroGuia: p.facturas[0]?.numeroGuia || '',
                            numeroFactura: p.facturas[0]?.numeroFactura || '',
                            nombreCliente: p.nombreCliente,
                            latitud: p.latitud,
                            longitud: p.longitud,
                        }));

                        const waypointsOrdenados = optRes.order
                            .map((idx) => waypoints[idx])
                            .filter((w): w is Waypoint => !!w);

                        detallada = await this.googleOptimization.getRutaDetallada(
                            waypointsOrdenados,
                            origenWaypoint,
                            warehouse,
                        );
                    }
                } catch (optErr) {
                    console.warn('Fallo optimización de Google Maps, usando heurística local', optErr);
                }
            }

            // Fallback heurístico si está offline o no se pudo optimizar con Google
            if (paradasNav.length < 1) {
                const { paradas: fallbackParadas, cerradas: fallbackCerradas } =
                    this.construirParadasOrdenadas(puntos, origenCoords);
                paradasNav = fallbackParadas;
                cerradas = fallbackCerradas;
            }

            if (paradasNav.length < 1) return;

            await this.navigation.iniciarNavegacion(
                paradasNav,
                warehouse,
                detallada,
                viaje.id_viaje,
                origenWaypoint,
            );

            // Persistir el orden optimizado por ventana en el itinerario del
            // viaje para que sobreviva a cierres/re-aperturas.
            // Se mantienen las facturas ya finalizadas al inicio y se concatenan
            // las pendientes en su nuevo orden óptimo para no corromper orden_visita en BD.
            try {
                const idsFinalizados = this.puntos()
                    .filter((p) => p.facturas.every((f) => f.estado === 'finalizado'))
                    .sort((a, b) => a.ordenVisita - b.ordenVisita)
                    .flatMap((p) => p.facturaIds);

                const idsPendientesOrdenados = paradasNav
                    .map((pn) => this.puntos().find((p) => p.key === pn.id))
                    .filter((p): p is PuntoEntrega => !!p)
                    .flatMap((p) => p.facturaIds);

                const idsTodosOrdenados = [...idsFinalizados, ...idsPendientesOrdenados];

                if (idsTodosOrdenados.length > 0) {
                    await this.viajeService.actualizarOrdenViaje(viaje.id_viaje, idsTodosOrdenados);
                }
            } catch (err) {
                console.warn('No se pudo persistir el orden de la re-entrega', err);
            }

            // Redibujar marcadores y ruta en el mapa.
            void this.mostrarRutaEnMapa();

            if (cerradas.length > 0) {
                this.notif.add({
                    severity: 'warn',
                    summary: 'Empresas cerradas ahora',
                    detail: `${cerradas.length} parada(s) fuera de su ventana quedan al final de la ruta.`,
                });
            }
        } catch (err) {
            console.error('Error procesando re-entrega', err);
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudo recalcular la ruta para la re-entrega.',
            });
        } finally {
            this.reagregandoReentrega = false;
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
            this.detenerAnimacionMarcador();
            this.driverPosDisplay = null;
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

        // Marcador propio (web o modo simulación): persigue el destino con
        // suavizado (la cámara la sigue el propio bucle para no perder el punto).
        this.animarMarcadorHasta(pos);
    }

    private colocarMarcadorDriver(pos: LatLng) {
        // Guard: solo una colocación en curso; el siguiente paso la retoma.
        if (this.marcadorActualizando) return;
        this.marcadorActualizando = true;

        const viejoId = this.driverMarkerId;
        void this.mapa
            .addMarker({
                coordinate: { lat: pos.lat, lng: pos.lng },
                title: 'Tu posición',
                tintColor: { r: 37, g: 99, b: 235, a: 255 },
                zIndex: 99,
            })
            .then(async (nuevoId) => {
                this.driverMarkerId = nuevoId;
                this.driverPosDisplay = pos;
                if (viejoId) {
                    try {
                        await this.mapa.removeMarker(viejoId);
                    } catch {
                        /* noop */
                    }
                }
            })
            .catch((err) => console.error('Error moviendo el marcador del chofer', err))
            .finally(() => {
                this.marcadorActualizando = false;
            });
    }

    /**
     * Bucle de persecución del marcador. Un único intervalo que NUNCA se cancela
     * por nuevas lecturas: cuando llega una posición solo se actualiza el destino,
     * y el marcador se acerca exponencialmente a él. Así no se queda clavado
     * (el bug del tween anterior) y el movimiento se ve suave.
     */
    private animarMarcadorHasta(destino: LatLng) {
        this.marcadorDestino = destino;
        if (this.animMarcador) return;

        this.driverPosDisplay = this.driverPosDisplay ?? destino;
        this.animMarcador = setInterval(() => this.pasoMarcador(), this.pasoMarcadorMs());
    }

    private pasoMarcador() {
        const destino = this.marcadorDestino;
        const origen = this.driverPosDisplay;
        if (!destino || !origen) {
            this.detenerAnimacionMarcador();
            return;
        }

        const alpha = 1 - Math.exp(-this.pasoMarcadorMs() / this.tauMarcadorMs());
        const pos: LatLng = {
            lat: origen.lat + (destino.lat - origen.lat) * alpha,
            lng: origen.lng + (destino.lng - origen.lng) * alpha,
        };

        if (haversine(origen, destino) < 2) {
            void this.colocarMarcadorDriver(destino);
            this.detenerAnimacionMarcador();
        } else {
            void this.colocarMarcadorDriver(pos);
        }

        // La cámara sigue el marcador (no la posición cruda) para que el punto
        // nunca se salga de pantalla; se limita la frecuencia de setCamera.
        if (
            this.navigation.navegando() &&
            this.siguiendo() &&
            Date.now() - this.ultimoSeguimientoCamara > 150
        ) {
            this.ultimoSeguimientoCamara = Date.now();
            void this.seguirCamara(pos);
        }
    }

    private pasoMarcadorMs(): number {
        return this.esNativo ? 200 : 50;
    }

    private tauMarcadorMs(): number {
        return this.esNativo ? 120 : 80;
    }

    private detenerAnimacionMarcador() {
        if (this.animMarcador) {
            clearInterval(this.animMarcador);
            this.animMarcador = null;
        }
    }

    /**
     * Mueve la cámara siguiendo al chofer en perspectiva isométrica tipo
     * Google Maps Navigation: cámara inclinada 45° (angle), rotada según el
     * rumbo y con zoom cercano.
     */
    private async seguirCamara(pos: LatLng) {
        const config = {
            coordinate: { lat: pos.lat, lng: pos.lng },
            animate: true,
            zoom: 17,
            angle: 45,
            bearing: this.navigation.rumbo(),
        };
        try {
            await this.mapa.setCamera(config);
        } catch (err) {
            console.error('Error siguiendo cámara', err);
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

        const warehouse: Waypoint = {
            lat: environment.warehouseLat,
            lng: environment.warehouseLng,
            name: 'Almacén',
        };

        const conPuntos = this.puntos();
        if (conPuntos.length < 1) {
            this.notif.add({
                severity: 'warn',
                summary: 'Sin coordenadas',
                detail: 'Las paradas no tienen ubicación para calcular la ruta.',
            });
            return;
        }

        // Orden VRPTW: respeta las ventanas de recepción (no se pone de
        // primera una empresa que aún no abre, y se priorizan las que
        // cierran pronto). Las cerradas ahora se dejan al final.
        const { paradas: paradasOrdenadas, cerradas } = this.construirParadasOrdenadas(conPuntos, {
            lat: warehouse.lat,
            lng: warehouse.lng,
        });
        const puntosOrdenados = paradasOrdenadas
            .map((pn) => conPuntos.find((p) => p.key === pn.id))
            .filter((p): p is PuntoEntrega => !!p);

        this.iniciando.set(true);
        try {
            // Fuera de línea: usar la ruta detallada persistida en el viaje
            // (calculada antes y guardada con guardarRutaViaje) sin Directions.
            if (!this.connectivity.isOnline()) {
                const persistida = viaje.ruta_detallada;
                if (!persistida || persistida.pasos.length < 1) {
                    this.notif.add({
                        severity: 'warn',
                        summary: 'Sin conexión',
                        detail: 'No hay ruta precalculada guardada. Conecta a internet primero.',
                    });
                    this.iniciando.set(false);
                    return;
                }
                await this.iniciarNavegacion(persistida);
                this.notif.add({
                    severity: 'success',
                    summary: 'Viaje iniciado',
                    detail: 'Navegando con la ruta guardada (sin conexión).',
                });
                this.iniciando.set(false);
                return;
            }

            // Cerrar el viaje: viaje → 'proceso' y todas sus facturas → 'proceso'
            // (iniciar_viaje persiste también el orden actual de las paradas).
            const idsOrdenadas = puntosOrdenados.flatMap((p) => p.facturaIds);
            await this.viajeService.iniciarViaje(viaje.id_viaje, idsOrdenadas);
            await this.store.recargarViajes();

            const waypoints: Waypoint[] = puntosOrdenados.map((p) => ({
                lat: p.latitud,
                lng: p.longitud,
                name: `${p.nombreCliente} - ${
                    p.facturas[0]?.numeroGuia || p.facturas[0]?.numeroFactura
                }`,
            }));

            // Ruta detallada con el orden por ventana (getRutaDetallada usa
            // optimizeWaypoints: false, así conserva el orden dado).
            const detallada = await this.googleOptimization.getRutaDetallada(
                waypoints,
                warehouse,
                warehouse,
            );
            if (detallada) {
                await this.viajeService.guardarRutaViaje(viaje.id_viaje, detallada);
            }

            await this.iniciarNavegacion(detallada);

            this.notif.add({
                severity: 'success',
                summary: 'Viaje iniciado',
                detail:
                    cerradas.length > 0
                        ? `Se navegará respetando las ventanas. ${cerradas.length} empresa(s) cerradas ahora quedan al final.`
                        : 'La navegación comenzó desde el almacén respetando las ventanas de entrega.',
            });
        } catch (err) {
            console.error('Error al iniciar el viaje', err);
            this.notif.add({
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

    readonly velocidadOpciones = [
        { label: 'Normal', value: 90 },
        { label: 'Rápida', value: 180 },
    ];

    get velocidadSeleccionada(): number {
        return this.navigation.velocidadSimulacion();
    }

    set velocidadSeleccionada(v: number) {
        this.navigation.setVelocidadSimulacion(v);
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

    /**
     * Gestos de los sheets. Pointer events unifican touch + mouse: el tap
     * alterna y un arrastre de > 40 px hacia arriba/abajo abre/cierra.
     * El `click` es el fallback fiable del tap (se suprime si hubo arrastre).
     */
    onSheetPointerDown(event: PointerEvent, tipo: 'top' | 'puntos' | 'bottom') {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        this.sheetPointer = { x: event.clientX, y: event.clientY };
        this.sheetPointerActivo = true;
        this.arrastreReconocido = false;
    }

    onSheetPointerUp(event: PointerEvent, tipo: 'top' | 'puntos' | 'bottom') {
        if (!this.sheetPointerActivo) return;
        this.sheetPointerActivo = false;
        const dist = Math.hypot(
            event.clientX - this.sheetPointer.x,
            event.clientY - this.sheetPointer.y,
        );
        if (dist < 8) return;
        this.arrastreReconocido = true;
        const dy = event.clientY - this.sheetPointer.y;
        const sig = this.sigSheet(tipo);
        if (dy > 40) {
            sig.set(false);
        } else if (dy < -40) {
            sig.set(true);
        }
    }

    onSheetPointerCancel() {
        this.sheetPointerActivo = false;
        this.arrastreReconocido = false;
    }

    onSheetClick(tipo: 'top' | 'puntos' | 'bottom') {
        if (this.arrastreReconocido) {
            this.arrastreReconocido = false;
            return;
        }
        this.sigSheet(tipo).update((v) => !v);
    }

    private sigSheet(tipo: 'top' | 'puntos' | 'bottom') {
        if (tipo === 'top') return this.pasosAbiertos;
        if (tipo === 'puntos') return this.puntosAbiertos;
        return this.sheetExpandido;
    }

    toggleControles() {
        this.controlesAbiertos.update((v) => !v);
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
        this.detallePuntoAbierto.set(false);
        this.entregando.set(true);
        try {
            await this.store.iniciarEntrega(punto.facturaIds);
            this.notif.add({
                severity: 'success',
                summary: 'Entrega iniciada',
                detail: 'Marca cada factura como finalizada o reporta una incidencia.',
            });
        } catch (err: any) {
            this.notif.add({
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
            this.notif.add({
                severity: 'success',
                summary: 'Entrega completada',
                detail: `${factura.nombreCliente} — ${factura.numeroFactura || factura.numeroGuia}`,
            });
        } catch (err: any) {
            this.notif.add({
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
        this.incidenciaDialog.guia = this.incidenciaGuiaData();
        this.incidenciaDialog.open();
    }

    cerrarIncidencia() {
        this.incidenciaGuia.set(null);
    }

    async onIncidenciaConfirmada(datos: IncidenciaDatos) {
        const factura = this.incidenciaGuia();
        if (!factura) return;
        try {
            await this.store.reportarIncidencia(factura.id, datos.incidencias);
            this.notif.add({
                severity: 'warn',
                summary: 'Incidencia reportada',
                detail: `${factura.nombreCliente} — ${factura.numeroFactura || factura.numeroGuia}`,
            });
        } catch (err: any) {
            this.notif.add({
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
            ? p.facturas.filter((f) => f.estado === 'finalizado' || f.estado === 'incidencia')
                  .length
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

    /** Punto del que se muestra la info de sucursal (diálogo). */
    readonly infoSucursalPunto = signal<PuntoEntrega | null>(null);

    get infoSucursalVisible(): boolean {
        return this.infoSucursalPunto() !== null;
    }

    set infoSucursalVisible(v: boolean) {
        if (!v) this.infoSucursalPunto.set(null);
    }

    abrirInfoSucursal(punto: PuntoEntrega) {
        this.infoSucursalPunto.set(punto);
    }

    cerrarInfoSucursal() {
        this.infoSucursalPunto.set(null);
    }

    /** Alterna el detalle del cliente/facturas en las vistas de entrega. */
    toggleDetallePunto() {
        this.detallePuntoAbierto.update((v) => !v);
    }

    /** Finaliza el viaje al regresar al almacén con todas las entregas hechas. */
    async finalizarViaje() {
        const viaje = this.activeViaje();
        if (!viaje || this.finalizando()) return;
        this.finalizando.set(true);
        try {
            // Enviar la traza real acumulada en local antes de cerrar el viaje
            // (queda en buffer y se reintenta al reconectar si falla).
            await this.trazaService.enviarTraza(viaje.id_viaje);
            await this.viajeService.finalizarViaje(viaje.id_viaje);
            await this.store.recargarViajes();
            this.puntoEntrega.set(null);
            this.navigation.puntoEntregaGuardado.set(null);
            await this.navigation.limpiarSimulacionGuardada(viaje.id_viaje);
            this.notif.add({
                severity: 'success',
                summary: 'Viaje finalizado',
                detail: 'Regresaste al almacén con todas las entregas completadas.',
            });
        } catch (err: any) {
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo finalizar el viaje.',
            });
        } finally {
            this.finalizando.set(false);
        }
    }

    /** "Hora de volver al almacén": marca las entregas pendientes como
     *  FUERA_HORARIO (recuperables, re-despachables) y navega de vuelta al
     *  almacén. El viaje se finaliza al llegar. */
    async volverAlAlmacen() {
        const viaje = this.activeViaje();
        if (!viaje || this.finalizando()) return;
        this.finalizando.set(true);
        try {
            await this.trazaService.enviarTraza(viaje.id_viaje);
            const res = await this.viajeService.marcarFueraHorario(viaje.id_viaje);
            await this.store.recargarViajes();
            this.sincronizarParadas();
            this.puntoEntrega.set(null);
            this.navigation.puntoEntregaGuardado.set(null);
            const warehouse: Waypoint = {
                lat: environment.warehouseLat,
                lng: environment.warehouseLng,
                name: 'Almacén',
            };
            const ok = await this.navigation.navegarAlAlmacen(warehouse, viaje.id_viaje);
            void this.mostrarRutaEnMapa(false);
            this.notif.add({
                severity: 'warn',
                summary: 'Volviendo al almacén',
                detail:
                    res.total_marcadas > 0
                        ? `${res.total_marcadas} entrega(s) marcadas fuera de horario. Al llegar se cierra el viaje.`
                        : 'Las entregas pendientes ya estaban marcadas. Navegando al almacén…',
            });
            if (!ok) {
                this.notif.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'No se pudo calcular la ruta de vuelta al almacén.',
                });
            }
        } catch (err: any) {
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo marcar el viaje como fuera de horario.',
            });
        } finally {
            this.finalizando.set(false);
        }
    }
}
