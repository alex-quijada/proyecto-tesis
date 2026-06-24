export interface ReglasRecepcion {
    horaEntrega?: string;
    diasRecepcion?: string[];
    requiereCita?: boolean;
    instrucciones?: string;
}

export interface FacturaGuia {
    id: string;
    numeroFactura: string;
    idCliente: string;
    nombreCliente: string;
    rifCliente: string;
    telefono: string;
    direccion: string;
    idSucursal?: string;
    direccionSucursal?: string;
    totalUSD: number;
    totalVES: number;
    prioridad: string;
    reglasRecepcion?: ReglasRecepcion;
}

export interface EventoGuia {
    id: string;
    idGuia: string;
    tipo: 'SALIDA' | 'LLEGADA_CLIENTE' | 'REGRESO_BASE' | 'DEVOLUCION' | 'OBSERVACION';
    fecha: string;
    descripcion: string;
    ubicacion?: string;
}

export interface GuiaDespacho {
    id: string;
    empresa: string;
    numeroGuia: string;
    codigoGuia?: string;
    idChofer: string;
    nombreChofer: string;
    cedulaChofer: string;
    idVehiculo: string;
    placaVehiculo: string;
    camion?: string;
    municipio: string;
    estado: string;
    pdfFuente: 'MANUAL' | 'PDF';
    fechaCreacion: string;
    observaciones?: string;
    eventos: EventoGuia[];
    facturas: FacturaGuia[];
}

export interface Ruta {
    id: string;
    codigo: string;
    idChofer: string;
    nombreChofer: string;
    idVehiculo: string;
    placaVehiculo: string;
    fechaAsignacion: string;
    idsGuias: string[];
    estado: 'ACTIVA' | 'FINALIZADA' | 'PENDIENTE';
}

export const MUNICIPIOS_NUEVA_ESPARTA = [
    { label: 'Antolín del Campo', value: 'ANTOLIN_DEL_CAMPO' },
    { label: 'Arismendi', value: 'ARISMENDI' },
    { label: 'Díaz', value: 'DIAZ' },
    { label: 'García', value: 'GARCIA' },
    { label: 'Gómez', value: 'GOMEZ' },
    { label: 'Maneiro', value: 'MANEIRO' },
    { label: 'Marcano', value: 'MARCANO' },
    { label: 'Mariño', value: 'MARINO' },
    { label: 'Península de Macanao', value: 'PENINSULA_DE_MACANAO' },
    { label: 'Tubores', value: 'TUBORES' },
    { label: 'Villalba', value: 'VILLALBA' },
];

export const EMPRESAS = [
    { label: 'Inversiones Angelo, C.A.', value: 'INVERSIONES ANGELO, C.A.' },
    { label: 'Distribuidora Metropol C.A.', value: 'DISTRIBUIDORA METROPOL C.A.' },
    { label: 'Inversiones Malesi, C.A.', value: 'INVERSIONES MALESI, C.A.' },
];

export const ESTADOS_GUIA = [
    { label: 'Nuevo', value: 'NUEVO', severity: 'info' },
    { label: 'En Carga de Mercancía', value: 'EN_CARGA_MERCANCIA', severity: 'warn' },
    { label: 'En Proceso', value: 'EN_PROCESO', severity: 'info' },
    { label: 'En Espera', value: 'EN_ESPERA', severity: 'warn' },
    { label: 'Finalizado', value: 'FINALIZADO', severity: 'success' },
    { label: 'Incidencias', value: 'INCIDENCIAS', severity: 'danger' },
];

export const ESTADOS_POR_ROL: Record<string, string[]> = {
    ANALISTA: ['NUEVO', 'EN_CARGA_MERCANCIA'],
    CHOFER: ['EN_PROCESO', 'EN_ESPERA', 'FINALIZADO', 'INCIDENCIAS'],
    ADMIN: ['NUEVO', 'EN_CARGA_MERCANCIA', 'EN_PROCESO', 'EN_ESPERA', 'FINALIZADO', 'INCIDENCIAS'],
};

export const GUIAS_MOCK: GuiaDespacho[] = [
    {
        id: 'g-1',
        empresa: 'INVERSIONES ANGELO, C.A.',
        numeroGuia: 'G-2026-0001',
        codigoGuia: 'batch/out/001',
        idChofer: 'ch-1',
        nombreChofer: 'Carlos José Martínez',
        cedulaChofer: 'V-12345678',
        idVehiculo: '1',
        placaVehiculo: 'AB123CD',
        camion: '[AB123CD] Toyota Hilux',
        municipio: 'MARINO',
        estado: 'FINALIZADO',
        pdfFuente: 'MANUAL',
        fechaCreacion: '2026-06-01',
        eventos: [],
        facturas: [
            {
                id: 'fact-1',
                numeroFactura: 'FAC-001',
                idCliente: 'cli-1',
                nombreCliente: 'Distribuidora Los Andes C.A.',
                rifCliente: 'J-123456789',
                telefono: '0295-1234567',
                direccion: 'Av. Principal, Edif. Los Andes, Piso 1',
                totalUSD: 1250.0,
                totalVES: 45000.0,
                prioridad: 'Alta',
            },
        ],
    },
    {
        id: 'g-2',
        empresa: 'DISTRIBUIDORA METROPOL C.A.',
        numeroGuia: 'G-2026-0002',
        idChofer: 'ch-2',
        nombreChofer: 'Luis Alberto Rodríguez',
        cedulaChofer: 'V-23456789',
        idVehiculo: '2',
        placaVehiculo: 'EF456GH',
        municipio: 'MANEIRO',
        estado: 'EN_CARGA_MERCANCIA',
        pdfFuente: 'MANUAL',
        fechaCreacion: '2026-06-03',
        eventos: [],
        facturas: [
            {
                id: 'fact-2',
                numeroFactura: 'FAC-002',
                idCliente: 'cli-2',
                nombreCliente: 'Comercial El Ávila S.R.L.',
                rifCliente: 'V-987654321',
                telefono: '0295-7654321',
                direccion: 'Calle Sucre, Local 3-A',
                totalUSD: 2340.0,
                totalVES: 85000.0,
                prioridad: 'Media',
            },
        ],
    },
    {
        id: 'g-3',
        empresa: 'INVERSIONES MALESI, C.A.',
        numeroGuia: 'G-2026-0003',
        idChofer: 'ch-1',
        nombreChofer: 'Carlos José Martínez',
        cedulaChofer: 'V-12345678',
        idVehiculo: '1',
        placaVehiculo: 'AB123CD',
        municipio: 'MANEIRO',
        estado: 'NUEVO',
        pdfFuente: 'MANUAL',
        fechaCreacion: '2026-06-04',
        eventos: [],
        facturas: [],
    },
    {
        id: 'g-4',
        empresa: 'INVERSIONES ANGELO, C.A.',
        numeroGuia: 'G-2026-0004',
        idChofer: 'ch-3',
        nombreChofer: 'Pedro Antonio Gómez',
        cedulaChofer: 'V-34567890',
        idVehiculo: '4',
        placaVehiculo: 'XY012ZZ',
        municipio: 'MARINO',
        estado: 'INCIDENCIAS',
        pdfFuente: 'PDF',
        fechaCreacion: '2026-05-28',
        eventos: [],
        facturas: [
            {
                id: 'fact-4',
                numeroFactura: 'FAC-004',
                idCliente: 'cli-4',
                nombreCliente: 'Ferretería El Martillo',
                rifCliente: 'V-112233445',
                telefono: '0295-3322114',
                direccion: 'Av. Principal de Pampatar, Local 2',
                totalUSD: 3200.0,
                totalVES: 115000.0,
                prioridad: 'Baja',
                reglasRecepcion: {
                    diasRecepcion: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
                    requiereCita: false,
                    instrucciones: '',
                },
            },
        ],
    },
    {
        id: 'g-5',
        empresa: 'DISTRIBUIDORA METROPOL C.A.',
        numeroGuia: 'G-2026-0005',
        idChofer: 'ch-4',
        nombreChofer: 'José Gregorio Blanco',
        cedulaChofer: 'V-45678901',
        idVehiculo: '3',
        placaVehiculo: 'JK789LM',
        municipio: 'ARISMENDI',
        estado: 'EN_PROCESO',
        pdfFuente: 'MANUAL',
        fechaCreacion: '2026-06-05',
        eventos: [],
        facturas: [],
    },
];

export const RUTAS_MOCK: Ruta[] = [
    {
        id: 'r-1',
        codigo: 'R-2026-001',
        idChofer: 'ch-1',
        nombreChofer: 'Carlos José Martínez',
        idVehiculo: '1',
        placaVehiculo: 'AB123CD',
        fechaAsignacion: '2026-06-01',
        idsGuias: ['g-1', 'g-3'],
        estado: 'FINALIZADA',
    },
    {
        id: 'r-2',
        codigo: 'R-2026-002',
        idChofer: 'ch-2',
        nombreChofer: 'Luis Alberto Rodríguez',
        idVehiculo: '2',
        placaVehiculo: 'EF456GH',
        fechaAsignacion: '2026-06-03',
        idsGuias: ['g-2'],
        estado: 'ACTIVA',
    },
];
