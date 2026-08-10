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

export interface PasoRuta {
    legIndex: number;
    stepIndex: number;
    instruccion: string;
    maniobra: string;
    distancia: number;
    duracion: number;
    inicio: { lat: number; lng: number };
    fin: { lat: number; lng: number };
}

export interface RutaDetallada {
    path: { lat: number; lng: number }[];
    distancia: number;
    duracion: number;
    pasos: PasoRuta[];
    legs: { path: { lat: number; lng: number }[] }[];
}

@Injectable({ providedIn: 'root' })
export class GoogleMapsOptimizationService {
    /**
     * Calcula la ruta en el orden dado (sin optimizar). Útil para dibujar
     * el itinerario persistido de un viaje ya cerrado.
     */
    async computeRoute(
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
            waypoints: waypoints.map((wp) => ({
                location: new google.maps.LatLng(wp.lat, wp.lng),
                stopover: true,
            })),
            optimizeWaypoints: false,
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
                resolve({
                    order: waypoints.map((_, i) => i),
                    distance: totalDistance,
                    duration: totalDuration,
                    path: route.overview_path?.map((p) => ({ lat: p.lat(), lng: p.lng() })) || [],
                });
            });
        });
    }

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

    /**
     * Devuelve la ruta completa con todos los pasos (maniobras) de cada leg.
     * Respeta el orden dado (optimizeWaypoints: false).
     */
    async getRutaDetallada(
        waypoints: Waypoint[],
        origin?: Waypoint,
        destination?: Waypoint,
    ): Promise<RutaDetallada | null> {
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
            waypoints: waypoints.map((wp) => ({
                location: new google.maps.LatLng(wp.lat, wp.lng),
                stopover: true,
            })),
            optimizeWaypoints: false,
            travelMode: google.maps.TravelMode.DRIVING,
        };

        return new Promise((resolve) => {
            directionsService.route(request, (result, status) => {
                if (status !== google.maps.DirectionsStatus.OK || !result?.routes?.length) {
                    resolve(null);
                    return;
                }
                const route = result.routes[0];

                const pasos: PasoRuta[] = [];
                route.legs.forEach((leg, legIndex) => {
                    (leg.steps || []).forEach((step, stepIndex) => {
                        pasos.push({
                            legIndex,
                            stepIndex,
                            instruccion: step.instructions || '',
                            maniobra: step.maneuver || '',
                            distancia: step.distance?.value || 0,
                            duracion: step.duration?.value || 0,
                            inicio: {
                                lat: step.start_location.lat(),
                                lng: step.start_location.lng(),
                            },
                            fin: { lat: step.end_location.lat(), lng: step.end_location.lng() },
                        });
                    });
                });

                const legs: { path: { lat: number; lng: number }[] }[] = route.legs.map((leg) => {
                    const path: { lat: number; lng: number }[] = [];
                    (leg.steps || []).forEach((step) => {
                        (step.path || []).forEach((p) => {
                            const lat = p.lat();
                            const lng = p.lng();
                            const last = path[path.length - 1];
                            if (!last || last.lat !== lat || last.lng !== lng) {
                                path.push({ lat, lng });
                            }
                        });
                    });
                    return { path };
                });

                const totalDistance = route.legs.reduce(
                    (sum, leg) => sum + (leg.distance?.value || 0),
                    0,
                );
                const totalDuration = route.legs.reduce(
                    (sum, leg) => sum + (leg.duration?.value || 0),
                    0,
                );

                resolve({
                    path: route.overview_path?.map((p) => ({ lat: p.lat(), lng: p.lng() })) || [],
                    distancia: totalDistance,
                    duracion: totalDuration,
                    pasos,
                    legs,
                });
            });
        });
    }
}
