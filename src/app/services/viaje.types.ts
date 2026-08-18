export interface Viaje {
    idViaje: string;
    idChofer: string;
    idVehiculo: string;
    estado: string;
    fechaCreacion: string;
    paradas: ParadaViaje[];
}

export interface ParadaViaje {
    orden_visita: number;
    id_factura: string;
    numero_factura: string;
    id_guia?: string;
    codigo_guia?: string;
    nombre_cliente?: string;
    direccion?: string;
    municipio?: string;
    latitud?: number | null;
    longitud?: number | null;
    estado_factura?: string;
    monto_dolares?: number | null;
    incidencia_tipo?: string;
    incidencia_descripcion?: string;
    incidencia_foto?: string;
}

export interface PasoRutaPersistido {
    legIndex: number;
    stepIndex: number;
    instruccion: string;
    maniobra: string;
    distancia: number;
    duracion: number;
    inicio: { lat: number; lng: number };
    fin: { lat: number; lng: number };
}

export interface RutaPersistida {
    path: { lat: number; lng: number }[];
    distancia: number;
    duracion: number;
    pasos: PasoRutaPersistido[];
    legs?: { path: { lat: number; lng: number }[] }[];
}

export interface ViajeChofer {
    id_viaje: string;
    id_chofer: string;
    id_vehiculo: string;
    fecha_viaje?: string;
    estado: string;
    placa_vehiculo?: string;
    distancia_total_km?: number | null;
    duracion_total_min?: number | null;
    fecha_creacion?: string;
    ruta_detallada?: RutaPersistida | null;
    paradas: ParadaViaje[];
}

export interface ViajeAdmin extends ViajeChofer {
    chofer?: string;
    placa_vehiculo?: string;
    total_facturas?: number;
    facturas_embarque?: number;
    facturas_proceso?: number;
    facturas_espera?: number;
    facturas_entrega?: number;
    ventana_inicio?: string;
    ventana_fin?: string;
    fecha_finalizacion?: string | null;
}

export interface CrearViajeResult {
    id_viaje: string;
    nuevo: boolean;
    total_facturas: number;
    id_chofer: string;
}

export interface ViajeGroup {
    idChofer: string;
    nombreChofer: string;
    idVehiculo: string;
    placaVehiculo: string;
    guias: { id: string; numeroGuia: string; facturaIds: string[] }[];
}
