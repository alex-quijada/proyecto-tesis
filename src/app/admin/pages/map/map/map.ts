import { environment } from '@/environments/environment';
import {
    Component,
    ElementRef,
    OnDestroy,
    inject,
    signal,
    viewChild,
    afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as mapboxgl from 'mapbox-gl';
import { GoogleSearchService } from '@/app/admin/pages/clientes/service/google-search.service';
import { GoogleMapsOptimizationService, Waypoint } from './google-maps-optimization.service';

@Component({
    selector: 'app-map',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './map.html',
    styleUrl: './map.css',
})
export class Map implements OnDestroy {
    private mapaEl = viewChild.required<ElementRef<HTMLDivElement>>('mapaElement');
    private googleMapEl = viewChild.required<ElementRef<HTMLDivElement>>('googleMapElement');

    private searchService = inject(GoogleSearchService);
    private googleOptimizationService = inject(GoogleMapsOptimizationService);

    mapa!: mapboxgl.Map;
    googleMap: google.maps.Map | null = null;
    waypoints = signal<Waypoint[]>([]);
    searchQuery = signal('');
    suggestions = signal<{ placeId: string; name: string; fullAddress: string }[]>([]);
    optimizing = signal(false);
    resultInfo = signal<string | null>(null);
    optimizedOrder = signal<number[]>([]);

    private markers: mapboxgl.Marker[] = [];
    private googleMarkers: google.maps.marker.AdvancedMarkerElement[] = [];
    private routeSourceId = 'route';
    private routeLayerId = 'route-layer';
    private googlePolyline: google.maps.Polyline | null = null;
    private searchTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        afterNextRender(() => {
            this.initMapboxMap();
            this.initGoogleMap();
        });
    }

    private initMapboxMap() {
        this.mapa = new mapboxgl.Map({
            container: this.mapaEl().nativeElement,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [-63.85, 10.96],
            zoom: 10,
            accessToken: environment.mapboxKey,
        });

        this.mapa.addControl(new mapboxgl.NavigationControl(), 'top-right');

        this.mapa.on('load', () => {
            setTimeout(() => this.mapa.resize(), 100);
        });
    }

    private initGoogleMap() {
        const el = this.googleMapEl()?.nativeElement;
        if (!el || typeof google === 'undefined' || !google.maps) {
            setTimeout(() => this.initGoogleMap(), 200);
            return;
        }

        this.googleMap = new google.maps.Map(el, {
            center: { lat: 10.96, lng: -63.85 },
            zoom: 10,
            mapId: 'map',
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            streetViewControl: false,
            fullscreenControl: false,
        });
    }

    ngOnDestroy(): void {
        this.clearRoute();
        this.clearMarkers();
        this.clearGoogleRoute();
        this.clearGoogleMarkers();
        if (this.mapa) this.mapa.remove();
    }

    onSearchInput(value: string) {
        this.searchQuery.set(value);
        if (this.searchTimeout) clearTimeout(this.searchTimeout);

        if (!value.trim()) {
            this.suggestions.set([]);
            return;
        }

        this.searchTimeout = setTimeout(async () => {
            this.suggestions.set(await this.searchService.buscarSugerencias(value));
        }, 400);
    }

    selectSuggestion(sug: { placeId: string; name: string; fullAddress: string }) {
        this.searchQuery.set(sug.fullAddress || sug.name);
        this.suggestions.set([]);

        this.searchService.obtenerCoordenadas(sug.placeId).then((detalle) => {
            if (!detalle) return;
            const wp: Waypoint = {
                lat: detalle.lat,
                lng: detalle.lng,
                name: sug.name || detalle.direccion,
            };
            this.waypoints.update((wps) => [...wps, wp]);
            const idx = this.waypoints().length - 1;
            this.addMarker(idx, wp);
            this.addGoogleMarker(idx, wp, this.waypoints().length);
            this.mapa.flyTo({ center: [detalle.lng, detalle.lat], zoom: 14, duration: 500 });
            this.googleMap?.panTo({ lat: detalle.lat, lng: detalle.lng });
            this.googleMap?.setZoom(14);
            this.searchQuery.set('');
            this.resultInfo.set(null);
            this.optimizedOrder.set([]);
        });
    }

    removeWaypoint(index: number) {
        this.waypoints.update((wps) => wps.filter((_, i) => i !== index));
        this.clearMarkers();
        this.clearGoogleMarkers();
        this.waypoints().forEach((wp, i) => {
            this.addMarker(i, wp);
            this.addGoogleMarker(i, wp, this.waypoints().length);
        });
        this.clearRoute();
        this.clearGoogleRoute();
        this.resultInfo.set(null);
        this.optimizedOrder.set([]);
        if (this.waypoints().length === 0 && this.mapa) {
            this.mapa.flyTo({ center: [-63.85, 10.96], zoom: 10, duration: 500 });
            this.googleMap?.setCenter({ lat: 10.96, lng: -63.85 });
            this.googleMap?.setZoom(10);
        }
    }

    async optimize() {
        if (this.waypoints().length < 2 || this.optimizing()) return;
        this.optimizing.set(true);
        this.resultInfo.set(null);

        try {
            const result = await this.googleOptimizationService.optimize(this.waypoints());

            if (!result) {
                this.resultInfo.set('Error al optimizar la ruta.');
                return;
            }

            this.optimizedOrder.set(result.order);

            const durationMin = Math.round(result.duration / 60);
            const distanceKm = (result.distance / 1000).toFixed(1);
            this.resultInfo.set(`Ruta optimizada: ${distanceKm} km, ~${durationMin} min`);

            // ── Draw on Mapbox ──
            this.clearRoute();

            const coords: [number, number][] = result.path.map((p) => [p.lng, p.lat]);

            this.mapa.addSource(this.routeSourceId, {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    properties: {},
                    geometry: { type: 'LineString', coordinates: coords },
                },
            });

            this.mapa.addLayer({
                id: this.routeLayerId,
                type: 'line',
                source: this.routeSourceId,
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#22c55e',
                    'line-width': 4,
                    'line-opacity': 0.85,
                },
            });

            const bounds = new mapboxgl.LngLatBounds();
            coords.forEach((c) => bounds.extend(c));
            this.mapa.fitBounds(bounds, { padding: 80, duration: 800 });

            this.updateMarkersWithOrder(result.order);

            // ── Draw on Google Maps ──
            this.clearGoogleRoute();

            this.googlePolyline = new google.maps.Polyline({
                path: result.path,
                geodesic: true,
                strokeColor: '#22c55e',
                strokeOpacity: 0.85,
                strokeWeight: 4,
                map: this.googleMap!,
            });

            this.updateGoogleMarkersWithOrder(result.order);

            if (this.googleMap) {
                const gBounds = new google.maps.LatLngBounds();
                for (const idx of result.order) {
                    const wp = this.waypoints()[idx];
                    if (wp) gBounds.extend({ lat: wp.lat, lng: wp.lng });
                }
                this.googleMap.fitBounds(gBounds, 80);
            }
        } catch (e) {
            console.error('Optimization error:', e);
            this.resultInfo.set('Error inesperado al optimizar.');
        } finally {
            this.optimizing.set(false);
        }
    }

    clearAll() {
        this.waypoints.set([]);
        this.clearMarkers();
        this.clearGoogleMarkers();
        this.clearRoute();
        this.clearGoogleRoute();
        this.resultInfo.set(null);
        this.optimizedOrder.set([]);
        this.suggestions.set([]);
        this.searchQuery.set('');
        if (this.mapa) {
            this.mapa.flyTo({ center: [-63.85, 10.96], zoom: 10, duration: 500 });
        }
        this.googleMap?.setCenter({ lat: 10.96, lng: -63.85 });
        this.googleMap?.setZoom(10);
    }

    // ── Mapbox helpers ──

    private addMarker(index: number, wp: Waypoint) {
        const el = this.createMarkerElement(index, wp, this.waypoints().length);
        const popup = new mapboxgl.Popup({ offset: 20 }).setText(wp.name);

        const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([wp.lng, wp.lat])
            .setPopup(popup)
            .addTo(this.mapa);

        this.markers.push(marker);
    }

    private createMarkerElement(
        index: number,
        wp: Waypoint,
        total: number,
        optIdx?: number,
    ): HTMLDivElement {
        const el = document.createElement('div');
        const isStart = index === 0;
        const isEnd = index === total - 1;

        if (optIdx !== undefined) {
            if (optIdx === 0) {
                el.textContent = 'S';
                el.style.cssText =
                    'width:28px;height:28px;border-radius:50%;background:#22c55e;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;border:2px solid #16a34a;';
                el.title = 'Salida';
            } else if (optIdx === total - 1) {
                el.textContent = 'L';
                el.style.cssText =
                    'width:28px;height:28px;border-radius:50%;background:#ef4444;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;border:2px solid #dc2626;';
                el.title = 'Llegada';
            } else {
                el.textContent = String(optIdx + 1);
                el.style.cssText =
                    'width:26px;height:26px;border-radius:50%;background:#f59e0b;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;';
            }
        } else {
            if (isStart) {
                el.textContent = 'S';
                el.style.cssText =
                    'width:28px;height:28px;border-radius:50%;background:#3b82f6;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;border:2px solid #2563eb;';
                el.title = 'Salida';
            } else if (isEnd) {
                el.textContent = 'L';
                el.style.cssText =
                    'width:28px;height:28px;border-radius:50%;background:#ef4444;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;border:2px solid #dc2626;';
                el.title = 'Llegada';
            } else {
                el.textContent = String(index + 1);
                el.style.cssText =
                    'width:26px;height:26px;border-radius:50%;background:#3b82f6;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;';
            }
        }
        return el;
    }

    private clearMarkers() {
        this.markers.forEach((m) => m.remove());
        this.markers = [];
    }

    private clearRoute() {
        if (!this.mapa) return;
        if (this.mapa.getLayer(this.routeLayerId)) {
            this.mapa.removeLayer(this.routeLayerId);
        }
        if (this.mapa.getSource(this.routeSourceId)) {
            this.mapa.removeSource(this.routeSourceId);
        }
    }

    private updateMarkersWithOrder(order: number[]) {
        this.clearMarkers();
        const total = order.length;
        order.forEach((origIdx, optIdx) => {
            const wp = this.waypoints()[origIdx];
            if (!wp) return;

            const el = this.createMarkerElement(origIdx, wp, total, optIdx);

            const label =
                optIdx === 0 ? 'Salida' : optIdx === total - 1 ? 'Llegada' : `${optIdx + 1}º`;
            const popup = new mapboxgl.Popup({ offset: 20 }).setText(`${label} — ${wp.name}`);

            const marker = new mapboxgl.Marker({ element: el })
                .setLngLat([wp.lng, wp.lat])
                .setPopup(popup)
                .addTo(this.mapa);

            this.markers.push(marker);
        });
    }

    // ── Google Maps helpers ──

    private addGoogleMarker(index: number, wp: Waypoint, total: number) {
        if (!this.googleMap) return;

        const label = index === 0 ? 'S' : index === total - 1 ? 'L' : String(index + 1);
        const color = index === 0 ? '#3b82f6' : index === total - 1 ? '#ef4444' : '#f59e0b';

        const markerContent = document.createElement('div');
        markerContent.textContent = label;
        markerContent.style.cssText = `width:28px;height:28px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;border:2px solid white;`;

        const marker = new google.maps.marker.AdvancedMarkerElement({
            position: { lat: wp.lat, lng: wp.lng },
            map: this.googleMap,
            title: wp.name,
            content: markerContent,
        });

        const info = new google.maps.InfoWindow({ content: wp.name });
        marker.addListener('click', () => info.open(this.googleMap!, marker));

        this.googleMarkers.push(marker);
    }

    private clearGoogleMarkers() {
        this.googleMarkers.forEach((m) => {
            m.map = null;
        });
        this.googleMarkers = [];
    }

    private clearGoogleRoute() {
        if (this.googlePolyline) {
            this.googlePolyline.setMap(null);
            this.googlePolyline = null;
        }
    }

    private updateGoogleMarkersWithOrder(order: number[]) {
        this.clearGoogleMarkers();
        const total = order.length;
        order.forEach((origIdx, optIdx) => {
            const wp = this.waypoints()[origIdx];
            if (!wp || !this.googleMap) return;

            const label = optIdx === 0 ? 'S' : optIdx === total - 1 ? 'L' : String(optIdx + 1);
            const color = optIdx === 0 ? '#22c55e' : optIdx === total - 1 ? '#ef4444' : '#f59e0b';

            const markerContent = document.createElement('div');
            markerContent.textContent = label;
            markerContent.style.cssText = `width:28px;height:28px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;border:2px solid white;`;

            const marker = new google.maps.marker.AdvancedMarkerElement({
                position: { lat: wp.lat, lng: wp.lng },
                map: this.googleMap,
                title: wp.name,
                content: markerContent,
            });

            const text =
                optIdx === 0 ? 'Salida' : optIdx === total - 1 ? 'Llegada' : `${optIdx + 1}º`;
            const info = new google.maps.InfoWindow({ content: `${text} — ${wp.name}` });
            marker.addListener('click', () => info.open(this.googleMap!, marker));

            this.googleMarkers.push(marker);
        });
    }
}
