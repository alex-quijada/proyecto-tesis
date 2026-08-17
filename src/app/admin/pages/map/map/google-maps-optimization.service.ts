import { Injectable } from '@angular/core';
import { haversine } from '@/app/driver/pages/viajes/navegacion.util';

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

interface TramoBloqueado {
    segmento: { lat: number; lng: number }[];
    radioM: number;
}

interface CruceBloqueo {
    tramo: TramoBloqueado;
    punto: { lat: number; lng: number };
    vecino: { lat: number; lng: number };
    legIndex: number;
    dist: number;
}

/** Tramo(s) de calle que Google marca como transitables pero que en realidad
 *  no lo son (p. ej. la calle de tierra detrás del almacén). La ruta intenta
 *  evitarlos insertando un waypoint "via" de desvío. */
const TRAMOS_BLOQUEADOS: TramoBloqueado[] = [
    {
        segmento: [
            { lat: 10.957506, lng: -63.8716 },
            { lat: 10.958224, lng: -63.871237 },
        ],
        radioM: 40,
    },
];
/** Distancia perpendicular (m) a la que se coloca el waypoint de desvío. */
const OFFSET_DESVIO_M = 60;

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

        const res = await this.pedirRuta(request);
        if (!res) return null;
        const route = res.routes[0];
        const totalDistance = route.legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0);
        const totalDuration = route.legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0);
        return {
            order: waypoints.map((_, i) => i),
            distance: totalDistance,
            duration: totalDuration,
            path: route.overview_path?.map((p) => ({ lat: p.lat(), lng: p.lng() })) || [],
        };
    }

    async optimize(
        waypoints: Waypoint[],
        origin?: Waypoint,
        destination?: Waypoint,
    ): Promise<GoogleOptimizationResult | null> {
        if (waypoints.length < 1) return null;
        if (typeof google === 'undefined' || !google.maps) return null;

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

        // Paso 1: solo el orden optimizado (la evasión aquí rompería el
        // waypoint_order). La geometría limpia se calcula en el paso 2.
        const res1 = await this.llamar(request);
        if (!res1) return null;
        const route1 = res1.routes[0];
        const order: number[] =
            origin || destination
                ? route1.waypoint_order
                : [0, ...route1.waypoint_order.map((i) => i + 1), waypoints.length - 1];

        // Paso 2: re-rutear los stops ya ordenados con evasión de calles
        // bloqueadas para devolver path/distancia/duración correctos.
        const ordenados = order.map((idx) => waypoints[idx]).filter((w): w is Waypoint => !!w);
        const detallada = await this.getRutaDetallada(ordenados, origin, destination);
        if (detallada) {
            return {
                order,
                distance: detallada.distancia,
                duration: detallada.duracion,
                path: detallada.path,
            };
        }

        // Fallback: geometría cruda de la ruta optimizada.
        const path: { lat: number; lng: number }[] =
            route1.overview_path?.map((p) => ({ lat: p.lat(), lng: p.lng() })) || [];
        const totalDistance = route1.legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0);
        const totalDuration = route1.legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0);
        return { order, distance: totalDistance, duration: totalDuration, path };
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

        const res = await this.pedirRuta(request);
        if (!res) return null;
        const route = res.routes[0];

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

        const totalDistance = route.legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0);
        const totalDuration = route.legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0);

        return {
            path: route.overview_path?.map((p) => ({ lat: p.lat(), lng: p.lng() })) || [],
            distancia: totalDistance,
            duracion: totalDuration,
            pasos,
            legs,
        };
    }

    // ---------------- Evasión de calles bloqueadas ----------------

    private llamar(
        request: google.maps.DirectionsRequest,
    ): Promise<google.maps.DirectionsResult | null> {
        if (typeof google === 'undefined' || !google.maps) return Promise.resolve(null);
        const directionsService = new google.maps.DirectionsService();
        return new Promise((resolve) => {
            directionsService.route(request, (result, status) => {
                if (status !== google.maps.DirectionsStatus.OK || !result?.routes?.length) {
                    resolve(null);
                    return;
                }
                resolve(result);
            });
        });
    }

    /** Devuelve el tramo bloqueado más cercano por el que pasa la ruta. */
    private hallarCruce(route: google.maps.DirectionsRoute): CruceBloqueo | null {
        let mejor: CruceBloqueo | null = null;
        route.legs.forEach((leg, legIndex) => {
            (leg.steps || []).forEach((step) => {
                const path = step.path || [];
                for (let i = 0; i < path.length; i++) {
                    const p = { lat: path[i].lat(), lng: path[i].lng() };
                    for (const tramo of TRAMOS_BLOQUEADOS) {
                        for (let s = 0; s < tramo.segmento.length - 1; s++) {
                            const proy = this.proyectarASegmento(
                                p,
                                tramo.segmento[s],
                                tramo.segmento[s + 1],
                            );
                            if (proy.dist < tramo.radioM && (!mejor || proy.dist < mejor.dist)) {
                                mejor = {
                                    tramo,
                                    punto: proy.punto,
                                    vecino: tramo.segmento[s + 1],
                                    legIndex,
                                    dist: proy.dist,
                                };
                            }
                        }
                    }
                }
            });
        });
        return mejor;
    }

    /** Punto más cercano sobre un segmento y su distancia (lat/lng aprox.). */
    private proyectarASegmento(
        p: { lat: number; lng: number },
        a: { lat: number; lng: number },
        b: { lat: number; lng: number },
    ): { punto: { lat: number; lng: number }; dist: number } {
        const ax = a.lat;
        const ay = a.lng;
        const bx = b.lat;
        const by = b.lng;
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) {
            return { punto: { lat: ax, lng: ay }, dist: haversine(p, a) };
        }
        const t = Math.max(0, Math.min(1, ((p.lat - ax) * dx + (p.lng - ay) * dy) / len2));
        const punto = { lat: ax + dx * t, lng: ay + dy * t };
        return { punto, dist: haversine(p, punto) };
    }

    /** Dos puntos a ±OFFSET_DESVIO_M perpendicular a la dirección del tramo bloqueado. */
    private candidatosDesvio(cruce: CruceBloqueo): { lat: number; lng: number }[] {
        const seg = cruce.tramo.segmento;
        const a = seg[0];
        const b = seg[seg.length - 1];
        let dx = b.lng - a.lng;
        let dy = b.lat - a.lat;
        const norm = Math.hypot(dx, dy) || 1;
        dx /= norm;
        dy /= norm;
        const latM = 1 / 111320;
        const lngM =
            1 / (111320 * Math.max(0.1, Math.cos((cruce.punto.lat * Math.PI) / 180)));
        const ox = -dy * OFFSET_DESVIO_M * lngM;
        const oy = dx * OFFSET_DESVIO_M * latM;
        return [
            { lat: cruce.punto.lat + oy, lng: cruce.punto.lng + ox },
            { lat: cruce.punto.lat - oy, lng: cruce.punto.lng - ox },
        ];
    }

    /**
     * Calcula la ruta evitando los puntos bloqueados: si la ruta normal pasa
     * cerca de uno, inserta un waypoint "via" (no parada) en el leg que cruza,
     * primero a un lado y luego al otro. Si ambos fallan, devuelve la original.
     */
    private async pedirRuta(
        request: google.maps.DirectionsRequest,
    ): Promise<google.maps.DirectionsResult | null> {
        const res = await this.llamar(request);
        if (!res) return null;
        const cruce = this.hallarCruce(res.routes[0]);
        if (!cruce) return res;

        const candidatos = this.candidatosDesvio(cruce);
        const pos = Math.min(cruce.legIndex, request.waypoints?.length ?? 0);

        for (const w of candidatos) {
            const waypoints = [...(request.waypoints || [])];
            waypoints.splice(pos, 0, {
                location: new google.maps.LatLng(w.lat, w.lng),
                stopover: false,
            });
            const res2 = await this.llamar({ ...request, waypoints });
            if (!res2) continue;
            if (!this.hallarCruce(res2.routes[0])) return res2;
        }
        return res;
    }
}
