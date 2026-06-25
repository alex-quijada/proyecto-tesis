import { Injectable } from '@angular/core';

export interface Waypoint {
    lat: number;
    lng: number;
    name: string;
}

export interface OptimizationResult {
    waypoints: { waypoint_index: number; trips_index: number }[];
    trips: {
        geometry: { coordinates: [number, number][] };
        duration: number;
        distance: number;
    }[];
    code: string;
}

@Injectable({ providedIn: 'root' })
export class MapboxOptimizationService {
    private readonly baseUrl = 'https://api.mapbox.com/optimized-trips/v1/mapbox/driving';

    async optimize(waypoints: Waypoint[], token: string): Promise<OptimizationResult | null> {
        if (waypoints.length < 2) return null;

        const coords = waypoints.map((w) => `${w.lng},${w.lat}`).join(';');
        const url = `${this.baseUrl}/${coords}?access_token=${token}&geometries=geojson&roundtrip=false&source=first&destination=last`;

        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.code !== 'Ok') {
                console.error('Mapbox API error:', data);
                return null;
            }
            return data as OptimizationResult;
        } catch (e) {
            console.error('Mapbox API error:', e);
            return null;
        }
    }
}
