import {
    Component,
    ElementRef,
    input,
    viewChild,
    afterNextRender,
    OnDestroy,
} from '@angular/core';
import { AbstractControl, ReactiveFormsModule } from '@angular/forms';
import { environment } from '@/environments/environment';
import mapboxgl from 'mapbox-gl';
import { BusquedaUbicacionComponent } from './busqueda-ubicacion.component';

const MB_TOKEN = environment.mapboxKey;

@Component({
    selector: 'app-mapa-sucursal',
    standalone: true,
    imports: [ReactiveFormsModule, BusquedaUbicacionComponent],
    template: `
        <app-busqueda-ubicacion
            [municipioNombre]="municipioNombre()"
            (ubicacionSeleccionada)="onUbicacionSeleccionada($event)"
        />
        <div
            #mapEl
            class="w-full rounded border border-surface-300 dark:border-surface-600 mt-2"
            style="height:250px"
        ></div>
    `,
})
export class MapaSucursalComponent implements OnDestroy {
    readonly sucursalGroup = input.required<AbstractControl>();
    readonly municipioNombre = input<string>('');

    private mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
    private map: mapboxgl.Map | null = null;
    private marker: mapboxgl.Marker | null = null;

    constructor() {
        afterNextRender(() => this.initMap());
    }

    private initMap() {
        const el = this.mapEl();
        if (!el) return;

        this.map = new mapboxgl.Map({
            container: el.nativeElement,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [-63.93, 10.99],
            zoom: 10,
            accessToken: MB_TOKEN,
            attributionControl: false,
        });

        this.map.addControl(new mapboxgl.NavigationControl(), 'top-right');

        this.map.on('load', () => {
            const group = this.sucursalGroup();
            const lat = group?.get('latitud')?.value;
            const lng = group?.get('longitud')?.value;
            if (lat && lng) {
                this.setMarker(Number(lat), Number(lng));
            }
        });
    }

    onUbicacionSeleccionada(event: {
        lat: number;
        lng: number;
        direccion: string;
    }) {
        const group = this.sucursalGroup();
        if (!group) return;
        group.patchValue({
            latitud: event.lat,
            longitud: event.lng,
            direccion: event.direccion,
        });
        this.setMarker(event.lat, event.lng);
    }

    private setMarker(lat: number, lng: number) {
        if (!this.map) return;
        const group = this.sucursalGroup();
        if (!group) return;

        if (this.marker) {
            this.marker.setLngLat([lng, lat]);
        } else {
            const markerEl = document.createElement('div');
            markerEl.className = 'mapbox-marker-custom';
            markerEl.innerHTML =
                '<i class="pi pi-map-marker" style="font-size:2rem;color:#ef4444;text-shadow:0 1px 3px rgba(0,0,0,0.3)"></i>';

            this.marker = new mapboxgl.Marker({
                element: markerEl,
                draggable: true,
            })
                .setLngLat([lng, lat])
                .addTo(this.map);

            this.marker.on('dragend', () => {
                const pos = this.marker!.getLngLat();
                group.patchValue({
                    latitud: pos.lat,
                    longitud: pos.lng,
                });
            });
        }

        this.map.flyTo({ center: [lng, lat], zoom: 15, duration: 800 });
    }

    ngOnDestroy() {
        this.marker?.remove();
        this.map?.remove();
    }
}
