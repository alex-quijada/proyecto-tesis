import { environment } from '@/environments/environment';
import { Component, ElementRef, AfterViewInit, ViewChild, OnDestroy } from '@angular/core';
import * as mapboxgl from 'mapbox-gl';

@Component({
    selector: 'app-map',
    standalone: true,
    imports: [],
    template: `
        <div class="map-container">
            <div #mapaElement class="mapbox-map"></div>
        </div>
    `,
    styleUrl: './map.css',
})
export class Map implements AfterViewInit {
    // Obtenemos la referencia local del DIV del mapa
    @ViewChild('mapaElement') mapaElement!: ElementRef;

    mapa!: mapboxgl.Map;

    constructor() {}

    ngAfterViewInit(): void {
        // 1. Inicializar el mapa
        this.mapa = new mapboxgl.Map({
            container: this.mapaElement.nativeElement,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [-70.64827, -33.45694],
            zoom: 12,
            accessToken: environment.mapboxKey,
        });

        // 2. Añadir controles de navegación
        this.mapa.addControl(new mapboxgl.NavigationControl(), 'top-right');

        // 3. El Truco Mágico: Forzar el redibujado cuando el DOM esté listo
        this.mapa.on('load', () => {
            setTimeout(() => {
                this.mapa.resize();
            }, 100);
        });
    }

    ngOnDestroy(): void {
        // Buena práctica: Destruir el mapa al salir del componente para liberar memoria
        if (this.mapa) {
            this.mapa.remove();
        }
    }
}
