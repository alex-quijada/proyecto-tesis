export interface DocumentoIdentidad {
    prefijo: 'V' | 'E' | 'J' | 'P' | 'G';
    numero: string;
}

export interface Cliente {
    id?: string;
    documentoIdentidad?: DocumentoIdentidad;
    nombreComercial?: string;
    telefono?: string;
    idPrioridad?: string;
    prioridad?: string;
    ubicaciones?: UbicacionResumen[];
}

export interface UbicacionResumen {
    id?: string;
    direccion?: string;
    municipio?: string;
    referencia?: string;
    pais?: string;
    estado?: string;
}

export interface PrioridadCliente {
    label: string;
    value: string;
}

export interface MunicipioItem {
    label: string;
    capital: string;
    value: string;
}

export const PREFIJOS_DOCUMENTO = [
    { label: 'V - Venezolano', value: 'V' },
    { label: 'E - Extranjero', value: 'E' },
    { label: 'J - Jurídico / Comercio', value: 'J' },
    { label: 'P - Pasaporte', value: 'P' },
    { label: 'G - Gobierno', value: 'G' },
];

export const PRIORIDADES_MOCK: PrioridadCliente[] = [
    { label: 'Alta', value: 'ALTA' },
    { label: 'Media', value: 'MEDIA' },
    { label: 'Baja', value: 'BAJA' },
];

export const MUNICIPIOS_NUEVA_ESPARTA: MunicipioItem[] = [
    { label: 'Antolín del Campo', capital: 'Paraguachí', value: 'ANTOLIN_DEL_CAMPO' },
    { label: 'Arismendi', capital: 'La Asunción', value: 'ARISMENDI' },
    { label: 'Díaz', capital: 'San Juan Bautista', value: 'DIAZ' },
    { label: 'García', capital: 'El Valle del Espíritu Santo', value: 'GARCIA' },
    { label: 'Gómez', capital: 'Santa Ana', value: 'GOMEZ' },
    { label: 'Maneiro', capital: 'Pampatar', value: 'MANEIRO' },
    { label: 'Marcano', capital: 'Juan Griego', value: 'MARCANO' },
    { label: 'Mariño', capital: 'Porlamar', value: 'MARINO' },
    { label: 'Península de Macanao', capital: 'Boca de Río', value: 'PENINSULA_DE_MACANAO' },
    { label: 'Tubores', capital: 'Punta de Piedras', value: 'TUBORES' },
    { label: 'Villalba', capital: 'San Pedro de Coche', value: 'VILLALBA' },
];

export const CLIENTES_MOCK: Cliente[] = [
    {
        id: 'cli-1',
        documentoIdentidad: { prefijo: 'J', numero: '123456789' },
        nombreComercial: 'Distribuidora Polar C.A.',
        telefono: '0414-1234567',
        idPrioridad: 'ALTA',
        prioridad: 'Alta',
        ubicaciones: [
            {
                id: 'ub-1',
                direccion: 'Av. Principal, CC Sambil, Piso 2',
                municipio: 'MARINO',
                pais: 'Venezuela',
                estado: 'Nueva Esparta',
            },
        ],
    },
    {
        id: 'cli-2',
        documentoIdentidad: { prefijo: 'J', numero: '987654321' },
        nombreComercial: 'Cervecería Regional C.A.',
        telefono: '0295-1234567',
        idPrioridad: 'ALTA',
        prioridad: 'Alta',
        ubicaciones: [
            {
                id: 'ub-2',
                direccion: 'Zona Industrial, Calle 5',
                municipio: 'MANEIRO',
                pais: 'Venezuela',
                estado: 'Nueva Esparta',
            },
            {
                id: 'ub-3',
                direccion: 'Av. Bolívar, Edif. Regional',
                municipio: 'MARINO',
                pais: 'Venezuela',
                estado: 'Nueva Esparta',
            },
        ],
    },
    {
        id: 'cli-3',
        documentoIdentidad: { prefijo: 'V', numero: '12345678' },
        nombreComercial: 'Supermercado Central Madeirense',
        telefono: '0416-7890123',
        idPrioridad: 'MEDIA',
        prioridad: 'Media',
        ubicaciones: [
            {
                id: 'ub-4',
                direccion: 'CC Costa Azul, Nivel PB',
                municipio: 'MANEIRO',
                pais: 'Venezuela',
                estado: 'Nueva Esparta',
            },
        ],
    },
    {
        id: 'cli-4',
        documentoIdentidad: { prefijo: 'J', numero: '456789123' },
        nombreComercial: 'Farmatodo S.A.',
        telefono: '0295-9876543',
        idPrioridad: 'MEDIA',
        prioridad: 'Media',
        ubicaciones: [
            {
                id: 'ub-5',
                direccion: 'Av. Las Américas, CC Sigo',
                municipio: 'MARINO',
                pais: 'Venezuela',
                estado: 'Nueva Esparta',
            },
        ],
    },
    {
        id: 'cli-5',
        documentoIdentidad: { prefijo: 'V', numero: '87654321' },
        nombreComercial: "Automercado Plaza's",
        telefono: '0412-3456789',
        idPrioridad: 'BAJA',
        prioridad: 'Baja',
        ubicaciones: [
            {
                id: 'ub-6',
                direccion: 'Calle 4, Sector Bella Vista',
                municipio: 'ARISMENDI',
                pais: 'Venezuela',
                estado: 'Nueva Esparta',
            },
        ],
    },
];
