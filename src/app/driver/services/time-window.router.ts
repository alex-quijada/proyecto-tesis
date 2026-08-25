import { haversine } from '@/app/driver/pages/viajes/navegacion.util';

/**
 * Parada navegable con su ventana de recepción opcional.
 */
export interface ParadaRuteable {
    id: string;
    latitud: number;
    longitud: number;
    /** HH:MM:SS o HH:MM. Ausente = sin restricción de horario. */
    horaDesde?: string | null;
    horaHasta?: string | null;
}

export interface ResultadoRuteo<T extends ParadaRuteable> {
    /** Paradas ordenadas según el criterio VRPTW (ventanas + tiempo de viaje). */
    orden: T[];
    /** Paradas cuya ventana ya cerró (no entregables en este recorrido). */
    cerradas: T[];
    /** Paradas que aún no abren en su turno (se posponen). */
    noAbiertas: T[];
    /** Hora de llegada estimada (minutos desde medianoche) por parada en `orden`. */
    llegadaMinutos?: number[];
}

export interface OpcionesRuteo {
    /** Minutos de atención por entrega (tiempo de servicio). Default 12. */
    tiempoServicio?: number;
    /** Velocidad promedio (km/h) para estimar el viaje si no se da `tiempoEntre`. Default 35. */
    velocidadKmh?: number;
    /**
     * Devuelve los minutos de viaje desde el punto anterior hasta `p`.
     * Si se omite, se estima con `haversine / velocidad`.
     */
    tiempoEntre?: (p: ParadaRuteable, anterior: { lat: number; lng: number }) => number;
}

const TIEMPO_SERVICIO_DEFAULT = 12;
const VELOCIDAD_DEFAULT = 35;

/** Convierte "HH:MM[:SS]" a minutos desde medianoche. */
function aMinutos(valor: string | null | undefined): number | null {
    if (!valor) return null;
    const partes = valor.split(':').map((p) => Number(p));
    if (partes.length < 2 || partes.some((p) => Number.isNaN(p))) return null;
    return partes[0] * 60 + partes[1];
}

/**
 * Heurística constructiva VRPTW (Vehicle Routing Problem with Time Windows),
 * tipo "inserción secuencial de Solomon (1987)" simplificada, mixta:
 *
 *  - Ventanas duras: una parada cuya ventana ya cerró (llegada > cierre) NO
 *    se entrega en este turno → se aparta en `cerradas` (se pospone).
 *  - Se simula el reloj: `llegada = horaActual + tiempoDeViaje` y luego se
 *    acumula el tiempo de servicio por entrega.
 *  - Prioridad por urgencia: entre las factibles, primero las que cierran
 *    más pronto (evita llegar a un lugar cerrado).
 *  - Aún no abren: una parada que aún no ha abierto se deja para después de
 *    las abiertas, para no llegar y esperar parados.
 *  - Desempate por distancia / tiempo de viaje desde el punto de partida.
 */
export function ordenarPorVentana<T extends ParadaRuteable>(
    paradas: T[],
    origen: { lat: number; lng: number },
    horaActual = new Date(),
    opciones: OpcionesRuteo = {},
): ResultadoRuteo<T> {
    const ahora = horaActual.getHours() * 60 + horaActual.getMinutes();
    const servicio = opciones.tiempoServicio ?? TIEMPO_SERVICIO_DEFAULT;
    const vel = opciones.velocidadKmh ?? VELOCIDAD_DEFAULT;

    const calcularViaje = (p: T, anterior: { lat: number; lng: number }): number => {
        if (opciones.tiempoEntre) return opciones.tiempoEntre(p, anterior);
        const km = haversine(anterior, { lat: p.latitud, lng: p.longitud }) / 1000;
        return (km / vel) * 60;
    };

    // 1) Clasificación inicial por la hora actual.
    const abiertas: T[] = [];
    const noAbiertas: T[] = [];
    const cerradas: T[] = [];

    for (const p of paradas) {
        const apertura = aMinutos(p.horaDesde);
        const cierre = aMinutos(p.horaHasta);

        if (apertura == null && cierre == null) {
            abiertas.push(p);
        } else if (cierre != null && ahora > cierre) {
            cerradas.push(p);
        } else if (apertura != null && ahora < apertura) {
            noAbiertas.push(p);
        } else {
            abiertas.push(p);
        }
    }

    // 2) Construir el orden simulando el reloj y las ventanas.
    const restantes = new Set<T>(abiertas);
    const orden: T[] = [];
    const llegadas: number[] = [];
    let reloj = ahora;
    let ultimo: { lat: number; lng: number } = origen;

    while (restantes.size > 0) {
        let mejor: T | null = null;
        let mejorScore = Infinity;

        for (const p of restantes) {
            const viaje = calcularViaje(p, ultimo);
            const llegada = reloj + viaje;
            const cierre = aMinutos(p.horaHasta);
            const apertura = aMinutos(p.horaDesde);

            // Si llega después del cierre, no es factible en esta posición
            // (ventana dura) → se pospone.
            if (cierre != null && llegada > cierre) continue;

            // Urgencia: cuánto queda antes del cierre (menor = más urgente).
            const urgenciaCierre = cierre != null ? Math.max(0, cierre - llegada) : Infinity;

            // Espera si aún no abre al llegar.
            const esperaApertura = apertura != null && llegada < apertura ? apertura - llegada : 0;

            // Tiempo de viaje (km si es estimación) para desempatar.
            const costoViaje = opciones.tiempoEntre
                ? viaje
                : haversine(ultimo, { lat: p.latitud, lng: p.longitud }) / 1000;

            const score = urgenciaCierre * 1.0 + esperaApertura * 1.5 + costoViaje;
            if (score < mejorScore) {
                mejorScore = score;
                mejor = p;
            }
        }

        if (!mejor) {
            // No hay ninguna factible ahora (todas cerradas al llegar) → se
            // corta y el resto se considerará no entregable en este turno.
            for (const r of restantes) {
                if (aMinutos(r.horaHasta) != null && aMinutos(r.horaDesde) != null) {
                    cerradas.push(r);
                } else {
                    noAbiertas.push(r);
                }
            }
            restantes.clear();
            break;
        }

        restantes.delete(mejor);
        orden.push(mejor);
        const viaje = calcularViaje(mejor, ultimo);
        reloj = reloj + viaje;
        llegadas.push(reloj);
        reloj = reloj + servicio; // tiempo de servicio para la siguiente.
        ultimo = { lat: mejor.latitud, lng: mejor.longitud };
    }

    // 3) Anexar las "no abiertas" y "cerradas" ordenadas por cercanía.
    const cerradasOrdenadas = [...cerradas].sort(
        (a, b) =>
            haversine(ultimo, { lat: a.latitud, lng: a.longitud }) -
            haversine(ultimo, { lat: b.latitud, lng: b.longitud }),
    );
    const noAbiertasOrdenadas = [...noAbiertas].sort(
        (a, b) =>
            haversine(ultimo, { lat: a.latitud, lng: a.longitud }) -
            haversine(ultimo, { lat: b.latitud, lng: b.longitud }),
    );

    const ordenFinal = [...orden, ...noAbiertasOrdenadas, ...cerradasOrdenadas];

    return {
        orden: ordenFinal,
        cerradas,
        noAbiertas,
        llegadaMinutos: llegadas,
    };
}
