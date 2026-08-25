export interface CargaCombustible {
    id?: string;
    idVehiculo: string;
    placaVehiculo: string;
    vehiculoDesc: string;
    fecha: string;
    tipoCombustible: 'GASOLINA_95' | 'GASOLINA_91' | 'DIESEL';
    metodoCalculo: 'TANQUE' | 'ODOMETRO' | 'GPS';
    kilometraje?: number;
    nivelTanqueAntes: number;
    nivelTanqueDespues: number;
    litrosCargados: number;
    costoPorLitro: number;
    costoTotal: number;
    costoTotalBss?: number;
    estacionServicio?: string;
    observaciones?: string;
}

export interface VehiculoResumen {
    id: string;
    placa: string;
    label: string;
    capacidadTanque: number;
}

export const TIPOS_COMBUSTIBLE = [
    { label: 'Gasolina 95 Octanos', value: 'GASOLINA_95' },
    { label: 'Gasolina 91 Octanos', value: 'GASOLINA_91' },
    { label: 'Diésel', value: 'DIESEL' },
];

export const METODOS_CALCULO = [
    {
        label: 'Por Tanque (visual)',
        value: 'TANQUE',
        desc: 'Calcula según nivel del tanque antes/después',
    },
    { label: 'Por Odómetro', value: 'ODOMETRO', desc: 'Calcula según kilometraje recorrido' },
    { label: 'Por GPS', value: 'GPS', desc: 'Integración con GPS (próximamente)' },
];

export const NIVELES_TANQUE = [
    { label: 'Vacío (0%)', value: 0 },
    { label: '1/4 (25%)', value: 0.25 },
    { label: '1/2 (50%)', value: 0.5 },
    { label: '3/4 (75%)', value: 0.75 },
    { label: 'Lleno (100%)', value: 1 },
];

export const VEHICULOS_TANQUE: VehiculoResumen[] = [
    { id: '1', placa: 'AB123CD', label: 'Toyota Hilux (2022)', capacidadTanque: 80 },
    { id: '2', placa: 'EF456GH', label: 'Chevrolet NPR Cava (2019)', capacidadTanque: 100 },
    { id: '3', placa: 'JK789LM', label: 'Suzuki GN125 (2023)', capacidadTanque: 12 },
    { id: '4', placa: 'XY012ZZ', label: 'Iveco Stralis (2015)', capacidadTanque: 400 },
];

export const COMBUSTIBLE_MOCK: CargaCombustible[] = [
    {
        id: 'fuel-1',
        idVehiculo: '1',
        placaVehiculo: 'AB123CD',
        vehiculoDesc: 'Toyota Hilux (2022)',
        fecha: '2026-05-10',
        tipoCombustible: 'GASOLINA_95',
        metodoCalculo: 'TANQUE',
        kilometraje: 22000,
        nivelTanqueAntes: 0.25,
        nivelTanqueDespues: 1,
        litrosCargados: 60,
        costoPorLitro: 0.5,
        costoTotal: 30.0,
        estacionServicio: 'PDV La Asunción',
    },
    {
        id: 'fuel-2',
        idVehiculo: '1',
        placaVehiculo: 'AB123CD',
        vehiculoDesc: 'Toyota Hilux (2022)',
        fecha: '2026-05-25',
        tipoCombustible: 'GASOLINA_95',
        metodoCalculo: 'TANQUE',
        kilometraje: 22450,
        nivelTanqueAntes: 0.25,
        nivelTanqueDespues: 1,
        litrosCargados: 60,
        costoPorLitro: 0.5,
        costoTotal: 30.0,
        estacionServicio: 'PDV Porlamar',
    },
    {
        id: 'fuel-3',
        idVehiculo: '2',
        placaVehiculo: 'EF456GH',
        vehiculoDesc: 'Chevrolet NPR Cava (2019)',
        fecha: '2026-05-20',
        tipoCombustible: 'DIESEL',
        metodoCalculo: 'ODOMETRO',
        kilometraje: 45600,
        nivelTanqueAntes: 0,
        nivelTanqueDespues: 1,
        litrosCargados: 100,
        costoPorLitro: 0.4,
        costoTotal: 40.0,
        estacionServicio: 'Estación Servicio El Valle',
    },
    {
        id: 'fuel-4',
        idVehiculo: '4',
        placaVehiculo: 'XY012ZZ',
        vehiculoDesc: 'Iveco Stralis (2015)',
        fecha: '2026-05-15',
        tipoCombustible: 'DIESEL',
        metodoCalculo: 'TANQUE',
        kilometraje: 189000,
        nivelTanqueAntes: 0.5,
        nivelTanqueDespues: 1,
        litrosCargados: 200,
        costoPorLitro: 0.4,
        costoTotal: 80.0,
        estacionServicio: 'PDV Punta de Piedras',
    },
    {
        id: 'fuel-5',
        idVehiculo: '3',
        placaVehiculo: 'JK789LM',
        vehiculoDesc: 'Suzuki GN125 (2023)',
        fecha: '2026-06-01',
        tipoCombustible: 'GASOLINA_91',
        metodoCalculo: 'TANQUE',
        kilometraje: 8800,
        nivelTanqueAntes: 0,
        nivelTanqueDespues: 1,
        litrosCargados: 12,
        costoPorLitro: 0.5,
        costoTotal: 6.0,
        estacionServicio: 'Bomba La Marina',
    },
];
