import { Injectable, inject, effect } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';

import { AuthService } from '@/app/auth/service/auth.service';
import { ConnectivityService } from '@/app/services/connectivity.service';
import { NavigationService } from './navigation.service';
import { DriverStoreService } from './driver-store.service';
import { TrazaService } from './traza.service';

/** Intervalo entre envíos de posición al servidor (en vivo). */
const INTERVALO_ENVIO_MS = 30_000;
/** Intervalo en modo simulación: el marcador virtual avanza rápido y el
 *  admin necesita una traza fluida sin saturar Supabase. */
const INTERVALO_ENVIO_SIMULACION_MS = 5_000;

/**
 * Envía la posición del chofer a `posiciones_chofer` (UPSERT) mientras
 * navega. Reacciona a `NavigationService.posicionDriver()` y hace
 * throttle a ~30s. Si el chofer está sin conexión no encola: las
 * posiciones son efímeras y se recuperan con el siguiente tick.
 *
 * Además acumula la traza REAL en local (`TrazaService`) para los
 * reportes de desvío: el muestreo local (15s GPS) no cuesta la API de
 * Google, y el lote se envía al finalizar el viaje.
 */
@Injectable()
export class PosicionService {
    private navigationService = inject(NavigationService);
    private store = inject(DriverStoreService);
    private authService = inject(AuthService);
    private connectivity = inject(ConnectivityService);
    private trazaService = inject(TrazaService);

    private uid: string | null = null;
    private ultimoEnvio = 0;
    private estabaPausado = false;
    private ultimaMuestraTraza = 0;

    constructor() {
        this.uid = this.authService.getCurrentUser()?.id ?? null;

        effect(() => {
            const pos = this.navigationService.posicionDriver();
            if (!pos || !this.uid) return;
            this.programarEnvio(pos.lat, pos.lng);
            this.acumularTraza(pos);
        });

        // Al detenerse el movimiento (llegada a la parada o pausa manual) el
        // throttle ya no dispara: enviar la posición final de inmediato para
        // que el admin vea al chofer en el punto exacto.
        effect(() => {
            const pausado = this.navigationService.pausado();
            const pos = this.navigationService.posicionDriver();
            const transicion = pausado && !this.estabaPausado;
            this.estabaPausado = pausado;
            if (!transicion || !pos || !this.uid) return;
            this.ultimoEnvio = Date.now();
            void this.enviar(pos.lat, pos.lng);
            void this.acumularTraza(pos);
        });
    }

    private get supabase(): SupabaseClient {
        return this.authService.client;
    }

    /** Acumula un punto en la traza local del viaje activo, muestreando a
     *  ~15 s en GPS real (y en cada tick en simulación, que ya es rápido). */
    private acumularTraza(pos: { lat: number; lng: number }) {
        const viajeActivo = this.store.viajesChofer().find((v) => v.estado === 'proceso');
        if (!viajeActivo) return;

        const intervalo = this.navigationService.simulando()
            ? 0 // en simulación muestrear cada tick (no hay coste de API)
            : TrazaService.INTERVALO_GPS_MS;
        const ahora = Date.now();
        if (intervalo > 0 && ahora - this.ultimaMuestraTraza < intervalo) return;
        this.ultimaMuestraTraza = ahora;

        void this.trazaService.acumularPunto(
            viajeActivo.id_viaje,
            pos.lat,
            pos.lng,
            null,
            this.navigationService.rumbo(),
        );
    }

    private programarEnvio(lat: number, lng: number) {
        const intervalo = this.navigationService.simulando()
            ? INTERVALO_ENVIO_SIMULACION_MS
            : INTERVALO_ENVIO_MS;
        const ahora = Date.now();
        if (ahora - this.ultimoEnvio < intervalo) return;
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
