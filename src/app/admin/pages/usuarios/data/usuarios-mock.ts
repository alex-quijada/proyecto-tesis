import { UbicacionResumen } from '../../clientes/data/clientes-mock';
export type { UbicacionResumen };

export interface DocumentoIdentidad {
    prefijo: 'V' | 'E' | 'J' | 'P' | 'G';
    numero: string;
}

export interface LicenciaConducir {
    numero: string;
    grado: string;
    fechaVencimiento: string;
}

export interface CertificadoMedico {
    numero: string;
    fechaExpedicion: string;
    fechaVencimiento: string;
}

export interface Usuario {
    id?: string;
    username: string;
    email: string;
    password?: string;
    documentoIdentidad: DocumentoIdentidad;
    nombreCompleto: string;
    telefono: string;
    rol: 'ADMIN' | 'ANALISTA' | 'CHOFER' | 'AYUDANTE' | 'CLIENTE';
    activo: boolean;
    fechaCreacion: string;
    ultimoAcceso?: string;
    fechaIngreso?: string;
    licencia?: LicenciaConducir;
    certificadoMedico?: CertificadoMedico;
    nombreComercial?: string;
    idPrioridad?: string;
    prioridad?: string;
    ubicaciones?: UbicacionResumen[];
}

export const ROLES = [
    { label: 'Administrador', value: 'ADMIN', icon: 'pi pi-shield' },
    { label: 'Analista', value: 'ANALISTA', icon: 'pi pi-search-plus' },
    { label: 'Chofer', value: 'CHOFER', icon: 'pi pi-id-card' },
    { label: 'Ayudante', value: 'AYUDANTE', icon: 'pi pi-user' },
    { label: 'Cliente', value: 'CLIENTE', icon: 'pi pi-users' },
];

export const PREFIJOS_DOCUMENTO = [
    { label: 'V - Venezolano', value: 'V' },
    { label: 'E - Extranjero', value: 'E' },
    { label: 'J - Jurídico / Comercio', value: 'J' },
    { label: 'P - Pasaporte', value: 'P' },
    { label: 'G - Gobierno', value: 'G' },
];

export const GRADOS_LICENCIA = [
    { label: '2do Grado - Motos y vehículos livianos', value: '2da' },
    { label: '3er Grado - Automóvil (hasta 3500kg)', value: '3ra' },
    { label: '4to Grado - Transporte público / Carga', value: '4ta' },
    { label: '5to Grado - Articulados / Remolques', value: '5ta' },
];

export const PRIORIDADES = [
    { label: 'Alta', value: 'ALTA' },
    { label: 'Media', value: 'MEDIA' },
    { label: 'Baja', value: 'BAJA' },
];

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

export const USUARIOS_MOCK: Usuario[] = [
    {
        id: 'usr-1', username: 'admin01', email: 'admin@logistica.com',
        documentoIdentidad: { prefijo: 'V', numero: '10123456' },
        nombreCompleto: 'Ricardo José Mendoza', telefono: '0414-1112233',
        rol: 'ADMIN', activo: true, fechaCreacion: '2024-01-01', ultimoAcceso: '2026-06-04',
    },
    {
        id: 'usr-2', username: 'analista01', email: 'analista@logistica.com',
        documentoIdentidad: { prefijo: 'V', numero: '15123456' },
        nombreCompleto: 'María Fernanda López', telefono: '0416-2223344',
        rol: 'ANALISTA', activo: true, fechaCreacion: '2024-03-15', ultimoAcceso: '2026-06-04',
    },
    {
        id: 'usr-3', username: 'analista02', email: 'pedro.r@logistica.com',
        documentoIdentidad: { prefijo: 'V', numero: '16123456' },
        nombreCompleto: 'Pedro José Rivas', telefono: '0424-3334455',
        rol: 'ANALISTA', activo: true, fechaCreacion: '2024-06-01', ultimoAcceso: '2026-06-03',
    },
    {
        id: 'ch-1', username: 'cmartinez', email: 'carlos.m@logistica.com',
        password: 'ch-1',
        documentoIdentidad: { prefijo: 'V', numero: '12345678' },
        nombreCompleto: 'Carlos José Martínez', telefono: '0414-1234567',
        rol: 'CHOFER', activo: true, fechaCreacion: '2024-01-15', fechaIngreso: '2024-01-15',
        licencia: { numero: 'L-12345678', grado: 'D', fechaVencimiento: '2026-06-30' },
        certificadoMedico: { numero: 'CMV-987654', fechaExpedicion: '2025-01-10', fechaVencimiento: '2026-01-10' },
    },
    {
        id: 'ch-2', username: 'lrodriguez', email: 'luis.r@logistica.com',
        password: 'ch-2',
        documentoIdentidad: { prefijo: 'V', numero: '23456789' },
        nombreCompleto: 'Luis Alberto Rodríguez', telefono: '0424-9876543',
        rol: 'CHOFER', activo: true, fechaCreacion: '2023-08-20', fechaIngreso: '2023-08-20',
        licencia: { numero: 'L-23456789', grado: 'E', fechaVencimiento: '2025-12-31' },
        certificadoMedico: { numero: 'CMV-876543', fechaExpedicion: '2025-03-15', fechaVencimiento: '2026-03-15' },
    },
    {
        id: 'ch-3', username: 'pgomez', email: 'pedro.g@logistica.com',
        password: 'ch-3',
        documentoIdentidad: { prefijo: 'V', numero: '34567890' },
        nombreCompleto: 'Pedro Antonio Gómez', telefono: '0416-5551212',
        rol: 'CHOFER', activo: true, fechaCreacion: '2024-05-10', fechaIngreso: '2024-05-10',
        licencia: { numero: 'L-34567890', grado: 'D', fechaVencimiento: '2027-02-28' },
        certificadoMedico: { numero: 'CMV-765432', fechaExpedicion: '2025-06-01', fechaVencimiento: '2026-06-01' },
    },
    {
        id: 'ch-4', username: 'jblanco', email: 'jose.b@logistica.com',
        password: 'ch-4',
        documentoIdentidad: { prefijo: 'V', numero: '45678901' },
        nombreCompleto: 'José Gregorio Blanco', telefono: '0426-1112233',
        rol: 'AYUDANTE', activo: true, fechaCreacion: '2025-02-01', fechaIngreso: '2025-02-01',
        licencia: { numero: 'L-45678901', grado: 'B', fechaVencimiento: '2026-09-15' },
        certificadoMedico: { numero: 'CMV-654321', fechaExpedicion: '2025-04-20', fechaVencimiento: '2026-04-20' },
    },
    {
        id: 'ch-5', username: 'jpereira', email: 'juan.p@logistica.com',
        password: 'ch-5',
        documentoIdentidad: { prefijo: 'E', numero: '87654321' },
        nombreCompleto: 'Juan Carlos Pereira', telefono: '0412-9988776',
        rol: 'AYUDANTE', activo: true, fechaCreacion: '2024-11-12', fechaIngreso: '2024-11-12',
        licencia: { numero: 'L-87654321', grado: 'B', fechaVencimiento: '2025-11-30' },
        certificadoMedico: { numero: 'CMV-543210', fechaExpedicion: '2024-12-01', fechaVencimiento: '2025-12-01' },
    },
    {
        id: 'cli-1', username: 'polarca', email: 'contacto@distribuidorapolar.com',
        password: 'cli-1',
        documentoIdentidad: { prefijo: 'J', numero: '123456789' },
        nombreCompleto: 'Distribuidora Polar C.A.', telefono: '0414-1234567',
        rol: 'CLIENTE', activo: true, fechaCreacion: '2024-02-01',
        nombreComercial: 'Distribuidora Polar C.A.',
        idPrioridad: 'ALTA', prioridad: 'Alta',
        ubicaciones: [
            { id: 'ub-1', direccion: 'Av. Principal, CC Sambil, Piso 2', municipio: 'MARINO', pais: 'Venezuela', estado: 'Nueva Esparta' },
        ],
    },
    {
        id: 'cli-2', username: 'regionalca', email: 'contacto@cerveceriaregional.com',
        password: 'cli-2',
        documentoIdentidad: { prefijo: 'J', numero: '987654321' },
        nombreCompleto: 'Cervecería Regional C.A.', telefono: '0295-1234567',
        rol: 'CLIENTE', activo: true, fechaCreacion: '2024-02-15',
        nombreComercial: 'Cervecería Regional C.A.',
        idPrioridad: 'ALTA', prioridad: 'Alta',
        ubicaciones: [
            { id: 'ub-2', direccion: 'Zona Industrial, Calle 5', municipio: 'MANEIRO', pais: 'Venezuela', estado: 'Nueva Esparta' },
            { id: 'ub-3', direccion: 'Av. Bolívar, Edif. Regional', municipio: 'MARINO', pais: 'Venezuela', estado: 'Nueva Esparta' },
        ],
    },
    {
        id: 'cli-3', username: 'madeirense', email: 'contacto@centralmadeirense.com',
        password: 'cli-3',
        documentoIdentidad: { prefijo: 'V', numero: '12345678' },
        nombreCompleto: 'Supermercado Central Madeirense', telefono: '0416-7890123',
        rol: 'CLIENTE', activo: true, fechaCreacion: '2024-03-01',
        nombreComercial: 'Supermercado Central Madeirense',
        idPrioridad: 'MEDIA', prioridad: 'Media',
        ubicaciones: [
            { id: 'ub-4', direccion: 'CC Costa Azul, Nivel PB', municipio: 'MANEIRO', pais: 'Venezuela', estado: 'Nueva Esparta' },
        ],
    },
    {
        id: 'cli-4', username: 'farmatodo', email: 'contacto@farmatodo.com',
        password: 'cli-4',
        documentoIdentidad: { prefijo: 'J', numero: '456789123' },
        nombreCompleto: 'Farmatodo S.A.', telefono: '0295-9876543',
        rol: 'CLIENTE', activo: true, fechaCreacion: '2024-04-01',
        nombreComercial: 'Farmatodo S.A.',
        idPrioridad: 'MEDIA', prioridad: 'Media',
        ubicaciones: [
            { id: 'ub-5', direccion: 'Av. Las Américas, CC Sigo', municipio: 'MARINO', pais: 'Venezuela', estado: 'Nueva Esparta' },
        ],
    },
    {
        id: 'cli-5', username: 'plazas', email: 'contacto@automercadoplazas.com',
        password: 'cli-5',
        documentoIdentidad: { prefijo: 'V', numero: '87654321' },
        nombreCompleto: "Automercado Plaza's", telefono: '0412-3456789',
        rol: 'CLIENTE', activo: false, fechaCreacion: '2024-05-01',
        nombreComercial: "Automercado Plaza's",
        idPrioridad: 'BAJA', prioridad: 'Baja',
        ubicaciones: [
            { id: 'ub-6', direccion: 'Calle 4, Sector Bella Vista', municipio: 'ARISMENDI', pais: 'Venezuela', estado: 'Nueva Esparta' },
        ],
    },
];
