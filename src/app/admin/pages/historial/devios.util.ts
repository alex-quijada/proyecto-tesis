import { TrazaViajePunto } from '@/app/services/viaje.service';

export interface MetricasDesvio {
    distanciaPlaneadaKm: number;
    distanciaRealKm: number;
    kmExtra: number;
    porcentajeSobreRuta: number;
    desvioPromedioM: number;
    desvioMaximoM: number;
    puntosReal: number;
    esSimulacion: boolean;
}

/** Distancia haversine entre dos coordenadas en metros. */
export function haversineM(
    a: { lat: number; lng: number },
    b: { lat: number; lng: number },
): number {
    const R = 6371000;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const la1 = (a.lat * Math.PI) / 180;
    const la2 = (b.lat * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

/** Distancia de un punto a un segmento (en metros), con proyección perpendicular. */
function distanciaAPuntoSegmento(
    p: { lat: number; lng: number },
    a: { lat: number; lng: number },
    b: { lat: number; lng: number },
): number {
    // Trabajar en coordenadas planas relativas a 'a' (escala ~110km/grado lat).
    const x = (p.lng - a.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
    const y = (p.lat - a.lat) * 110540;
    const ax = (b.lng - a.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
    const ay = (b.lat - a.lat) * 110540;

    const dx =
        b.lng === a.lng && b.lat === a.lat ? 0 : x - ((x * ax + y * ay) / (ax * ax + ay * ay)) * ax;
    const dy =
        b.lng === a.lng && b.lat === a.lat ? 0 : y - ((x * ax + y * ay) / (ax * ax + ay * ay)) * ay;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Limpia y depura la traza del chofer:
 * 1) Elimina puntos nulos o con coordenadas (0, 0).
 * 2) Ordena cronológicamente por timestamp.
 * 3) Filtra micro-ruido de GPS estacionado (< 3 m).
 * 4) Descarta saltos irreales de teletransporte (ej. reseteos de posición / salto al almacén).
 */
export function depurarTraza(puntos: TrazaViajePunto[], maxVelocidadKmh = 140): TrazaViajePunto[] {
    const validos = (puntos || []).filter(
        (p) =>
            p.latitud != null &&
            p.longitud != null &&
            !isNaN(p.latitud) &&
            !isNaN(p.longitud) &&
            p.latitud !== 0 &&
            p.longitud !== 0,
    );

    if (validos.length < 2) return validos;

    // Ordenar cronológicamente
    validos.sort((a, b) => {
        const tA = a.creada_en ? new Date(a.creada_en).getTime() : 0;
        const tB = b.creada_en ? new Date(b.creada_en).getTime() : 0;
        return tA - tB;
    });

    const limpios: TrazaViajePunto[] = [validos[0]];

    for (let i = 1; i < validos.length; i++) {
        const actual = validos[i];
        const anterior = limpios[limpios.length - 1];

        const distM = haversineM(
            { lat: anterior.latitud, lng: anterior.longitud },
            { lat: actual.latitud, lng: actual.longitud },
        );

        // Descartar micro-ruido de chofer detenido
        if (distM < 3) continue;

        // Descartar teletransportes irreales (ej. saltos de inicialización > 300m a velocidades astronómicas)
        if (anterior.creada_en && actual.creada_en) {
            const dtSegundos =
                (new Date(actual.creada_en).getTime() - new Date(anterior.creada_en).getTime()) /
                1000;
            if (dtSegundos > 0) {
                const velKmh = (distM / dtSegundos) * 3.6;
                if (velKmh > maxVelocidadKmh && distM > 300) {
                    continue;
                }
            }
        }

        limpios.push(actual);
    }

    return limpios.length >= 2 ? limpios : validos;
}

/**
 * Longitud total de una polyline de puntos (con latitud/longitud o lat/lng)
 * en km (haversine acumulada).
 */
export function longitudPolylineKm(
    path: { lat: number; lng: number }[] | TrazaViajePunto[],
): number {
    let total = 0;
    for (let i = 1; i < path.length; i++) {
        const a = toLatLng(path[i - 1]);
        const b = toLatLng(path[i]);
        total += haversineM(a, b);
    }
    return total / 1000;
}

function toLatLng(p: { lat: number; lng: number } | TrazaViajePunto): { lat: number; lng: number } {
    if ('lat' in p) return { lat: p.lat, lng: p.lng };
    return { lat: p.latitud, lng: p.longitud };
}

/**
 * Calcula las métricas de desvío entre la ruta planificada (VRPTW,
 * `ruta_detallada.path`) y la traza real depurada del chofer.
 */
export function calcularMetricasDesvio(
    traza: TrazaViajePunto[],
    rutaPlaneada: { lat: number; lng: number }[],
    distanciaPlaneadaMetros?: number | null,
): MetricasDesvio | null {
    const puntosReal = depurarTraza(traza);
    if (puntosReal.length < 2 || rutaPlaneada.length < 2) return null;

    const distanciaRealKm = longitudPolylineKm(puntosReal);
    const distanciaPlaneadaKm =
        distanciaPlaneadaMetros != null && distanciaPlaneadaMetros > 0
            ? distanciaPlaneadaMetros / 1000
            : longitudPolylineKm(rutaPlaneada);

    const kmExtra = Math.max(0, distanciaRealKm - distanciaPlaneadaKm);
    const porcentajeSobreRuta =
        distanciaPlaneadaKm > 0 ? (distanciaRealKm / distanciaPlaneadaKm) * 100 : 0;

    // Desvío de cada punto real al tramo más cercano de la ruta planeada.
    let desvioSum = 0;
    let desvioMax = 0;
    for (const t of puntosReal) {
        const p = { lat: t.latitud, lng: t.longitud };
        let min = Infinity;
        for (let i = 1; i < rutaPlaneada.length; i++) {
            const d = distanciaAPuntoSegmento(p, rutaPlaneada[i - 1], rutaPlaneada[i]);
            if (d < min) min = d;
        }
        desvioSum += min;
        if (min > desvioMax) desvioMax = min;
    }

    return {
        distanciaPlaneadaKm,
        distanciaRealKm,
        kmExtra,
        porcentajeSobreRuta,
        desvioPromedioM: desvioSum / puntosReal.length,
        desvioMaximoM: desvioMax,
        puntosReal: puntosReal.length,
        esSimulacion: puntosReal.some((t) => t.es_simulacion),
    };
}
