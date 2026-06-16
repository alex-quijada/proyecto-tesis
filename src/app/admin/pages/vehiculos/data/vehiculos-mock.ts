export interface Vehiculo {
    id?: string;
    placa?: string;
    marca?: string;
    modelo?: string;
    anio?: number;
    tipo?: 'CARRO' | 'MOTO' | 'CAMION';
    capacidadPallets?: number;
    tipoCaja?: 'SECA' | 'PLATAFORMA' | 'REFRIGERADO' | 'ARTICULADO';
    pesoMaximo?: number;
    estado?: 'OPERATIVO' | 'MANTENIMIENTO' | 'INACTIVO';
}

export const VEHICULOS_MOCK: Vehiculo[] = [
    {
        id: '1', placa: 'AB123CD', marca: 'Toyota', modelo: 'Hilux', anio: 2022, tipo: 'CARRO',
        capacidadPallets: 1, tipoCaja: 'SECA', pesoMaximo: 800, estado: 'OPERATIVO',
    },
    {
        id: '2', placa: 'EF456GH', marca: 'Chevrolet', modelo: 'NPR Cava', anio: 2019, tipo: 'CAMION',
        capacidadPallets: 6, tipoCaja: 'REFRIGERADO', pesoMaximo: 4500, estado: 'MANTENIMIENTO',
    },
    {
        id: '3', placa: 'JK789LM', marca: 'Suzuki', modelo: 'GN125', anio: 2023, tipo: 'MOTO',
        capacidadPallets: 0, tipoCaja: 'SECA', pesoMaximo: 120, estado: 'OPERATIVO',
    },
    {
        id: '4', placa: 'XY012ZZ', marca: 'Iveco', modelo: 'Stralis', anio: 2015, tipo: 'CAMION',
        capacidadPallets: 14, tipoCaja: 'ARTICULADO', pesoMaximo: 18000, estado: 'INACTIVO',
    },
];
