import { Injectable } from '@angular/core';

export interface Waypoint {
    lat: number;
    lng: number;
    name: string;
}

export interface GoogleOptimizationResult {
    order: number[];
    distance: number;
    duration: number;
    path: { lat: number; lng: number }[];
}

@Injectable({ providedIn: 'root' })
export class GoogleMapsOptimizationService {
    async optimize(waypoints: Waypoint[]): Promise<GoogleOptimizationResult | null> {
        if (waypoints.length < 2) return null;
        if (typeof google === 'undefined' || !google.maps) return null;

        const directionsService = new google.maps.DirectionsService();

        const request: google.maps.DirectionsRequest = {
            origin: new google.maps.LatLng(waypoints[0].lat, waypoints[0].lng),
            destination: new google.maps.LatLng(
                waypoints[waypoints.length - 1].lat,
                waypoints[waypoints.length - 1].lng,
            ),
            waypoints: waypoints.slice(1, -1).map((wp) => ({
                location: new google.maps.LatLng(wp.lat, wp.lng),
                stopover: true,
            })),
            optimizeWaypoints: true,
            travelMode: google.maps.TravelMode.DRIVING,
        };

        return new Promise((resolve) => {
            directionsService.route(request, (result, status) => {
                if (status !== google.maps.DirectionsStatus.OK || !result?.routes?.length) {
                    resolve(null);
                    return;
                }
                const route = result.routes[0];
                const order = [
                    0,
                    ...route.waypoint_order.map((i) => i + 1),
                    waypoints.length - 1,
                ];

                const totalDistance = route.legs.reduce(
                    (sum, leg) => sum + (leg.distance?.value || 0),
                    0,
                );
                const totalDuration = route.legs.reduce(
                    (sum, leg) => sum + (leg.duration?.value || 0),
                    0,
                );

                const path: { lat: number; lng: number }[] =
                    route.overview_path?.map((p) => ({ lat: p.lat(), lng: p.lng() })) || [];

                resolve({ order, distance: totalDistance, duration: totalDuration, path });
            });
        });
    }
}
