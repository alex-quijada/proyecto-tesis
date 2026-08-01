export interface Viaje {
    idViaje: string;
    idChofer: string;
    idVehiculo: string;
    municipio: string;
    distanciaTotalKm?: number;
    duracionTotalMin?: number;
    estado: string;
    fechaCreacion: string;
}

export interface ItinerarioViajeItem {
    idParada: string;
    idViaje: string;
    idFactura: string;
    ordenVisita: number;
}

export interface CrearViajeResult {
    id_viaje: string;
    total_facturas: number;
    id_chofer: string;
    municipio: string;
}

export interface ViajeGroup {
    idChofer: string;
    nombreChofer: string;
    idVehiculo: string;
    placaVehiculo: string;
    guias: { id: string; numeroGuia: string; facturaIds: string[] }[];
}
