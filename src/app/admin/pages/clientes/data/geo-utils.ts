export function puntoEnPoligono(
    lng: number,
    lat: number,
    coordinates: number[][][][] | number[][][],
): boolean {
    if (!coordinates || coordinates.length === 0) return false;

    const rings = extractRings(coordinates);
    for (const ring of rings) {
        if (rayCastIntersect(lng, lat, ring)) return true;
    }
    return false;
}

function extractRings(coordinates: number[][][][] | number[][][]): number[][][] {
    if (coordinates.length === 0) return [];
    if (Array.isArray(coordinates[0][0][0])) {
        return (coordinates as number[][][][]).map((p) => p[0]);
    }
    return [coordinates[0] as number[][]];
}

function rayCastIntersect(lng: number, lat: number, ring: number[][]): boolean {
    let inside = false;
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];

        if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}
