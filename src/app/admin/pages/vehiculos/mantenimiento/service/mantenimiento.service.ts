import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from '@/app/auth/service/auth.service';
import { Mantenimiento } from '../data/mantenimiento-mock';

@Injectable({ providedIn: 'root' })
export class MantenimientoService {
    private authService = inject(AuthService);

    private get supabase(): SupabaseClient {
        return this.authService.client;
    }

    async obtenerMantenimientos(
        pIdVehiculo?: string | null,
        pDesde?: string | null,
        pHasta?: string | null,
    ): Promise<Mantenimiento[]> {
        const { data, error } = await this.supabase.rpc('obtener_mantenimientos', {
            p_id_vehiculo: pIdVehiculo ?? null,
            p_desde: pDesde || null,
            p_hasta: pHasta || null,
        });

        if (error) throw new Error(`Error al cargar mantenimientos: ${error.message}`);
        return ((data as any[]) || []).map(this.mapear);
    }

    async crearMantenimiento(m: Mantenimiento): Promise<string> {
        const { data, error } = await this.supabase.rpc('crear_mantenimiento', {
            p_id_vehiculo: m.idVehiculo,
            p_tipo: m.tipo,
            p_fecha_programada: m.fechaProgramada,
            p_fecha_realizado: m.fechaRealizado || null,
            p_kilometraje: m.kilometraje ?? null,
            p_descripcion: m.descripcion || null,
            p_responsable: m.responsable || null,
            p_costo: m.costo ?? 0,
            p_costo_bss: m.costoBss ?? 0,
            p_proximo_km: m.proximoKm ?? null,
            p_proxima_fecha: m.proximaFecha || null,
            p_estado: m.estado || 'PROGRAMADO',
        });

        if (error) throw new Error(`Error al registrar mantenimiento: ${error.message}`);
        return data;
    }

    async actualizarMantenimiento(m: Mantenimiento): Promise<void> {
        const { error } = await this.supabase.rpc('actualizar_mantenimiento', {
            p_id: m.id,
            p_id_vehiculo: m.idVehiculo,
            p_tipo: m.tipo,
            p_fecha_programada: m.fechaProgramada,
            p_fecha_realizado: m.fechaRealizado || null,
            p_kilometraje: m.kilometraje ?? null,
            p_descripcion: m.descripcion || null,
            p_responsable: m.responsable || null,
            p_costo: m.costo ?? 0,
            p_proximo_km: m.proximoKm ?? null,
            p_proxima_fecha: m.proximaFecha || null,
            p_estado: m.estado || 'PROGRAMADO',
            p_costo_bss: m.costoBss ?? 0,
        });

        if (error) throw new Error(`Error al actualizar mantenimiento: ${error.message}`);
    }

    async eliminarMantenimiento(id: string): Promise<void> {
        const { error } = await this.supabase.rpc('eliminar_mantenimiento', { p_id: id });
        if (error) throw new Error(`Error al eliminar mantenimiento: ${error.message}`);
    }

    private mapear(row: any): Mantenimiento {
        return {
            id: row.id,
            idVehiculo: row.id_vehiculo,
            placaVehiculo: row.placa_vehiculo || '',
            vehiculoDesc: row.vehiculo_desc || '',
            tipo: row.tipo || 'PREVENTIVO',
            fechaProgramada: row.fecha_programada || '',
            fechaRealizado: row.fecha_realizado || undefined,
            kilometraje: row.kilometraje != null ? Number(row.kilometraje) : 0,
            descripcion: row.descripcion || '',
            responsable: row.responsable || '',
            costo: Number(row.costo) || 0,
            costoBss: row.costo_bss != null ? Number(row.costo_bss) : 0,
            proximoKm: row.proximo_km != null ? Number(row.proximo_km) : 0,
            proximaFecha: row.proxima_fecha || undefined,
            estado: row.estado || 'PROGRAMADO',
        };
    }
}
