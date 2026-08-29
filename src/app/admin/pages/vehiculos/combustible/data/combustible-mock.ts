export interface CargaCombustible {
    id?: string;
    idVehiculo: string;
    placaVehiculo: string;
    vehiculoDesc: string;
    fecha: string;
    tipoCombustible: 'GASOLINA_95' | 'GASOLINA_91' | 'DIESEL';
    nivelTanqueAntes: number;
    nivelTanqueDespues: number;
    litrosCargados: number;
    costoPorLitro: number;
    costoTotal: number;
    costoTotalBss?: number;
    /** Tasa Bs/USD del día usada para calcular el costo en bolívares. */
    tasaBs?: number;
    /** Chofer que registró la carga (NULL = registrada por staff). */
    idChofer?: string | null;
    nombreChofer?: string | null;
    /** Origen del registro: 'CHOFER' | 'STAFF'. */
    origen?: 'CHOFER' | 'STAFF';
}

export const TIPOS_COMBUSTIBLE = [
    { label: 'Gasolina 95 Octanos', value: 'GASOLINA_95' },
    { label: 'Gasolina 91 Octanos', value: 'GASOLINA_91' },
    { label: 'Diésel', value: 'DIESEL' },
];

export const NIVELES_TANQUE = [
    { label: 'Vacío (0%)', value: 0 },
    { label: '1/4 (25%)', value: 0.25 },
    { label: '1/2 (50%)', value: 0.5 },
    { label: '3/4 (75%)', value: 0.75 },
    { label: 'Lleno (100%)', value: 1 },
];

/** Límites de litros por tipo de vehículo (capacidad razonable de tanque). */
export const LIMITES_LITROS_POR_TIPO: Record<string, { min: number; max: number }> = {
    MOTO: { min: 1, max: 20 },
    CARRO: { min: 1, max: 120 },
    CAMION: { min: 1, max: 600 },
};

/** Devuelve los límites de litros según el tipo de vehículo (default CARRO). */
export function limitesLitrosPorTipo(tipo?: string | null): { min: number; max: number } {
    return LIMITES_LITROS_POR_TIPO[tipo ?? ''] ?? { min: 1, max: 120 };
}
