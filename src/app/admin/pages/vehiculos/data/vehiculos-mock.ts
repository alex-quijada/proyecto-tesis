export interface Seguro {
    poliza: string;
    empresa: string;
    tipoCobertura: string;
    fechaVencimiento: string;
}

export interface DocumentoLegal {
    numeroRegistro: string;
    numeroContrato?: string;
    empresaContrato?: string;
    vencimientoContrato?: string;
    revisionTecnicaNumero?: string;
    revisionTecnicaVencimiento?: string;
}

export interface Vehiculo {
    id?: string;
    placa?: string;
    marca?: string;
    modelo?: string;
    anio?: number;
    imagen?: string;
    tipo?: 'CARRO' | 'MOTO' | 'CAMION';
    capacidadPallets?: number;
    tipoCaja?: 'SECA' | 'PLATAFORMA' | 'REFRIGERADO' | 'ARTICULADO';
    pesoMaximo?: number;
    estado?: 'OPERATIVO' | 'MANTENIMIENTO' | 'INACTIVO';
    seguro?: Seguro;
    documentosLegales?: DocumentoLegal;
}

export const TIPOS_COBERTURA = [
    { label: 'Responsabilidad Civil', value: 'RC' },
    { label: 'Cobertura Amplia', value: 'AMPLIA' },
    { label: 'Terceros', value: 'TERCEROS' },
    { label: 'Todo Riesgo', value: 'TODO_RIESGO' },
];

export const VEHICULOS_MOCK: Vehiculo[] = [
    {
        id: '1', placa: 'AB123CD', marca: 'Toyota', modelo: 'Hilux', anio: 2022, tipo: 'CARRO',
        capacidadPallets: 1, tipoCaja: 'SECA', pesoMaximo: 800, estado: 'OPERATIVO',
        seguro: { poliza: 'POL-001-2025', empresa: 'Seguros La Previsora', tipoCobertura: 'AMPLIA', fechaVencimiento: '2026-08-15' },
        documentosLegales: { numeroRegistro: 'REG-ABCD-2022', revisionTecnicaNumero: 'RT-2025-1234', revisionTecnicaVencimiento: '2026-12-31' },
    },
    {
        id: '2', placa: 'EF456GH', marca: 'Chevrolet', modelo: 'NPR Cava', anio: 2019, tipo: 'CAMION',
        capacidadPallets: 6, tipoCaja: 'REFRIGERADO', pesoMaximo: 4500, estado: 'MANTENIMIENTO',
        seguro: { poliza: 'POL-002-2025', empresa: 'Mercantil Seguros', tipoCobertura: 'TODO_RIESGO', fechaVencimiento: '2026-03-20' },
        documentosLegales: { numeroRegistro: 'REG-EFGH-2019', numeroContrato: 'CT-001-2024', empresaContrato: 'Leasing Venezuela C.A.', vencimientoContrato: '2027-06-30', revisionTecnicaNumero: 'RT-2025-5678', revisionTecnicaVencimiento: '2026-06-30' },
    },
    {
        id: '3', placa: 'JK789LM', marca: 'Suzuki', modelo: 'GN125', anio: 2023, tipo: 'MOTO',
        capacidadPallets: 0, tipoCaja: 'SECA', pesoMaximo: 120, estado: 'OPERATIVO',
        seguro: { poliza: 'POL-003-2025', empresa: 'Seguros Caracas', tipoCobertura: 'RC', fechaVencimiento: '2026-11-01' },
        documentosLegales: { numeroRegistro: 'REG-JKLM-2023', revisionTecnicaNumero: 'RT-2025-9012', revisionTecnicaVencimiento: '2027-03-15' },
    },
    {
        id: '4', placa: 'XY012ZZ', marca: 'Iveco', modelo: 'Stralis', anio: 2015, tipo: 'CAMION',
        capacidadPallets: 14, tipoCaja: 'ARTICULADO', pesoMaximo: 18000, estado: 'INACTIVO',
        seguro: { poliza: 'POL-004-2024', empresa: 'Seguros La Previsora', tipoCobertura: 'TODO_RIESGO', fechaVencimiento: '2026-01-10' },
        documentosLegales: { numeroRegistro: 'REG-XYZZ-2015', revisionTecnicaNumero: 'RT-2024-3456', revisionTecnicaVencimiento: '2025-12-31' },
    },
];
