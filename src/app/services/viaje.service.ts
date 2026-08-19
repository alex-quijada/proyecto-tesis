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

    /** Reinicia un viaje (solo staff): vuelve a 'programado', sus facturas a
     *  'embarque' y limpia firmas, incidencias, fotos e historial de estados.
     *  Devuelve las URLs de fotos de incidencia borradas en BD. */
    async reiniciarViaje(idViaje: string): Promise<{ fotos_eliminadas?: string[] }> {
        const { data, error } = await this.supabase.rpc('reiniciar_viaje', {
            p_id_viaje: idViaje,
        });

        if (error) throw error;
        return (data as { fotos_eliminadas?: string[] }) || {};
    }

    /** Borra los objetos del bucket de fotos de incidencia cuyas URLs fueron
     *  limpiadas en BD al reiniciar un viaje (evita archivos huérfanos). */
    async borrarFotosIncidencia(urls: string[]): Promise<void> {
        const BUCKET = 'incidencias-fotos';
        const marker = `/object/public/${BUCKET}/`;
        const paths = urls
            .map((url) => {
                const idx = url.indexOf(marker);
                return idx >= 0 ? url.slice(idx + marker.length) : null;
            })
            .filter((p): p is string => !!p);

        if (paths.length < 1) return;
        const { error } = await this.supabase.storage
            .from(BUCKET)
            .remove(paths);
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

    /** Marca/desmarca una incidencia como recuperable (staff). */
    async setIncidenciaRecuperable(idIncidencia: string, recuperable: boolean): Promise<void> {
        const { error } = await this.supabase.rpc('set_incidencia_recuperable', {
            p_id_incidencia: idIncidencia,
            p_recuperable: recuperable,
        });

        if (error) throw error;
    }

    /** Re-agrega facturas en 'incidencia' recuperable al viaje en proceso
     *  (vuelven a 'proceso' como paradas navegables). La dispara el chofer
     *  al detectar la autorización del admin. */
    async reagregarFacturaReenvio(
        idViaje: string,
        idsFacturas: string[],
    ): Promise<{ total_reactivadas: number }> {
        const { data, error } = await this.supabase.rpc('reagregar_factura_reenvio', {
            p_id_viaje: idViaje,
            p_ids_facturas: idsFacturas,
        });

        if (error) throw error;
        return (data as { total_reactivadas: number }) || { total_reactivadas: 0 };
    }

    async obtenerViajeChofer(): Promise<ViajeChofer[]> {
        const { data, error } = await this.supabase.rpc('obtener_viaje_chofer');

        if (error) throw error;
        return (data as ViajeChofer[]) || [];
    }

    async obtenerViajes(): Promise<ViajeAdmin[]> {
        const { data, error } = await this.supabase.rpc('obtener_viajes', {
            p_id_chofer: null,
        });

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
