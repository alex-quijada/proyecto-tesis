import {
    Component,
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

    private mapaEl = viewChild<ElementRef<HTMLDivElement>>('mapaElement');

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
        this.destroyRef.onDestroy(() => window.removeEventListener('resize', medirOffsets));

        afterNextRender(() => {
            effect(() => {
                const pos = this.navigation.posicionDriver();
                const listo = this.mapaListo();
                if (pos && listo) this.moverMarcadorChofer(pos);
            });

            effect(() => {
                const navegando = this.navigation.navegando();
                const path = this.navigation.path();
                const legs = this.navigation.legs();
                const listo = this.mapaListo();
                if (!listo) return;
                if (navegando && legs.length > 0) {
                    this.dibujarRutaPorTramos(legs);
                } else if (navegando && path.length > 0) {
                    this.dibujarPolyline(path);
                } else if (!navegando) {
                    this.limpiarPolyline();
                }
            });
        });
    }

    viajes = signal<ViajeChofer[]>([]);
    paradas = signal<ParadaMapa[]>([]);
    cargando = signal(true);
    iniciando = signal(false);

    private mapa!: google.maps.Map;
    private markers: google.maps.Marker[] = [];
    private driverMarker: google.maps.Marker | null = null;
    private routePolyline: google.maps.Polyline | null = null;
    private segmentPolylines: google.maps.Polyline[] = [];

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

            setTimeout(() => this.mostrarRutaEnMapa(), 100);
        } catch (err) {
            console.error('Error al cargar viaje', err);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudo cargar tu viaje.',
            });
        }
    }

    private initMapa() {
        if (this.mapa || !this.mapaEl()) return;
        const el = this.mapaEl()!.nativeElement;
        if (!el) return;
        if (el.clientHeight === 0) {
            setTimeout(() => this.initMapa(), 150);
            return;
        }
        this.mapa = new google.maps.Map(el, {
            center: { lat: environment.warehouseLat, lng: environment.warehouseLng },
            zoom: 10,
            streetViewControl: false,
            fullscreenControl: false,
            mapTypeControl: false,
            styles: [
                { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
                {
                    featureType: 'transit',
                    elementType: 'labels.icon',
                    stylers: [{ visibility: 'off' }],
                },
            ],
        });
        this.mapaListo.set(true);
    }

    private limpiarRuta() {
        this.markers.forEach((m) => m.setMap(null));
        this.markers = [];
        this.limpiarPolyline();
        this.limpiarSegmentos();
        if (this.driverMarker) {
            this.driverMarker.setMap(null);
            this.driverMarker = null;
        }
    }

    private limpiarPolyline() {
        if (this.routePolyline) {
            this.routePolyline.setMap(null);
            this.routePolyline = null;
        }
    }

    private limpiarSegmentos() {
        this.segmentPolylines.forEach((p) => p.setMap(null));
        this.segmentPolylines = [];
    }

    private dibujarPolyline(path: LatLng[]) {
        this.limpiarPolyline();
        if (path.length < 2) return;
        this.routePolyline = new google.maps.Polyline({
            path: path.map((p) => ({ lat: p.lat, lng: p.lng })),
            geodesic: true,
            strokeColor: '#22c55e',
            strokeOpacity: 0.85,
            strokeWeight: 5,
            map: this.mapa,
        });
    }

    /** Dibuja la ruta por tramos siguiendo las calles: una polyline por cada
     *  leg de Google (almacén → parada 1, parada 1 → parada 2, …). Cada leg
     *  usa su path detallado (street-following), no solo los extremos de las
     *  maniobras. */
    private dibujarRutaPorTramos(legs: { path: LatLng[] }[]) {
        this.limpiarSegmentos();
        if (legs.length < 1) return;

        for (const leg of legs) {
            const path = leg.path;
            if (path.length < 2) continue;
            this.segmentPolylines.push(
                new google.maps.Polyline({
                    path: path.map((p) => ({ lat: p.lat, lng: p.lng })),
                    geodesic: true,
                    strokeColor: '#22c55e',
                    strokeOpacity: 0.85,
                    strokeWeight: 5,
                    map: this.mapa,
                }),
            );
        }
    }

    private mostrarRutaEnMapa() {
        this.initMapa();
        if (!this.mapa) return;

        this.markers.forEach((m) => m.setMap(null));
        this.markers = [];

        const conCoords = this.paradas()
            .filter((p) => p.latitud != null && p.longitud != null)
            .sort((a, b) => a.ordenVisita - b.ordenVisita);

        const warehouse: Waypoint = {
            lat: environment.warehouseLat,
            lng: environment.warehouseLng,
            name: 'Almacén',
        };

        this.agregarMarcadorAlmacen(warehouse);
        conCoords.forEach((p, i) =>
            this.agregarMarcadorEntrega(i, {
                lat: p.latitud!,
                lng: p.longitud!,
                name: `${p.nombreCliente} - ${p.numeroGuia || p.numeroFactura}`,
            }),
        );

        const bounds = new google.maps.LatLngBounds();
        bounds.extend({ lat: warehouse.lat, lng: warehouse.lng });
        conCoords.forEach((p) => bounds.extend({ lat: p.latitud!, lng: p.longitud! }));
        this.mapa.fitBounds(bounds, 80);

        this.navigation.inicializarPosicion(warehouse);

        const pos = this.navigation.posicionDriver();
        if (pos) this.moverMarcadorChofer(pos);

        const rutaPersistida = this.activeViaje()?.ruta_detallada;
        if (rutaPersistida && rutaPersistida.legs && rutaPersistida.legs.length > 0) {
            this.dibujarRutaPorTramos(rutaPersistida.legs);
        } else if (rutaPersistida && rutaPersistida.path.length > 1) {
            this.dibujarPolyline(rutaPersistida.path);
        }

        const navegando = this.navigation.navegando();
        const path = this.navigation.path();
        if (navegando && path.length > 0) {
            this.dibujarPolyline(path);
        }

        if (this.viajeEnProceso) {
            this.iniciarNavegacion();
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

    private moverMarcadorChofer(pos: LatLng) {
        if (!this.mapa) return;
        const icon = {
            url:
                'data:image/svg+xml;charset=utf-8,' +
                encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="14" fill="#2563eb" stroke="#fff" stroke-width="3"/><circle cx="15" cy="15" r="6" fill="#fff"/></svg>',
                ),
            scaledSize: new google.maps.Size(30, 30),
            anchor: new google.maps.Point(15, 15),
        };
        if (!this.driverMarker) {
            this.driverMarker = new google.maps.Marker({
                position: { lat: pos.lat, lng: pos.lng },
                map: this.mapa,
                icon,
                title: 'Tu posición',
                zIndex: 99,
            });
        } else {
            this.driverMarker.setPosition({ lat: pos.lat, lng: pos.lng });
        }
        if (this.navigation.navegando() && this.siguiendo()) {
            this.mapa.panTo({ lat: pos.lat, lng: pos.lng });
        }
    }

    private agregarMarcadorAlmacen(wp: Waypoint) {
        const icon = {
            url:
                'data:image/svg+xml;charset=utf-8,' +
                encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="13" fill="#8b5cf6" stroke="#fff" stroke-width="3"/><path d="M14 6l8 7h-3v8h-4v-5h-2v5H9v-8H6l8-7z" fill="#fff"/></svg>',
                ),
            scaledSize: new google.maps.Size(28, 28),
            anchor: new google.maps.Point(14, 14),
        };
        const marker = new google.maps.Marker({
            position: { lat: wp.lat, lng: wp.lng },
            map: this.mapa,
            icon,
            title: wp.name,
        });
        this.markers.push(marker);
    }

    private agregarMarcadorEntrega(index: number, wp: Waypoint) {
        const numero = index + 1;
        const icon = {
            url:
                'data:image/svg+xml;charset=utf-8,' +
                encodeURIComponent(
                    `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="12" fill="#f59e0b" stroke="#fff" stroke-width="2"/><text x="13" y="13" dy=".35em" text-anchor="middle" font-size="13" font-weight="bold" fill="#fff" font-family="Arial, sans-serif">${numero}</text></svg>`,
                ),
            scaledSize: new google.maps.Size(26, 26),
            anchor: new google.maps.Point(13, 13),
        };
        const marker = new google.maps.Marker({
            position: { lat: wp.lat, lng: wp.lng },
            map: this.mapa,
            icon,
            title: wp.name,
        });
        this.markers.push(marker);
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
