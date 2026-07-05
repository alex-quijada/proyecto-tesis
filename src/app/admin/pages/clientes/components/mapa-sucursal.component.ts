import {
    Component,
    ElementRef,
    input,
    output,
    viewChild,
    afterNextRender,
    effect,
    signal,
    OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, ReactiveFormsModule } from '@angular/forms';
import { MessageModule } from 'primeng/message';
import { BusquedaUbicacionComponent } from './busqueda-ubicacion.component';
import { obtenerGeometriaMunicipio } from '../data/municipio-geometrias';
import { puntoEnPoligono } from '../data/geo-utils';

@Component({
    selector: 'app-mapa-sucursal',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, MessageModule, BusquedaUbicacionComponent],
    template: `
        <div class="flex flex-col gap-2 mt-2">
            <label class="font-semibold text-sm text-surface-700 dark:text-surface-200">
                <i class="pi pi-map mr-1 text-primary"></i>
                Ubicación en el mapa
            </label>
            <app-busqueda-ubicacion
                [municipioNombre]="municipioNombre()"
                (ubicacionSeleccionada)="onUbicacionSeleccionada($event)"
            />
            <p-message
                *ngIf="outsideBoundary()"
                severity="warn"
                variant="outlined"
                styleClass="text-sm"
            >
                <span class="text-sm">
                    <i class="pi pi-exclamation-triangle mr-1"></i>
                    El marcador está fuera del municipio seleccionado. Verifica la ubicación.
                </span>
            </p-message>
            <div
                #mapEl
                class="w-full rounded-lg border border-surface-300 dark:border-surface-600 shadow-sm overflow-hidden"
                style="height:260px"
            ></div>
        </div>
    `,
})
export class MapaSucursalComponent implements OnDestroy {
    readonly sucursalGroup = input.required<AbstractControl>();
    readonly municipioNombre = input<string>('');
    readonly marcadorMovido = output<void>();

    outsideBoundary = signal(false);

    private mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
    private map: google.maps.Map | null = null;
    private marker: google.maps.Marker | null = null;
    private boundaryLayer: google.maps.Data | null = null;

    constructor() {
        afterNextRender(() => this.initMap());

        effect(() => {
            const nombre = this.municipioNombre();
            if (this.map && nombre) {
                this.drawBoundary(nombre);
                this.validarUbicacionActual();
            }
        });
    }

    private initMap() {
        const el = this.mapEl()?.nativeElement;
        if (!el || typeof google === 'undefined' || !google.maps) {
            setTimeout(() => this.initMap(), 200);
            return;
        }

        this.map = new google.maps.Map(el, {
            center: { lat: 10.99, lng: -63.93 },
            zoom: 10,
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            streetViewControl: false,
            zoomControl: true,
        });

        this.boundaryLayer = new google.maps.Data({ map: this.map });
        this.boundaryLayer.setStyle({
            fillColor: '#3b82f6',
            fillOpacity: 0.1,
            strokeColor: '#3b82f6',
            strokeWeight: 2,
        });

        const dibujar = () => {
            this.placeMarkerFromForm();
            this.drawBoundary(this.municipioNombre());
            this.validarUbicacionActual();
        };

        google.maps.event.addListenerOnce(this.map, 'idle', dibujar);

        setTimeout(dibujar, 800);
    }

    private drawBoundary(nombre: string) {
        if (!this.boundaryLayer) return;

        this.boundaryLayer.forEach((f) => this.boundaryLayer!.remove(f));
        this.outsideBoundary.set(false);

        if (!nombre) return;

        const geom = obtenerGeometriaMunicipio(nombre);
        if (!geom) return;

        const feature: GeoJSON.Feature = {
            type: 'Feature',
            properties: {},
            geometry: geom as GeoJSON.Geometry,
        };
        try {
            this.boundaryLayer.addGeoJson(feature as unknown as object);
        } catch {
            // ignore invalid geometry
        }
    }

    private validarUbicacionActual() {
        const group = this.sucursalGroup();
        const lat = group?.get('latitud')?.value;
        const lng = group?.get('longitud')?.value;
        if (lat == null || lng == null) {
            this.outsideBoundary.set(false);
            return;
        }
        this.validarUbicacion(Number(lat), Number(lng));
    }

    private validarUbicacion(lat: number, lng: number) {
        const nombre = this.municipioNombre();
        if (!nombre) {
            this.outsideBoundary.set(false);
            return;
        }
        const geom = obtenerGeometriaMunicipio(nombre);
        if (!geom) {
            this.outsideBoundary.set(false);
            return;
        }
        const dentro = puntoEnPoligono(lng, lat, geom.coordinates);
        this.outsideBoundary.set(!dentro);
    }

    private placeMarkerFromForm() {
        if (!this.map) return;
        const group = this.sucursalGroup();
        const lat = group?.get('latitud')?.value;
        const lng = group?.get('longitud')?.value;
        if (lat != null && lng != null) {
            this.setMarker(Number(lat), Number(lng));
        }
    }

    onUbicacionSeleccionada(event: { lat: number; lng: number; direccion: string }) {
        const group = this.sucursalGroup();
        if (!group) return;
        group.patchValue({
            latitud: event.lat,
            longitud: event.lng,
            direccion: event.direccion,
        });
        this.setMarker(event.lat, event.lng);
        this.validarUbicacion(event.lat, event.lng);
    }

    private setMarker(lat: number, lng: number) {
        if (!this.map) return;
        const group = this.sucursalGroup();
        if (!group) return;

        if (this.marker) {
            this.marker.setPosition({ lat, lng });
        } else {
            this.marker = new google.maps.Marker({
                position: { lat, lng },
                map: this.map,
                draggable: true,
            });

            this.marker.addListener('dragend', () => {
                const pos = this.marker!.getPosition();
                if (!pos) return;
                const newLat = pos.lat();
                const newLng = pos.lng();
                group.patchValue({
                    latitud: newLat,
                    longitud: newLng,
                });
                this.validarUbicacion(newLat, newLng);
                this.marcadorMovido.emit();
            });
        }

        this.validarUbicacion(lat, lng);
        this.map.panTo({ lat, lng });
        this.map.setZoom(15);
    }

    ngOnDestroy() {
        this.marker?.setMap(null);
        this.marker = null;
        this.boundaryLayer?.setMap(null);
        this.boundaryLayer = null;
        this.map = null;
    }
}
