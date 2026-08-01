import { Injectable } from '@angular/core';
import { environment } from '@/environments/environment';
import { Waypoint, GoogleOptimizationResult } from './google-maps-optimization.service';

export interface TimeWindow {
    start: string;
    end: string;
}

@Injectable({ providedIn: 'root' })
export class GoogleCloudRouteOptimizationService {
    async optimize(
        waypoints: Waypoint[],
        origin?: Waypoint,
        destination?: Waypoint,
        timeWindows?: (TimeWindow | null)[],
    ): Promise<GoogleOptimizationResult | null> {
        if (waypoints.length < 2) return null;

        const ori = origin || waypoints[0];
        const dest = destination || waypoints[waypoints.length - 1];

        const intermediateWaypoints = origin || destination ? waypoints : waypoints.slice(1, -1);

        const today = new Date();
        today.setHours(8, 0, 0, 0);

        const shipments = intermediateWaypoints.map((wp, i) => {
            const shipment: any = {
                deliveries: [
                    {
                        arrivalLocation: {
                            latLng: { latitude: wp.lat, longitude: wp.lng },
                        },
                    },
                ],
                label: wp.name || `Stop ${i}`,
            };

            const idx = origin || destination ? i : i + 1;
            const tw = timeWindows?.[idx];
            if (tw) {
                shipment.deliveries[0].timeWindows = [{ start: tw.start, end: tw.end }];
            }

            return shipment;
        });

        const requestBody: any = {
            model: {
                vehicles: [
                    {
                        startLocation: {
                            latLng: { latitude: ori.lat, longitude: ori.lng },
                        },
                        endLocation: {
                            latLng: { latitude: dest.lat, longitude: dest.lng },
                        },
                    },
                ],
                shipments,
                globalStartTime: today.toISOString(),
            },
            searchMode: 'CONSULT_AND_TIME_LIMIT',
            timeout: '30s',
        };

        const url = `/route-optimization/v1/projects/${environment.googleProjectId}/locations/${environment.googleRegion || 'global'}/optimizeTours?key=${environment.googleMapsKey}`;

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                const msg = body?.error?.message || body?.error || res.statusText;
                throw new Error(`Route Optimization API: ${msg} (${res.status})`);
            }

            const data = await res.json();

            const route = data?.routes?.[0];
            if (!route?.steps?.length) {
                throw new Error('La API no devolvió rutas optimizadas');
            }

            const optimizedIntermediateOrder: number[] = route.steps
                .map((step: any) => step.visits?.[0]?.shipmentIndex)
                .filter((i: number | undefined): i is number => i !== undefined);

            if (optimizedIntermediateOrder.length === 0) {
                throw new Error('No se encontraron visitas en la respuesta');
            }

            const order: number[] =
                origin || destination
                    ? optimizedIntermediateOrder
                    : [0, ...optimizedIntermediateOrder.map((i) => i + 1), waypoints.length - 1];

            const orderedWaypoints = order.map((i) => waypoints[i]);

            return this.getDirectionsRoute(ori, dest, orderedWaypoints, order);
        } catch (e: any) {
            console.error('Route Optimization API error:', e);
            throw new Error(e.message || 'Error al llamar Route Optimization API');
        }
    }

    private getDirectionsRoute(
        ori: Waypoint,
        dest: Waypoint,
        orderedWaypoints: Waypoint[],
        order: number[],
    ): Promise<GoogleOptimizationResult> {
        const directionsService = new google.maps.DirectionsService();

        return new Promise((resolve) => {
            const request: google.maps.DirectionsRequest = {
                origin: new google.maps.LatLng(ori.lat, ori.lng),
                destination: new google.maps.LatLng(dest.lat, dest.lng),
                waypoints: orderedWaypoints
                    .filter((wp) => wp !== ori && wp !== dest)
                    .map((wp) => ({
                        location: new google.maps.LatLng(wp.lat, wp.lng),
                        stopover: true,
                    })),
                optimizeWaypoints: false,
                travelMode: google.maps.TravelMode.DRIVING,
            };

            directionsService.route(request, (result, status) => {
                if (status !== google.maps.DirectionsStatus.OK || !result?.routes?.length) {
                    resolve({ order, distance: 0, duration: 0, path: [] });
                    return;
                }

                const r = result.routes[0];
                const totalDistance = r.legs.reduce(
                    (sum, leg) => sum + (leg.distance?.value || 0),
                    0,
                );
                const totalDuration = r.legs.reduce(
                    (sum, leg) => sum + (leg.duration?.value || 0),
                    0,
                );
                const path = r.overview_path?.map((p) => ({ lat: p.lat(), lng: p.lng() })) || [];

                resolve({
                    order,
                    distance: totalDistance,
                    duration: totalDuration,
                    path,
                });
            });
        });
    }
}
