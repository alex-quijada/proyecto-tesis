export interface DocumentoIdentidad {
    prefijo: 'V' | 'E';
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

export interface Chofer {
    id?: string;
    email?: string;
    documentoIdentidad?: DocumentoIdentidad;
    nombreCompleto?: string;
    telefono?: string;
    rol?: 'Chofer' | 'Ayudante';
    fechaIngreso?: string;
    licencia?: LicenciaConducir;
    certificadoMedico?: CertificadoMedico;
}

export const GRADOS_LICENCIA = [
    { label: '2do Grado - Motos y vehículos livianos', value: '2da' },
    { label: '3er Grado - Automóvil (hasta 3500kg)', value: '3ra' },
    { label: '4to Grado - Transporte público / Carga', value: '4ta' },
    { label: '5to Grado - Articulados / Remolques', value: '5ta' },
];

export const PREFIJOS_CEDULA = [
    { label: 'V - Venezolano', value: 'V' },
    { label: 'E - Extranjero', value: 'E' },
];

export const CHOFERES_MOCK: Chofer[] = [
    {
        id: 'ch-1',
        documentoIdentidad: { prefijo: 'V', numero: '12345678' },
        nombreCompleto: 'Carlos José Martínez',
        telefono: '0414-1234567',
        rol: 'Chofer',
        fechaIngreso: '2024-01-15',
        licencia: { numero: 'L-12345678', grado: 'D', fechaVencimiento: '2026-06-30' },
        certificadoMedico: {
            numero: 'CMV-987654',
            fechaExpedicion: '2025-01-10',
            fechaVencimiento: '2026-01-10',
        },
    },
    {
        id: 'ch-2',
        documentoIdentidad: { prefijo: 'V', numero: '23456789' },
        nombreCompleto: 'Luis Alberto Rodríguez',
        telefono: '0424-9876543',
        rol: 'Chofer',
        fechaIngreso: '2023-08-20',
        licencia: { numero: 'L-23456789', grado: 'E', fechaVencimiento: '2025-12-31' },
        certificadoMedico: {
            numero: 'CMV-876543',
            fechaExpedicion: '2025-03-15',
            fechaVencimiento: '2026-03-15',
        },
    },
    {
        id: 'ch-3',
        documentoIdentidad: { prefijo: 'V', numero: '34567890' },
        nombreCompleto: 'Pedro Antonio Gómez',
        telefono: '0416-5551212',
        rol: 'Chofer',
        fechaIngreso: '2024-05-10',
        licencia: { numero: 'L-34567890', grado: 'D', fechaVencimiento: '2027-02-28' },
        certificadoMedico: {
            numero: 'CMV-765432',
            fechaExpedicion: '2025-06-01',
            fechaVencimiento: '2026-06-01',
        },
    },
    {
        id: 'ch-4',
        documentoIdentidad: { prefijo: 'V', numero: '45678901' },
        nombreCompleto: 'José Gregorio Blanco',
        telefono: '0426-1112233',
        rol: 'Ayudante',
        fechaIngreso: '2025-02-01',
        licencia: { numero: 'L-45678901', grado: 'B', fechaVencimiento: '2026-09-15' },
        certificadoMedico: {
            numero: 'CMV-654321',
            fechaExpedicion: '2025-04-20',
            fechaVencimiento: '2026-04-20',
        },
    },
    {
        id: 'ch-5',
        documentoIdentidad: { prefijo: 'E', numero: '87654321' },
        nombreCompleto: 'Juan Carlos Pereira',
        telefono: '0412-9988776',
        rol: 'Ayudante',
        fechaIngreso: '2024-11-12',
        licencia: { numero: 'L-87654321', grado: 'B', fechaVencimiento: '2025-11-30' },
        certificadoMedico: {
            numero: 'CMV-543210',
            fechaExpedicion: '2024-12-01',
            fechaVencimiento: '2025-12-01',
        },
    },
];
