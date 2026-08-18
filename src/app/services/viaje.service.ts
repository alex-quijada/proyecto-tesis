import { Injectable, inject, signal } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from '@/app/auth/service/auth.service';
import { CrearViajeResult, ViajeChofer, ViajeAdmin, RutaPersistida } from './viaje.types';

@Injectable({ providedIn: 'root' })
export class ViajeService {
    private authService = inject(AuthService);

    private get supabase(): SupabaseClient {
        return this.authService.client;
    }

    readonly rutaPath = signal<{ lat: number; lng: number }[]>([]);
    readonly rutaDistanciaKm = signal<number>(0);
    readonly rutaDuracionMin = signal<number>(0);

    async crearViaje(params: {
        idChofer: string;
        idVehiculo: string;
        fechaViaje: string;
        idsFacturas: string[];
        distanciaTotalKm?: number;
        duracionTotalMin?: number;
    }): Promise<CrearViajeResult> {
        const { data, error } = await this.supabase.rpc('crear_viaje', {
            p_id_chofer: params.idChofer,
            p_id_vehiculo: params.idVehiculo,
            p_fecha_viaje: params.fechaViaje,
            p_ids_facturas: params.idsFacturas,
            p_distancia_total_km: params.distanciaTotalKm ?? null,
            p_duracion_total_min: params.duracionTotalMin ?? null,
        });

        if (error) throw error;
        return data as CrearViajeResult;
    }

    async iniciarViaje(idViaje: string, idsFacturasOrdenadas: string[]): Promise<CrearViajeResult> {
        const { data, error } = await this.supabase.rpc('iniciar_viaje', {
            p_id_viaje: idViaje,
            p_ids_facturas_ordenadas: idsFacturasOrdenadas,
        });

        if (error) throw error;
        return data as CrearViajeResult;
    }

    async actualizarOrdenViaje(idViaje: string, idsFacturasOrdenadas: string[]): Promise<void> {
        const { error } = await this.supabase.rpc('actualizar_orden_viaje', {
            p_id_viaje: idViaje,
            p_ids_facturas_ordenadas: idsFacturasOrdenadas,
        });

        if (error) throw error;
    }

    async guardarRutaViaje(idViaje: string, ruta: RutaPersistida): Promise<void> {
        const { error } = await this.supabase.rpc('guardar_ruta_viaje', {
            p_id_viaje: idViaje,
            p_ruta_detallada: ruta,
        });

        if (error) throw error;
    }

    /** Reinicia un viaje (solo staff): vuelve a 'programado' y sus facturas a 'embarque'. */
    async reiniciarViaje(idViaje: string): Promise<void> {
        const { error } = await this.supabase.rpc('reiniciar_viaje', {
            p_id_viaje: idViaje,
        });

        if (error) throw error;
    }

    /** Finaliza el viaje (chofer al volver al almacén): todas las facturas hechas → 'finalizado'. */
    async finalizarViaje(idViaje: string): Promise<void> {
        const { error } = await this.supabase.rpc('finalizar_viaje', {
            p_id_viaje: idViaje,
        });

        if (error) throw error;
    }

    /** Edita la ventana laboral de un viaje (staff). */
    async actualizarVentanaViaje(idViaje: string, inicio: string, fin: string): Promise<void> {
        const { error } = await this.supabase.rpc('actualizar_ventana_viaje', {
            p_id_viaje: idViaje,
            p_inicio: inicio,
            p_fin: fin,
        });

        if (error) throw error;
    }

    /** Resuelve la incidencia de una factura (staff): la vuelve a 'nuevo'. */
    async resolverIncidencia(idFactura: string): Promise<void> {
        const { error } = await this.supabase.rpc('resolver_incidencia', {
            p_id_factura: idFactura,
        });

        if (error) throw error;
    }

    async obtenerViajeChofer(): Promise<ViajeChofer[]> {
        const { data, error } = await this.supabase.rpc('obtener_viaje_chofer');

        if (error) throw error;
        return (data as ViajeChofer[]) || [];
    }

    async obtenerViajes(): Promise<ViajeAdmin[]> {
        const { data, error } = await this.supabase.rpc('obtener_viajes');

        if (error) throw error;
        return (data as ViajeAdmin[]) || [];
    }

    /** Viajes del chofer (para el historial de entregas). */
    async obtenerViajesChofer(idChofer: string): Promise<ViajeAdmin[]> {
        const { data, error } = await this.supabase.rpc('obtener_viajes', {
            p_id_chofer: idChofer,
        });

        if (error) throw error;
        return (data as ViajeAdmin[]) || [];
    }
}
