export type Empresa =
    | 'INVERSIONES ANGELO, C.A.'
    | 'DISTRIBUIDORA METROPOL C.A.'
    | 'INVERSIONES MALESI, C.A.'
    | 'INVERSIONES METROPOLITANA C.A.'
    | 'INVERSIONES MALEPA, C.A.'
    | 'GUUAO C.A.';

export interface DatosGuia {
    codigoGuia: string;
    empresa: Empresa | '';
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
