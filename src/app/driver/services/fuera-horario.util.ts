import { haversine, LatLng } from '@/app/driver/pages/viajes/navegacion.util';

/** Tiempo de servicio estimado por entrega (min). */
export const TIEMPO_SERVICIO_MIN = 12;
/** Tiempo de gracia tras la ventana laboral (min). */
export const GRACIA_MIN = 15;
/** Velocidad promedio para estimar el viaje si no hay duración de leg. */
export const VELOCIDAD_KMH = 35;

/** Convierte "HH:MM[:SS]" a minutos desde medianoche. */
export function aMinutosDelDia(hora: string | null | undefined): number | null {
    if (!hora) return null;
    const partes = hora.split(':').map((p) => Number(p));
    if (partes.length < 2 || partes.some((p) => Number.isNaN(p))) return null;
    return partes[0] * 60 + partes[1];
}

/** Duración (min) de un leg de la ruta detallada, si tiene tiempos. */
export function duracionLegMin(leg?: {
    arrivalTime?: number;
    departureTime?: number;
}): number | null {
    if (!leg?.arrivalTime || !leg.departureTime) return null;
    const ms = leg.arrivalTime - leg.departureTime;
    if (ms <= 0) return null;
    return ms / 60000;
}

/** Tiempo de viaje (min) por distancia recta a la velocidad promedio. */
export function tiempoViajeDistanciaMin(distM: number): number {
    if (distM <= 0) return 0;
    return (distM / 1000 / VELOCIDAD_KMH) * 60;
}

/**
 * ¿Es hora de volver al almacén?
 * horaActual + tiempoViajeSiguiente + tiempoServicio(12) + gracia(15) > ventana_fin
 */
export function esHoraDeVolver(opts: {
    ventanaFin?: string | null;
    horaActual: Date;
    tiempoViajeSiguienteMin: number;
}): boolean {
    const fin = aMinutosDelDia(opts.ventanaFin);
    if (fin === null) return false;
    const ahora = opts.horaActual.getHours() * 60 + opts.horaActual.getMinutes();
    return ahora + opts.tiempoViajeSiguienteMin + TIEMPO_SERVICIO_MIN + GRACIA_MIN > fin;
}

/** Distancia (m) desde un origen hasta un punto, para estimar el viaje. */
export function distanciaHasta(desde: LatLng, hasta: { lat: number; lng: number }): number {
    return haversine(desde, { lat: hasta.lat, lng: hasta.lng });
}
