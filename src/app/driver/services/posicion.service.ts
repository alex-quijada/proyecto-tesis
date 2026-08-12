import { Injectable, inject, effect } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';

import { AuthService } from '@/app/auth/service/auth.service';
import { ConnectivityService } from '@/app/services/connectivity.service';
import { NavigationService } from './navigation.service';
import { DriverStoreService } from './driver-store.service';

/** Intervalo mínimo entre envíos de posición al servidor. */
const INTERVALO_ENVIO_MS = 30_000;

/**
 * Envía la posición del chofer a `posiciones_chofer` (UPSERT) mientras
 * navega. Reacciona a `NavigationService.posicionDriver()` y hace
 * throttle a ~30s. Si el chofer está sin conexión no encola: las
 * posiciones son efímeras y se recuperan con el siguiente tick.
 */
@Injectable()
export class PosicionService {
    private navigationService = inject(NavigationService);
    private store = inject(DriverStoreService);
    private authService = inject(AuthService);
    private connectivity = inject(ConnectivityService);

    private uid: string | null = null;
    private ultimoEnvio = 0;

    constructor() {
        this.uid = this.authService.getCurrentUser()?.id ?? null;

        effect(() => {
            const pos = this.navigationService.posicionDriver();
            if (!pos || !this.uid) return;
            this.programarEnvio(pos.lat, pos.lng);
        });
    }

    private get supabase(): SupabaseClient {
        return this.authService.client;
    }

    private programarEnvio(lat: number, lng: number) {
        const ahora = Date.now();
        if (ahora - this.ultimoEnvio < INTERVALO_ENVIO_MS) return;
        this.ultimoEnvio = ahora;
        void this.enviar(lat, lng);
    }

    private async enviar(lat: number, lng: number) {
        if (!this.connectivity.isOnline()) return;

        const viajeActivo = this.store.viajesChofer().find((v) => v.estado === 'proceso');
        try {
            const { error } = await this.supabase.rpc('actualizar_posicion_chofer', {
                p_latitud: lat,
                p_longitud: lng,
                p_id_viaje_activo: viajeActivo?.id_viaje ?? null,
            });
            if (error) {
                console.warn('[Posicion] Error al enviar posición', error);
            }
        } catch (err) {
            console.warn('[Posicion] No se pudo enviar la posición', err);
        }
    }
}
