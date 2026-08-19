export interface ReglasRecepcion {
    horaDesde?: string;
    horaHasta?: string;
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
    sucursalLat?: number;
    sucursalLng?: number;
    totalUSD: number;
    totalVES: number;
    prioridad: string;
    reglasRecepcion?: ReglasRecepcion;
    idEstado: string;
    /** Tipo de la última incidencia de la factura (si tiene). */
    incidenciaTipo?: string;
    incidenciaDescripcion?: string;
    incidenciaFoto?: string;
    incidenciaFecha?: string;
    /** Flag de la última incidencia: decidido por el staff en la BD. */
    incidenciaRecuperable?: boolean;
    incidenciaId?: string;
    /** Ventana de recepción de la sucursal (HH:MM:SS). */
    horaDesde?: string | null;
    horaHasta?: string | null;
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
    idAyudante?: string;
    nombreAyudante?: string;
    idVehiculo: string;
    placaVehiculo: string;
    camion?: string;
    municipio: string;
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
    { label: 'Antolín del Campo', value: 'ca688dbd-e098-437f-a4dd-950d8e22715c' },
    { label: 'Arismendi', value: 'b296c432-4c47-4251-a38d-e8ac3cdafb63' },
    { label: 'Díaz', value: '3b568ab8-1fc3-46ae-99b3-43d58fb4c4ad' },
    { label: 'García', value: '66f23356-6246-4c01-a6da-b7c59326c8f9' },
    { label: 'Gómez', value: '020bff72-e966-4356-9664-e860ea9c1e41' },
    { label: 'Maneiro', value: 'a1f6d9e1-d999-4e04-a1b0-f80a32e072d3' },
    { label: 'Marcano', value: 'bdc8027f-3d0f-4ec0-b4c3-45ca8637d6db' },
    { label: 'Mariño', value: 'd1b9ed3e-d2d9-420e-9158-d01e35e79784' },
    { label: 'Península de Macanao', value: 'dd76c370-a034-4fef-8046-7782b41832b1' },
    { label: 'Tubores', value: '40844c65-3bee-4d1f-a87e-588652a8cb82' },
    { label: 'Villalba', value: '1d380be4-9b76-4230-a83c-67c796d6215c' },
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
    { label: 'Entregando', value: 'ENTREGANDO', severity: 'info' },
    { label: 'Finalizado', value: 'FINALIZADO', severity: 'success' },
    { label: 'Incidencias', value: 'INCIDENCIAS', severity: 'danger' },
];

export const ESTADOS_FACTURA = [
    { label: 'Nuevo', value: 'nuevo', severity: 'info' },
    { label: 'Embarque', value: 'embarque', severity: 'warn' },
    { label: 'En Proceso', value: 'proceso', severity: 'info' },
    { label: 'En Espera', value: 'espera', severity: 'warn' },
    { label: 'Entregando', value: 'entrega', severity: 'info' },
    { label: 'Incidencia', value: 'incidencia', severity: 'danger' },
    { label: 'Finalizado', value: 'finalizado', severity: 'success' },
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
                idEstado: 'finalizado',
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
                idEstado: 'nuevo',
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
                idEstado: 'incidencia',
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
