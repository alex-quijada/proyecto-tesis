export interface Vehiculo {
    id_vehiculo?: string;
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
    imagen_url?: string;
}

export const VEHICULOS_MOCK: Vehiculo[] = [
    {
        id: '1',
        placa: 'AB123CD',
        marca: 'Toyota',
        modelo: 'Hilux',
        anio: 2022,
        tipo: 'CARRO',
        capacidadPallets: 1,
        tipoCaja: 'SECA',
        pesoMaximo: 800,
        estado: 'OPERATIVO',
    },
    {
        id: '2',
        placa: 'EF456GH',
        marca: 'Chevrolet',
        modelo: 'NPR Cava',
        anio: 2019,
        tipo: 'CAMION',
        capacidadPallets: 6,
        tipoCaja: 'REFRIGERADO',
        pesoMaximo: 4500,
        estado: 'MANTENIMIENTO',
    },
    {
        id: '3',
        placa: 'JK789LM',
        marca: 'Suzuki',
        modelo: 'GN125',
        anio: 2023,
        tipo: 'MOTO',
        capacidadPallets: 0,
        tipoCaja: 'SECA',
        pesoMaximo: 120,
        estado: 'OPERATIVO',
    },
    {
        id: '4',
        placa: 'XY012ZZ',
        marca: 'Iveco',
        modelo: 'Stralis',
        anio: 2015,
        tipo: 'CAMION',
        capacidadPallets: 14,
        tipoCaja: 'ARTICULADO',
        pesoMaximo: 18000,
        estado: 'INACTIVO',
    },
    {
        id: '5',
        placa: 'A98AE3I',
        marca: 'Mitsubishi',
        modelo: 'CANTER',
        anio: 2020,
        tipo: 'CAMION',
        capacidadPallets: 20,
        tipoCaja: 'PLATAFORMA',
        pesoMaximo: 3500,
        estado: 'OPERATIVO',
    },
    {
        id: '6',
        placa: 'AA260XA',
        marca: 'MERCEDES BENZ',
        modelo: 'SPRINTER',
        anio: 2019,
        tipo: 'CAMION',
        capacidadPallets: 10,
        tipoCaja: 'ARTICULADO',
        pesoMaximo: 0,
        estado: 'INACTIVO',
    },
    {
        id: '7',
        placa: 'A48AR2B',
        marca: 'FORD',
        modelo: 'CARGO 1721',
        anio: 2018,
        tipo: 'CAMION',
        capacidadPallets: 30,
        tipoCaja: 'REFRIGERADO',
        pesoMaximo: 9000,
        estado: 'OPERATIVO',
    },
];