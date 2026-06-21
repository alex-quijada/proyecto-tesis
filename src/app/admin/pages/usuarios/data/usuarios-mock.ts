import { UbicacionResumen } from '../../clientes/clientes.types';
export type { UbicacionResumen };

export interface DocumentoIdentidad {
    prefijo: 'V' | 'E' | 'J' | 'P' | 'G';
    numero: string;
}

export interface LicenciaConducir {
    numero: string;
    grado: string;
    fechaExpedicion?: string;
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
    rol: 'ADMIN' | 'ANALISTA' | 'CHOFER' | 'AYUDANTE' | 'CLIENTE';
    activo: boolean;
    fechaCreacion: string;
    ultimoAcceso?: string;
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
