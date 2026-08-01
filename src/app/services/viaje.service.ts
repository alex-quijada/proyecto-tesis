import { Injectable, inject, signal } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from '@/app/auth/service/auth.service';
import { CrearViajeResult } from './viaje.types';

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
        municipio: string;
        fechaViaje: string;
        idsFacturas: string[];
        distanciaTotalKm?: number;
        duracionTotalMin?: number;
    }): Promise<CrearViajeResult> {
        const { data, error } = await this.supabase.rpc('crear_viaje', {
            p_id_chofer: params.idChofer,
            p_id_vehiculo: params.idVehiculo,
            p_municipio: params.municipio,
            p_fecha_viaje: params.fechaViaje,
            p_ids_facturas: params.idsFacturas,
            p_distancia_total_km: params.distanciaTotalKm ?? null,
            p_duracion_total_min: params.duracionTotalMin ?? null,
        });

        if (error) throw error;
        return data as CrearViajeResult;
    }
}
