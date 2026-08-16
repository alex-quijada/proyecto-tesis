import { Injectable, inject } from '@angular/core';
import { AuthService } from '@/app/auth/service/auth.service';
import { RutaService } from '@/app/admin/pages/rutas/services/ruta.service';
import { VehiculoService } from '@/app/admin/pages/vehiculos/service/vehiculo.service';
import { MunicipioService } from '@/app/admin/services/municipio.service';
import { ViajeService } from './viaje.service';
import { ViajeAdmin } from './viaje.types';

export interface DashboardKpi {
    guiasPendientes: number;
    choferesActivos: number;
    vehiculosOperativos: number;
    montoPendienteUSD: number;
}

export interface FacturaPendiente {
    id: string;
    numeroFactura: string;
    nombreCliente: string;
    direccion: string;
    lat?: number;
    lng?: number;
    totalUSD: number;
    estado: string;
}

export interface ViajeActivo {
    idViaje: string;
    idChofer: string;
    idVehiculo: string;
    chofer: string;
    placaVehiculo: string;
    estado: string;
    totalFacturas: number;
    facturasProceso: number;
    facturasEmbarque: number;
}

export interface PosicionChoferLite {
    id_chofer: string;
    latitud: number;
    longitud: number;
    velocidad_kmh?: number | null;
    actualizado_en: string;
}

export interface ActividadItem {
    id: string;
    numeroFactura: string;
    nombreCliente: string;
    totalUSD: number;
    municipio: string;
    fecha: string;
}

export interface ActividadReciente {
    entregas: ActividadItem[];
    incidencias: ActividadItem[];
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
    private authService = inject(AuthService);
    private rutaService = inject(RutaService);
    private vehiculoService = inject(VehiculoService);
    private municipioService = inject(MunicipioService);
    private viajeService = inject(ViajeService);

    async obtenerKpis(): Promise<DashboardKpi> {
        const [guias, choferes, vehiculos] = await Promise.all([
            this.rutaService.obtenerGuias(),
            this.authService.obtenerChoferes(true),
            this.vehiculoService.obtenerVehiculos(),
        ]);

        const facturasPendientes = guias.flatMap((g) =>
            g.facturas.filter(
                (f) =>
                    f.idEstado === 'nuevo' ||
                    f.idEstado === 'embarque' ||
                    f.idEstado === 'espera' ||
                    f.idEstado === 'entrega',
            ),
        );

        return {
            guiasPendientes: new Set(
                guias
                    .filter((g) =>
                        g.facturas.some(
                            (f) =>
                                f.idEstado === 'nuevo' ||
                                f.idEstado === 'embarque' ||
                                f.idEstado === 'espera' ||
                                f.idEstado === 'entrega',
                        ),
                    )
                    .map((g) => g.id),
            ).size,
            choferesActivos: choferes.filter((c) => c.activo !== false).length,
            vehiculosOperativos: vehiculos.filter(
                (v) => (v.estado || '').toUpperCase() === 'OPERATIVO',
            ).length,
            montoPendienteUSD: facturasPendientes.reduce((sum, f) => sum + (f.totalUSD || 0), 0),
        };
    }

    async obtenerFacturasPendientes(): Promise<FacturaPendiente[]> {
        const guias = await this.rutaService.obtenerGuias();
        return guias
            .flatMap((g) =>
                g.facturas
                    .filter(
                        (f) =>
                            f.idEstado === 'nuevo' ||
                            f.idEstado === 'embarque' ||
                            f.idEstado === 'espera' ||
                            f.idEstado === 'entrega',
                    )
                    .map(
                        (f): FacturaPendiente => ({
                            id: f.id,
                            numeroFactura: f.numeroFactura,
                            nombreCliente: f.nombreCliente,
                            direccion: f.direccionSucursal || f.direccion,
                            lat: f.sucursalLat,
                            lng: f.sucursalLng,
                            totalUSD: f.totalUSD,
                            estado: f.idEstado,
                        }),
                    ),
            )
            .filter((f) => f.lat != null && f.lng != null);
    }

    async obtenerFacturasPorMunicipio(): Promise<
        { label: string; value: string; cantidad: number }[]
    > {
        const [guias, municipios] = await Promise.all([
            this.rutaService.obtenerGuias(),
            this.municipioService.obtenerTodos(),
        ]);

        const conteo = new Map<string, number>();
        for (const g of guias) {
            const pendiente = g.facturas.some(
                (f) =>
                    f.idEstado === 'nuevo' ||
                    f.idEstado === 'embarque' ||
                    f.idEstado === 'espera' ||
                    f.idEstado === 'entrega',
            );
            if (!pendiente) continue;
            const key = g.municipio || '';
            conteo.set(key, (conteo.get(key) || 0) + 1);
        }

        const labelMap = new Map(municipios.map((m) => [m.value, m.label]));
        return [...conteo.entries()]
            .map(([value, cantidad]) => ({
                value,
                label: labelMap.get(value) || value,
                cantidad,
            }))
            .sort((a, b) => b.cantidad - a.cantidad);
    }

    async obtenerViajesActivos(): Promise<ViajeActivo[]> {
        const viajes = await this.viajeService.obtenerViajes();
        return viajes
            .filter((v) => v.estado === 'proceso' || v.estado === 'programado')
            .map((v) => this.mapearViaje(v));
    }

    async obtenerPosicionesChoferes(): Promise<PosicionChoferLite[]> {
        const { data, error } = await this.authService.client.rpc('obtener_posiciones_choferes');
        if (error) throw error;
        return (data as PosicionChoferLite[]) || [];
    }

    async obtenerActividadReciente(): Promise<ActividadReciente> {
        const guias = await this.rutaService.obtenerGuias();
        const entregas: ActividadItem[] = [];
        const incidencias: ActividadItem[] = [];

        for (const g of guias) {
            for (const f of g.facturas) {
                const item: ActividadItem = {
                    id: f.id,
                    numeroFactura: f.numeroFactura,
                    nombreCliente: f.nombreCliente || 'Sin cliente',
                    totalUSD: f.totalUSD,
                    municipio: g.municipio,
                    fecha: g.fechaCreacion,
                };
                if (f.idEstado === 'finalizado') entregas.push(item);
                else if (f.idEstado === 'incidencia') incidencias.push(item);
            }
        }

        const ordenar = (a: ActividadItem[]) =>
            a.sort((x, y) => (y.fecha || '').localeCompare(x.fecha || ''));

        return {
            entregas: ordenar(entregas).slice(0, 5),
            incidencias: ordenar(incidencias).slice(0, 5),
        };
    }

    private mapearViaje(v: ViajeAdmin): ViajeActivo {
        return {
            idViaje: v.id_viaje,
            idChofer: v.id_chofer,
            idVehiculo: v.id_vehiculo,
            chofer: v.chofer || 'Sin asignar',
            placaVehiculo: v.placa_vehiculo || '—',
            estado: v.estado,
            totalFacturas: v.total_facturas ?? 0,
            facturasProceso: v.facturas_proceso ?? 0,
            facturasEmbarque: v.facturas_embarque ?? 0,
        };
    }
}
