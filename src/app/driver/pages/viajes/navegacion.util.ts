export interface LatLng {
    lat: number;
    lng: number;
}

const RADIUS_EARTH_M = 6371000;

function toRad(deg: number): number {
    return (deg * Math.PI) / 180;
}

/** Distancia haversine en metros entre dos coordenadas. */
export function haversine(a: LatLng, b: LatLng): number {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return RADIUS_EARTH_M * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * Rumbo (bearing) en grados [0,360) entre dos coordenadas: 0 = norte,
 * 90 = este, etc. Útil para orientar la cámara del mapa (vista 3D).
 */
export function calcularBearing(a: LatLng, b: LatLng): number {
    const dLng = toRad(b.lng - a.lng);
    const y = Math.sin(dLng) * Math.cos(toRad(b.lat));
    const x =
        Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
        Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng);
    return (Math.atan2(y, x) * 180) / Math.PI;
}

/**
 * Distancia en metros desde una posición hasta el punto más cercano de un path
 * (polyline). Útil para detectar desvíos de la ruta.
 */
export function distanciaAPolyline(pos: LatLng, path: LatLng[]): number {
    if (!path || path.length < 1) return Infinity;
    let min = Infinity;
    for (let i = 0; i < path.length; i++) {
        const d = haversine(pos, path[i]);
        if (d < min) min = d;
    }
    return min;
}

const ICONOS_MANIOBRA: Record<string, string> = {
    'turn-slight-left': 'pi pi-arrow-up-left',
    'turn-sharp-left': 'pi pi-arrow-up-left',
    'turn-left': 'pi pi-arrow-left',
    'turn-slight-right': 'pi pi-arrow-up-right',
    'turn-sharp-right': 'pi pi-arrow-up-right',
    'turn-right': 'pi pi-arrow-right',
    straight: 'pi pi-arrow-up',
    'straight-forward': 'pi pi-arrow-up',
    depart: 'pi pi-home',
    arrive: 'pi pi-flag',
    'uturn-left': 'pi pi-arrow-up-left',
    'uturn-right': 'pi pi-arrow-up-left',
    'merge-left': 'pi pi-arrow-up-left',
    'merge-right': 'pi pi-arrow-up-right',
    'roundabout-left': 'pi pi-map',
    'roundabout-right': 'pi pi-map',
    'ramp-left': 'pi pi-arrow-up-left',
    'ramp-right': 'pi pi-arrow-up-right',
    'fork-left': 'pi pi-arrow-up-left',
    'fork-right': 'pi pi-arrow-up-right',
    ferry: 'pi pi-map',
};

export function iconoManiobra(maniobra: string): string {
    return ICONOS_MANIOBRA[maniobra] || 'pi pi-arrow-up';
}

/** Quita etiquetas HTML (p. ej. <b>, <div style=...>) de step.instructions. */
export function limpiarHtmlInstruccion(texto: string): string {
    if (!texto) return '';
    return texto
        .replace(/<div[^>]*>/g, ' ')
        .replace(/<\/div>/g, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
