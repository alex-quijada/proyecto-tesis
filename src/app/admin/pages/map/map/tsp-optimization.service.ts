import { Injectable } from '@angular/core';
import { Waypoint, GoogleOptimizationResult } from './google-maps-optimization.service';

export interface TimeWindow {
    start: string;
    end: string;
}

@Injectable({ providedIn: 'root' })
export class TspOptimizationService {
    async optimize(
        waypoints: Waypoint[],
        origin?: Waypoint,
        destination?: Waypoint,
        timeWindows?: (TimeWindow | null)[],
    ): Promise<GoogleOptimizationResult | null> {
        if (waypoints.length < 2) return null;

        const ori = origin || waypoints[0];
        const dest = destination || waypoints[waypoints.length - 1];

        const intermediateIndices: number[] =
            origin || destination
                ? waypoints.map((_, i) => i)
                : waypoints.slice(1, -1).map((_, i) => i + 1);

        const n = intermediateIndices.length;
        if (n === 0) {
            const order = [waypoints.indexOf(ori), waypoints.indexOf(dest)];
            const ordered = order.map((i) => waypoints[i]);
            return this.getDirectionsRoute(ori, dest, ordered, order);
        }

        const dist = this.buildDistanceMatrix(intermediateIndices, waypoints);

        let bestOrder: number[];
        let bestDist: number;

        if (timeWindows?.some((tw) => tw !== null)) {
            bestOrder = this.nearestNeighborWithTimeWindows(
                intermediateIndices,
                waypoints,
                dist,
                ori,
                dest,
                timeWindows,
            );
        } else {
            bestOrder = this.nearestNeighbor(intermediateIndices, waypoints, dist, ori, dest);
        }

        bestDist = this.totalDistance(bestOrder, dist);
        const improved = this.twoOpt(bestOrder, dist);
        const improvedDist = this.totalDistance(improved, dist);

        const finalOrder = improvedDist < bestDist ? improved : bestOrder;

        const order: number[] =
            origin || destination
                ? finalOrder
                : [waypoints.indexOf(ori), ...finalOrder, waypoints.indexOf(dest)];

        const orderedWaypoints = order.map((i) => waypoints[i]);

        return this.getDirectionsRoute(ori, dest, orderedWaypoints, order);
    }

    private haversineKm(a: Waypoint, b: Waypoint): number {
        const R = 6371;
        const dLat = ((b.lat - a.lat) * Math.PI) / 180;
        const dLng = ((b.lng - a.lng) * Math.PI) / 180;
        const sinDLat = Math.sin(dLat / 2);
        const sinDLng = Math.sin(dLng / 2);
        const aVal =
            sinDLat * sinDLat +
            Math.cos((a.lat * Math.PI) / 180) *
                Math.cos((b.lat * Math.PI) / 180) *
                sinDLng *
                sinDLng;
        return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
    }

    private buildDistanceMatrix(indices: number[], waypoints: Waypoint[]): number[][] {
        const n = indices.length;
        const dist: number[][] = Array.from({ length: n + 2 }, () => Array(n + 2).fill(0));
        const all = [
            waypoints.indexOf(waypoints[0]),
            ...indices,
            waypoints.indexOf(waypoints[waypoints.length - 1]),
        ];
        const pts = all.map((i) => waypoints[i]);
        for (let i = 0; i < pts.length; i++) {
            for (let j = 0; j < pts.length; j++) {
                dist[i][j] = this.haversineKm(pts[i], pts[j]);
            }
        }
        return dist;
    }

    private nearestNeighbor(
        indices: number[],
        waypoints: Waypoint[],
        dist: number[][],
        ori: Waypoint,
        dest: Waypoint,
    ): number[] {
        const n = indices.length;
        const visited = new Set<number>();
        const order: number[] = [];
        let current = 0; // index 0 = origin in distance matrix
        visited.add(0);

        for (let step = 0; step < n; step++) {
            let nearest = -1;
            let nearestDist = Infinity;
            for (let j = 1; j <= n; j++) {
                if (visited.has(j)) continue;
                const d = dist[current][j];
                if (d < nearestDist) {
                    nearestDist = d;
                    nearest = j;
                }
            }
            if (nearest === -1) break;
            visited.add(nearest);
            order.push(indices[nearest - 1]);
            current = nearest;
        }

        return order;
    }

    private nearestNeighborWithTimeWindows(
        indices: number[],
        waypoints: Waypoint[],
        dist: number[][],
        ori: Waypoint,
        dest: Waypoint,
        timeWindows: (TimeWindow | null)[],
    ): number[] {
        const n = indices.length;
        const visited = new Set<number>();
        const order: number[] = [];
        const SPEED_KM_PER_SEC = 40 / 3600;
        const SERVICE_TIME_SEC = 900;

        const allIndices = [waypoints.indexOf(ori), ...indices, waypoints.indexOf(dest)];

        let current = 0;
        visited.add(0);
        let currentTimeSec = timeWindows[allIndices[0]]
            ? new Date(timeWindows[allIndices[0]]!.start).getTime() / 1000
            : 6 * 3600;

        for (let step = 0; step < n; step++) {
            let best = -1;
            let bestScore = Infinity;

            for (let j = 1; j <= n; j++) {
                if (visited.has(j)) continue;

                const travelSec = dist[current][j] / SPEED_KM_PER_SEC;
                const arrivalSec = currentTimeSec + travelSec;
                const wpIdx = allIndices[j];
                const tw = timeWindows[wpIdx];

                let penalty = 0;
                if (tw) {
                    const twStart = new Date(tw.start).getTime() / 1000;
                    const twEnd = new Date(tw.end).getTime() / 1000;
                    if (arrivalSec > twEnd) {
                        penalty = 1e6;
                    } else if (arrivalSec < twStart) {
                        penalty = (twStart - arrivalSec) * 0.5;
                    }
                }

                const score = dist[current][j] + penalty;
                if (score < bestScore) {
                    bestScore = score;
                    best = j;
                }
            }

            if (best === -1) break;

            const travelSec = dist[current][best] / SPEED_KM_PER_SEC;
            currentTimeSec += travelSec + SERVICE_TIME_SEC;
            visited.add(best);
            order.push(indices[best - 1]);
            current = best;
        }

        return order;
    }

    private twoOpt(order: number[], dist: number[][]): number[] {
        const n = order.length;
        let improved = true;
        let best = [...order];

        while (improved) {
            improved = false;
            for (let i = 0; i < n - 1; i++) {
                for (let j = i + 1; j < n; j++) {
                    const mapped = [0, ...best.map((_, idx) => idx + 1), n + 1];
                    const iMapped = i + 1;
                    const jMapped = j + 1;

                    const delta =
                        -dist[mapped[iMapped]][mapped[iMapped + 1]] -
                        dist[mapped[jMapped]][mapped[jMapped + 1]] +
                        dist[mapped[iMapped]][mapped[jMapped]] +
                        dist[mapped[iMapped + 1]][mapped[jMapped + 1]];

                    if (delta < -1e-10) {
                        const newOrder = [...best];
                        const segment = newOrder.splice(i, j - i + 1).reverse();
                        newOrder.splice(i, 0, ...segment);
                        best = newOrder;
                        improved = true;
                    }
                }
            }
        }

        return best;
    }

    private totalDistance(order: number[], dist: number[][]): number {
        const mapped = [0, ...order.map((_, idx) => idx + 1), order.length + 1];
        let total = 0;
        for (let i = 0; i < mapped.length - 1; i++) {
            total += dist[mapped[i]][mapped[i + 1]];
        }
        return total;
    }

    private getDirectionsRoute(
        ori: Waypoint,
        dest: Waypoint,
        orderedWaypoints: Waypoint[],
        order: number[],
    ): Promise<GoogleOptimizationResult> {
        if (typeof google === 'undefined' || !google.maps) {
            return Promise.resolve({ order, distance: 0, duration: 0, path: [] });
        }

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

                resolve({ order, distance: totalDistance, duration: totalDuration, path });
            });
        });
    }
}
