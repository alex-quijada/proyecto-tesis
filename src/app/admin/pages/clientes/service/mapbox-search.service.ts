import { Injectable } from '@angular/core';
import { environment } from '@/environments/environment';

export interface SuggestionResult {
    mapboxId: string;
    name: string;
    fullAddress: string;
    placeFormatted: string;
    lat: number;
    lng: number;
}

interface MapboxGeocodeResponse {
    features: Array<{
        id: string;
        place_name: string;
        text: string;
        place_type: string[];
        geometry: {
            coordinates: [number, number];
        };
    }>;
}

@Injectable({ providedIn: 'root' })
export class MapboxSearchService {
    private readonly token = environment.mapboxKey;
    private readonly BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
    private readonly MARGARITA_BBOX = '-64.42,10.83,-63.66,11.18';
    private readonly MARGARITA_PROXIMITY = '-63.93,10.99';

    async buscarSugerencias(query: string): Promise<SuggestionResult[]> {
        if (!query.trim()) return [];

        const params = new URLSearchParams({
            q: query,
            access_token: this.token,
            country: 'VE',
            types: 'address,locality,place',
            bbox: this.MARGARITA_BBOX,
            proximity: this.MARGARITA_PROXIMITY,
            language: 'es',
            limit: '5',
        });

        const res = await fetch(`${this.BASE}/${encodeURIComponent(query)}.json?${params}`);
        if (!res.ok) return [];

        const data: MapboxGeocodeResponse = await res.json();
        return (data.features || []).map((f) => ({
            mapboxId: f.id,
            name: f.text || '',
            fullAddress: f.place_name || '',
            placeFormatted: f.place_name || '',
            lat: f.geometry.coordinates[1],
            lng: f.geometry.coordinates[0],
        }));
    }
}
