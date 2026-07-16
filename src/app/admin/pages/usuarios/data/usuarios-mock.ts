import { SucursalCliente } from '../../clientes/clientes.types';
export type { SucursalCliente };

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
    sucursales?: SucursalCliente[];
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
