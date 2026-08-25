import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from '@/app/auth/service/auth.service';
import { CargaCombustible } from '../data/combustible-mock';

@Injectable({ providedIn: 'root' })
export class CargaCombustibleService {
    private authService = inject(AuthService);

    private get supabase(): SupabaseClient {
        return this.authService.client;
    }

    async obtenerCargas(
        pIdVehiculo?: string | null,
        pDesde?: string | null,
        pHasta?: string | null,
    ): Promise<CargaCombustible[]> {
        const { data, error } = await this.supabase.rpc('obtener_cargas_combustible', {
            p_id_vehiculo: pIdVehiculo ?? null,
            p_desde: pDesde || null,
            p_hasta: pHasta || null,
        });

        if (error) throw new Error(`Error al cargar cargas de combustible: ${error.message}`);
        return ((data as any[]) || []).map(this.mapear);
    }

    async crearCarga(carga: CargaCombustible): Promise<string> {
        const { data, error } = await this.supabase.rpc('crear_carga_combustible', {
            p_id_vehiculo: carga.idVehiculo,
            p_fecha: carga.fecha,
            p_tipo_combustible: carga.tipoCombustible,
            p_metodo_calculo: carga.metodoCalculo || 'TANQUE',
            p_kilometraje: carga.kilometraje ?? null,
            p_nivel_tanque_antes: carga.nivelTanqueAntes ?? null,
            p_nivel_tanque_despues: carga.nivelTanqueDespues ?? null,
            p_litros: carga.litrosCargados,
            p_costo_por_litro: carga.costoPorLitro,
            p_costo_total: carga.costoTotal,
            p_costo_total_bss: carga.costoTotalBss ?? 0,
            p_estacion_servicio: carga.estacionServicio || null,
            p_observaciones: carga.observaciones || null,
        });

        if (error) throw new Error(`Error al registrar carga de combustible: ${error.message}`);
        return data;
    }

    async actualizarCarga(carga: CargaCombustible): Promise<void> {
        const { error } = await this.supabase.rpc('actualizar_carga_combustible', {
            p_id: carga.id,
            p_id_vehiculo: carga.idVehiculo,
            p_fecha: carga.fecha,
            p_tipo_combustible: carga.tipoCombustible,
            p_metodo_calculo: carga.metodoCalculo || 'TANQUE',
            p_kilometraje: carga.kilometraje ?? null,
            p_nivel_tanque_antes: carga.nivelTanqueAntes ?? null,
            p_nivel_tanque_despues: carga.nivelTanqueDespues ?? null,
            p_litros: carga.litrosCargados,
            p_costo_por_litro: carga.costoPorLitro,
            p_costo_total: carga.costoTotal,
            p_estacion_servicio: carga.estacionServicio || null,
            p_observaciones: carga.observaciones || null,
            p_costo_total_bss: carga.costoTotalBss ?? 0,
        });

        if (error) throw new Error(`Error al actualizar carga de combustible: ${error.message}`);
    }

    async eliminarCarga(id: string): Promise<void> {
        const { error } = await this.supabase.rpc('eliminar_carga_combustible', { p_id: id });
        if (error) throw new Error(`Error al eliminar carga de combustible: ${error.message}`);
    }

    private mapear(row: any): CargaCombustible {
        return {
            id: row.id,
            idVehiculo: row.id_vehiculo,
            placaVehiculo: row.placa_vehiculo || '',
            vehiculoDesc: row.vehiculo_desc || '',
            fecha: row.fecha || '',
            tipoCombustible: row.tipo_combustible || 'DIESEL',
            metodoCalculo: row.metodo_calculo || 'TANQUE',
            kilometraje: row.kilometraje != null ? Number(row.kilometraje) : undefined,
            nivelTanqueAntes: row.nivel_tanque_antes != null ? Number(row.nivel_tanque_antes) : 0,
            nivelTanqueDespues:
                row.nivel_tanque_despues != null ? Number(row.nivel_tanque_despues) : 1,
            litrosCargados: Number(row.litros) || 0,
            costoPorLitro: Number(row.costo_por_litro) || 0,
            costoTotal: Number(row.costo_total) || 0,
            costoTotalBss: row.costo_total_bss != null ? Number(row.costo_total_bss) : 0,
            estacionServicio: row.estacion_servicio || undefined,
            observaciones: row.observaciones || undefined,
        };
    }
}
