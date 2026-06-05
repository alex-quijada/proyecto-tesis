export interface Mantenimiento {
    id?: string;
    idVehiculo?: string;
    placaVehiculo?: string;
    vehiculoDesc?: string;
    tipo: 'PREVENTIVO' | 'CORRECTIVO';
    fechaProgramada: string;
    fechaRealizado?: string;
    kilometraje: number;
    descripcion: string;
    responsable: string;
    costo: number;
    proximoKm: number;
    proximaFecha?: string;
    estado: 'PROGRAMADO' | 'EN_PROCESO' | 'REALIZADO' | 'CANCELADO';
}

export const TIPOS_MANTENIMIENTO = [
    { label: 'Preventivo', value: 'PREVENTIVO' },
    { label: 'Correctivo', value: 'CORRECTIVO' },
];

export const ESTADOS_MANTENIMIENTO = [
    { label: 'Programado', value: 'PROGRAMADO' },
    { label: 'En Proceso', value: 'EN_PROCESO' },
    { label: 'Realizado', value: 'REALIZADO' },
    { label: 'Cancelado', value: 'CANCELADO' },
];

export const MANTENIMIENTOS_MOCK: Mantenimiento[] = [
    {
        id: 'mtto-1',
        idVehiculo: '2',
        placaVehiculo: 'EF456GH',
        vehiculoDesc: 'Chevrolet NPR Cava (2019)',
        tipo: 'PREVENTIVO',
        fechaProgramada: '2026-06-15',
        fechaRealizado: '2026-06-14',
        kilometraje: 45800,
        descripcion: 'Cambio de aceite, filtros y revisión general del sistema de frenos.',
        responsable: 'Luis Méndez',
        costo: 120.00,
        proximoKm: 50000,
        proximaFecha: '2026-09-14',
        estado: 'REALIZADO',
    },
    {
        id: 'mtto-2',
        idVehiculo: '1',
        placaVehiculo: 'AB123CD',
        vehiculoDesc: 'Toyota Hilux (2022)',
        tipo: 'PREVENTIVO',
        fechaProgramada: '2026-07-01',
        kilometraje: 22300,
        descripcion: 'Rotación de neumáticos, alineación y balanceo, revisión de suspensión.',
        responsable: 'Carlos Rivas',
        costo: 85.00,
        proximoKm: 27000,
        proximaFecha: '2026-10-01',
        estado: 'PROGRAMADO',
    },
    {
        id: 'mtto-3',
        idVehiculo: '4',
        placaVehiculo: 'XY012ZZ',
        vehiculoDesc: 'Iveco Stralis (2015)',
        tipo: 'CORRECTIVO',
        fechaProgramada: '2026-05-28',
        fechaRealizado: '2026-05-28',
        kilometraje: 189200,
        descripcion: 'Reparación de sistema de embrague. Reemplazo de disco y plato de presión.',
        responsable: 'Taller Mecánica Pesada C.A.',
        costo: 450.00,
        proximoKm: 193000,
        estado: 'REALIZADO',
    },
    {
        id: 'mtto-4',
        idVehiculo: '1',
        placaVehiculo: 'AB123CD',
        vehiculoDesc: 'Toyota Hilux (2022)',
        tipo: 'PREVENTIVO',
        fechaProgramada: '2026-07-20',
        kilometraje: 22500,
        descripcion: 'Cambio de aceite de motor, revisión de niveles y presión de neumáticos.',
        responsable: 'Carlos Rivas',
        costo: 60.00,
        proximoKm: 27500,
        proximaFecha: '2026-10-20',
        estado: 'EN_PROCESO',
    },
    {
        id: 'mtto-5',
        idVehiculo: '3',
        placaVehiculo: 'JK789LM',
        vehiculoDesc: 'Suzuki GN125 (2023)',
        tipo: 'PREVENTIVO',
        fechaProgramada: '2026-06-05',
        kilometraje: 8900,
        descripcion: 'Engrase de cadena, revisión de frenos y cambio de bujía.',
        responsable: 'Pedro Acevedo',
        costo: 25.00,
        proximoKm: 10000,
        proximaFecha: '2026-08-05',
        estado: 'PROGRAMADO',
    },
];
