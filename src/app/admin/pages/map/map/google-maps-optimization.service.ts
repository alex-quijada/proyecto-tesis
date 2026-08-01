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
    async optimize(
        waypoints: Waypoint[],
        origin?: Waypoint,
        destination?: Waypoint,
    ): Promise<GoogleOptimizationResult | null> {
        if (waypoints.length < 1) return null;
        if (typeof google === 'undefined' || !google.maps) return null;

        const directionsService = new google.maps.DirectionsService();

        const request: google.maps.DirectionsRequest = {
            origin: origin
                ? new google.maps.LatLng(origin.lat, origin.lng)
                : new google.maps.LatLng(waypoints[0].lat, waypoints[0].lng),
            destination: destination
                ? new google.maps.LatLng(destination.lat, destination.lng)
                : new google.maps.LatLng(
                      waypoints[waypoints.length - 1].lat,
                      waypoints[waypoints.length - 1].lng,
                  ),
            waypoints: (origin || destination ? waypoints : waypoints.slice(1, -1)).map((wp) => ({
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

                resolve({
                    order:
                        origin || destination
                            ? route.waypoint_order
                            : [0, ...route.waypoint_order.map((i) => i + 1), waypoints.length - 1],
                    distance: totalDistance,
                    duration: totalDuration,
                    path,
                });
            });
        });
    }
}
