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
    numeroGuia: string;
    idRuta?: string;
    idCliente: string;
    nombreCliente: string;
    rifCliente: string;
    idChofer: string;
    nombreChofer: string;
    idVehiculo: string;
    placaVehiculo: string;
    fechaCreacion: string;
    fechaCarga?: string;
    fechaSalida?: string;
    fechaLlegadaCliente?: string;
    fechaRegreso?: string;
    municipio: string;
    direccionEntrega: string;
    precioCarga: number;
    pesoKg: number;
    estado: 'EN_PROCESO' | 'CARGADO' | 'EN_ESPERA' | 'FINALIZADO';
    tuvoDevolucion: boolean;
    observaciones?: string;
    pdfFuente: 'MANUAL' | 'PDF';
    eventos: EventoGuia[];
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

export const ESTADOS_GUIA = [
    { label: 'En Proceso', value: 'EN_PROCESO', severity: 'info' },
    { label: 'Cargado', value: 'CARGADO', severity: 'warn' },
    { label: 'En Espera', value: 'EN_ESPERA', severity: 'warn' },
    { label: 'Finalizado', value: 'FINALIZADO', severity: 'success' },
];

export const GUIAS_MOCK: GuiaDespacho[] = [
    {
        id: 'g-1', numeroGuia: 'G-2026-0001',
        idCliente: 'cli-1', nombreCliente: 'Distribuidora Polar C.A.', rifCliente: 'J-123456789',
        idChofer: 'ch-1', nombreChofer: 'Carlos José Martínez',
        idVehiculo: '1', placaVehiculo: 'AB123CD',
        fechaCreacion: '2026-06-01', fechaCarga: '2026-06-02', fechaSalida: '2026-06-02 08:30',
        fechaLlegadaCliente: '2026-06-02 10:45', fechaRegreso: '2026-06-02 12:00',
        municipio: 'Mariño', direccionEntrega: 'Av. Principal, CC Sambil, Piso 2',
        precioCarga: 1250.00, pesoKg: 850,
        estado: 'FINALIZADO', tuvoDevolucion: false,
        pdfFuente: 'MANUAL',
        eventos: [
            { id: 'ev-1', idGuia: 'g-1', tipo: 'SALIDA', fecha: '2026-06-02 08:30', descripcion: 'Salida desde base', ubicacion: 'Porlamar' },
            { id: 'ev-2', idGuia: 'g-1', tipo: 'LLEGADA_CLIENTE', fecha: '2026-06-02 10:45', descripcion: 'Llegada a cliente', ubicacion: 'CC Sambil' },
            { id: 'ev-3', idGuia: 'g-1', tipo: 'REGRESO_BASE', fecha: '2026-06-02 12:00', descripcion: 'Regreso a base', ubicacion: 'Porlamar' },
        ],
    },
    {
        id: 'g-2', numeroGuia: 'G-2026-0002',
        idCliente: 'cli-2', nombreCliente: 'Cervecería Regional C.A.', rifCliente: 'J-987654321',
        idChofer: 'ch-2', nombreChofer: 'Luis Alberto Rodríguez',
        idVehiculo: '2', placaVehiculo: 'EF456GH',
        fechaCreacion: '2026-06-03', fechaCarga: '2026-06-03',
        fechaSalida: '2026-06-03 09:00',
        municipio: 'Maneiro', direccionEntrega: 'Zona Industrial, Calle 5',
        precioCarga: 2340.00, pesoKg: 1500,
        estado: 'CARGADO', tuvoDevolucion: false,
        pdfFuente: 'MANUAL',
        eventos: [
            { id: 'ev-4', idGuia: 'g-2', tipo: 'SALIDA', fecha: '2026-06-03 09:00', descripcion: 'Salida hacia cliente', ubicacion: 'Porlamar' },
        ],
    },
    {
        id: 'g-3', numeroGuia: 'G-2026-0003',
        idCliente: 'cli-3', nombreCliente: 'Supermercado Central Madeirense', rifCliente: 'V-12345678',
        idChofer: 'ch-1', nombreChofer: 'Carlos José Martínez',
        idVehiculo: '1', placaVehiculo: 'AB123CD',
        fechaCreacion: '2026-06-04',
        municipio: 'Maneiro', direccionEntrega: 'CC Costa Azul, Nivel PB',
        precioCarga: 980.00, pesoKg: 600,
        estado: 'EN_ESPERA', tuvoDevolucion: false,
        pdfFuente: 'MANUAL',
        eventos: [],
    },
    {
        id: 'g-4', numeroGuia: 'G-2026-0004',
        idCliente: 'cli-4', nombreCliente: 'Farmatodo S.A.', rifCliente: 'J-456789123',
        idChofer: 'ch-3', nombreChofer: 'Pedro Antonio Gómez',
        idVehiculo: '4', placaVehiculo: 'XY012ZZ',
        fechaCreacion: '2026-05-28', fechaCarga: '2026-05-29',
        fechaSalida: '2026-05-29 07:00', fechaLlegadaCliente: '2026-05-29 08:15',
        fechaRegreso: '2026-05-29 09:30',
        municipio: 'Mariño', direccionEntrega: 'Av. Las Américas, CC Sigo',
        precioCarga: 3200.00, pesoKg: 2200,
        estado: 'FINALIZADO', tuvoDevolucion: true,
        pdfFuente: 'PDF',
        eventos: [
            { id: 'ev-5', idGuia: 'g-4', tipo: 'SALIDA', fecha: '2026-05-29 07:00', descripcion: 'Salida desde base', ubicacion: 'Porlamar' },
            { id: 'ev-6', idGuia: 'g-4', tipo: 'LLEGADA_CLIENTE', fecha: '2026-05-29 08:15', descripcion: 'Llegada a cliente', ubicacion: 'CC Sigo' },
            { id: 'ev-7', idGuia: 'g-4', tipo: 'DEVOLUCION', fecha: '2026-05-29 08:45', descripcion: 'Devolución parcial: 3 cajas dañadas', ubicacion: 'CC Sigo' },
            { id: 'ev-8', idGuia: 'g-4', tipo: 'REGRESO_BASE', fecha: '2026-05-29 09:30', descripcion: 'Regreso con devolución', ubicacion: 'Porlamar' },
        ],
    },
    {
        id: 'g-5', numeroGuia: 'G-2026-0005',
        idCliente: 'cli-5', nombreCliente: "Automercado Plaza's", rifCliente: 'V-87654321',
        idChofer: 'ch-4', nombreChofer: 'José Gregorio Blanco',
        idVehiculo: '3', placaVehiculo: 'JK789LM',
        fechaCreacion: '2026-06-05',
        municipio: 'Arismendi', direccionEntrega: 'Calle 4, Sector Bella Vista',
        precioCarga: 560.00, pesoKg: 200,
        estado: 'EN_PROCESO', tuvoDevolucion: false,
        pdfFuente: 'MANUAL',
        eventos: [],
    },
];

export const RUTAS_MOCK: Ruta[] = [
    {
        id: 'r-1', codigo: 'R-2026-001',
        idChofer: 'ch-1', nombreChofer: 'Carlos José Martínez',
        idVehiculo: '1', placaVehiculo: 'AB123CD',
        fechaAsignacion: '2026-06-01',
        idsGuias: ['g-1', 'g-3'],
        estado: 'FINALIZADA',
    },
    {
        id: 'r-2', codigo: 'R-2026-002',
        idChofer: 'ch-2', nombreChofer: 'Luis Alberto Rodríguez',
        idVehiculo: '2', placaVehiculo: 'EF456GH',
        fechaAsignacion: '2026-06-03',
        idsGuias: ['g-2'],
        estado: 'ACTIVA',
    },
];
