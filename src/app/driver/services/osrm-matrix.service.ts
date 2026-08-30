import { Injectable } from '@angular/core';
import { haversine } from '@/app/driver/pages/viajes/navegacion.util';
import { ParadaRuteable } from './time-window.router';

/**
 * INTERRUPTOR PRINCIPAL (Feature Flag):
 * - false (por defecto): Utiliza la distancia euclidiana/Haversine actual sin llamadas externas.
 * - true: Consulta la matriz de distancias y tiempos de la red vial real en OSRM (OpenStreetMap).
 */
export const USAR_MATRIZ_VIAL = true;

export interface MatrizVialResultado {
    /** Matriz de duraciones en segundos: durations[origenIdx][destinoIdx] */
    durations: number[][];
    /** Matriz de distancias en metros: distances[origenIdx][destinoIdx] */
    distances: number[][];
}

@Injectable({ providedIn: 'root' })
export class OsrmMatrixService {
    /** Flag maestro para activar/desactivar el cálculo con red vial real. */
    readonly habilitado = USAR_MATRIZ_VIAL;

    /**
     * Consulta la matriz de distancias y tiempos de la red vial real usando OSRM (OpenStreetMap).
     * Si está deshabilitado o la petición falla, devuelve null para fallback automático a Haversine.
     * @param puntos Array de coordenadas [{ lat, lng }] (el índice 0 suele ser el origen / almacén).
     */
    async obtenerMatriz(
        puntos: { lat: number; lng: number }[],
    ): Promise<MatrizVialResultado | null> {
        if (!this.habilitado || puntos.length < 2) return null;

        try {
            // Formato OSRM table: lng1,lat1;lng2,lat2;...
            const coordsStr = puntos.map((p) => `${p.lng},${p.lat}`).join(';');
            const url = `https://router.project-osrm.org/table/v1/driving/${coordsStr}?annotations=distance,duration`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!res.ok) return null;
            const data = await res.json();

            if (data.code !== 'Ok' || !data.durations || !data.distances) {
                return null;
            }

            return {
                durations: data.durations,
                distances: data.distances,
            };
        } catch (err) {
            console.warn(
                '[OsrmMatrixService] No se pudo obtener matriz vial de OSRM, usando fallback local:',
                err,
            );
            return null;
        }
    }

    /**
     * Construye la función `tiempoEntre` para `ordenarPorVentana` (VRPTW)
     * a partir de la matriz de red vial real.
     */
    crearCalculadorTiempo(
        puntos: { id: string; latitud: number; longitud: number }[],
        origen: { lat: number; lng: number },
        matriz: MatrizVialResultado,
    ): (p: ParadaRuteable, anterior: { lat: number; lng: number }) => number {
        const todosPuntos = [origen, ...puntos.map((p) => ({ lat: p.latitud, lng: p.longitud }))];

        const encontrarIndice = (pt: { lat: number; lng: number }): number => {
            return todosPuntos.findIndex(
                (p) => Math.abs(p.lat - pt.lat) < 0.0001 && Math.abs(p.lng - pt.lng) < 0.0001,
            );
        };

        return (p: ParadaRuteable, anterior: { lat: number; lng: number }): number => {
            const idxOrigen = encontrarIndice(anterior);
            const idxDestino = encontrarIndice({ lat: p.latitud, lng: p.longitud });

            if (
                idxOrigen >= 0 &&
                idxDestino >= 0 &&
                matriz.durations[idxOrigen]?.[idxDestino] != null
            ) {
                // Duración en segundos convertida a minutos de viaje
                return matriz.durations[idxOrigen][idxDestino] / 60;
            }

            // Fallback a Haversine si no se mapeó el punto
            const km = haversine(anterior, { lat: p.latitud, lng: p.longitud }) / 1000;
            return (km / 35) * 60;
        };
    }
}
