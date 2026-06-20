export interface DatosGuia {
    camion: string;
    placa: string;
    pesoLimite: number;
    chofer: string;
    ruta: string;
    facturas: FacturaAsociada[];
    totalDolares: number;
    totalBolivares: number;
}

export interface FacturaAsociada {
    numero: string;
    cliente: string;
    tlf: string;
    direccion: string;
    totalUSD: number;
    totalVES: number;
}
