import { Component, ElementRef, input, output, viewChild, afterNextRender, OnDestroy } from '@angular/core';
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
        <div class="flex flex-col gap-2 mt-2">
            <label class="font-semibold text-sm text-surface-700 dark:text-surface-200">
                <i class="pi pi-map mr-1 text-primary"></i>
                Ubicación en el mapa
            </label>
            <app-busqueda-ubicacion
                [municipioNombre]="municipioNombre()"
                (ubicacionSeleccionada)="onUbicacionSeleccionada($event)"
            />
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

    onUbicacionSeleccionada(event: { lat: number; lng: number; direccion: string }) {
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
            markerEl.style.cssText =
                'width:32px;height:32px;display:flex;align-items:center;justify-content:center;';
            markerEl.innerHTML = `
                <svg viewBox="0 0 24 24" width="32" height="32" fill="#ef4444" stroke="white" stroke-width="1.5">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    <circle cx="12" cy="9" r="2" fill="white"/>
                </svg>
            `;

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
                this.marcadorMovido.emit();
            });
        }

        this.map.flyTo({ center: [lng, lat], zoom: 15, duration: 800 });
    }

    ngOnDestroy() {
        this.marker?.remove();
        this.map?.remove();
    }
}
