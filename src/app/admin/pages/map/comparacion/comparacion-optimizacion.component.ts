import { Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GoogleMapsOptimizationService, Waypoint } from '../map/google-maps-optimization.service';
import { TspOptimizationService, TimeWindow } from '../map/tsp-optimization.service';

interface Coord {
    lng: number;
    lat: number;
    name: string;
}

@Component({
    selector: 'app-comparacion-optimizacion',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './comparacion-optimizacion.component.html',
    styleUrl: './comparacion-optimizacion.component.css',
})
export class ComparacionOptimizacionComponent implements OnDestroy {
    private directionsService = inject(GoogleMapsOptimizationService);
    private tspService = inject(TspOptimizationService);

    // Coordenadas predefinidas
    almacen: Coord = { lng: -63.872, lat: 10.955, name: 'Almacén' };
    clienteA: Coord = { lng: -63.855, lat: 10.97, name: 'Cliente A' };
    clienteB: Coord = { lng: -63.89, lat: 10.95, name: 'Cliente B' };
    clienteC: Coord = { lng: -63.83, lat: 10.98, name: 'Cliente C' };
    clienteD: Coord = { lng: -63.9, lat: 10.94, name: 'Cliente D' };

    // Ventanas de tiempo predefinidas
    twClienteA: TimeWindow = { start: '2024-01-01T08:00:00', end: '2024-01-01T10:00:00' };
    twClienteB: TimeWindow = { start: '2024-01-01T10:00:00', end: '2024-01-01T12:00:00' };
    twClienteC: TimeWindow = { start: '2024-01-01T14:00:00', end: '2024-01-01T16:00:00' };
    twClienteD: TimeWindow = { start: '2024-01-01T10:00:00', end: '2024-01-01T12:00:00' };

    waypoints = signal<(Waypoint & { name: string })[]>([]);
    timeWindows = signal<(TimeWindow | null)[]>([]);
    comparing = signal(false);
    result = signal<{ directions: any; tsp: any } | null>(null);
    error = signal<string | null>(null);

    private tspPolyline: google.maps.Polyline | null = null;
    private directionsPolyline: google.maps.Polyline | null = null;
    private markers: google.maps.marker.AdvancedMarkerElement[] = [];

    private googleMapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapElement');
    private googleMap: google.maps.Map | null = null;

    constructor() {
        setTimeout(() => this.initMap(), 150);
    }

    ngOnDestroy(): void {
        this.clearMapData();
    }

    private initMap() {
        const el = this.googleMapEl()?.nativeElement;
        if (!el) return;
        if (typeof google === 'undefined' || !google.maps) {
            setTimeout(() => this.initMap(), 200);
            return;
        }
        this.googleMap = new google.maps.Map(el, {
            center: { lat: 10.96, lng: -63.85 },
            zoom: 10,
            mapId: 'comparison-map',
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            streetViewControl: false,
            fullscreenControl: false,
        });
    }

    addWaypoint(coord: Coord, tw: TimeWindow | null) {
        this.waypoints.update((wps) => [
            ...wps,
            { lat: coord.lat, lng: coord.lng, name: coord.name },
        ]);
        this.timeWindows.update((tws) => [...tws, tw]);
        this.updateMarkers();
        this.result.set(null);
    }

    removeWaypoint(index: number) {
        this.waypoints.update((wps) => wps.filter((_, i) => i !== index));
        this.timeWindows.update((tws) => tws.filter((_, i) => i !== index));
        this.updateMarkers();
        this.result.set(null);
    }

    clearAll() {
        this.waypoints.set([]);
        this.timeWindows.set([]);
        this.clearMapData();
        this.result.set(null);
        this.error.set(null);
    }

    formatTimeWindow(tw: TimeWindow): string {
        const fmt = (iso: string) => iso.slice(11, 16);
        return `${fmt(tw.start)} – ${fmt(tw.end)}`;
    }

    hasActiveTimeWindows(): boolean {
        return this.timeWindows().some((tw) => tw !== null);
    }

    async comparar() {
        if (this.waypoints().length < 3 || this.comparing()) return;
        this.comparing.set(true);
        this.error.set(null);
        this.result.set(null);
        this.clearRoutes();

        try {
            const wps = this.waypoints();
            const tws = this.timeWindows();

            const [directions, tsp] = await Promise.all([
                this.directionsService.optimize(wps),
                this.tspService.optimize(wps, undefined, undefined, tws),
            ]);

            this.result.set({
                directions: directions
                    ? {
                          order: directions.order,
                          distance: directions.distance,
                          duration: directions.duration,
                          path: directions.path,
                      }
                    : null,
                tsp: tsp
                    ? {
                          order: tsp.order,
                          distance: tsp.distance,
                          duration: tsp.duration,
                          path: tsp.path,
                      }
                    : null,
            });

            this.drawRoutes(this.result()?.directions?.path || [], this.result()?.tsp?.path || []);
        } catch (e: any) {
            this.error.set(e.message || 'Error al comparar');
        } finally {
            this.comparing.set(false);
        }
    }

    get directionsDistance(): string {
        const d = this.result()?.directions;
        return d ? (d.distance / 1000).toFixed(1) + ' km' : '—';
    }

    get tspDistance(): string {
        const d = this.result()?.tsp;
        return d ? (d.distance / 1000).toFixed(1) + ' km' : '—';
    }

    get directionsDuration(): string {
        const d = this.result()?.directions;
        return d ? Math.round(d.duration / 60) + ' min' : '—';
    }

    get tspDuration(): string {
        const d = this.result()?.tsp;
        return d ? Math.round(d.duration / 60) + ' min' : '—';
    }

    getDirectionsOrder(): string {
        const o = this.result()?.directions?.order;
        if (!o) return '—';
        const wps = this.waypoints();
        return o.map((i: number) => wps[i]?.name || `#${i}`).join(' → ');
    }

    getTspOrder(): string {
        const o = this.result()?.tsp?.order;
        if (!o) return '—';
        const wps = this.waypoints();
        return o.map((i: number) => wps[i]?.name || `#${i}`).join(' → ');
    }

    getWinner(): string | null {
        const r = this.result();
        if (!r?.directions || !r?.tsp) return null;
        const diff = r.directions.duration - r.tsp.duration;
        if (Math.abs(diff) < 30) return 'tie';
        return diff > 0 ? 'tsp' : 'directions';
    }

    getDiffSeconds(): number {
        const r = this.result();
        if (!r?.directions || !r?.tsp) return 0;
        return Math.abs(r.directions.duration - r.tsp.duration);
    }

    private drawRoutes(
        directionsPath: { lat: number; lng: number }[],
        tspPath: { lat: number; lng: number }[],
    ) {
        this.clearRoutes();
        if (!this.googleMap) return;

        if (directionsPath.length > 0) {
            this.directionsPolyline = new google.maps.Polyline({
                path: directionsPath,
                strokeColor: '#3B82F6',
                strokeOpacity: 0.9,
                strokeWeight: 4,
                map: this.googleMap,
            });
        }

        if (tspPath.length > 0) {
            this.tspPolyline = new google.maps.Polyline({
                path: tspPath,
                strokeColor: '#A855F7',
                strokeOpacity: 0.9,
                strokeWeight: 4,
                map: this.googleMap,
            });
        }
    }

    private updateMarkers() {
        this.clearMarkers();
        if (!this.googleMap) return;

        this.waypoints().forEach((wp, i) => {
            const hasTw = this.timeWindows()[i] !== null;
            const isFirst = i === 0;
            const isLast = i === this.waypoints().length - 1;

            const el = document.createElement('div');
            el.textContent = isFirst ? 'S' : isLast ? 'L' : String(i + 1);
            const bg = isFirst ? '#3B82F6' : isLast ? '#EF4444' : hasTw ? '#D97706' : '#6B7280';
            el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;`;

            const marker = new google.maps.marker.AdvancedMarkerElement({
                position: { lat: wp.lat, lng: wp.lng },
                map: this.googleMap,
                content: el,
            });
            this.markers.push(marker);
        });

        const bounds = new google.maps.LatLngBounds();
        this.waypoints().forEach((wp) => bounds.extend({ lat: wp.lat, lng: wp.lng }));
        this.googleMap.fitBounds(bounds, 60);
    }

    private clearMarkers() {
        this.markers.forEach((m) => {
            m.map = null;
        });
        this.markers = [];
    }

    private clearRoutes() {
        if (this.directionsPolyline) {
            this.directionsPolyline.setMap(null);
            this.directionsPolyline = null;
        }
        if (this.tspPolyline) {
            this.tspPolyline.setMap(null);
            this.tspPolyline = null;
        }
    }

    private clearMapData() {
        this.clearMarkers();
        this.clearRoutes();
    }
}
