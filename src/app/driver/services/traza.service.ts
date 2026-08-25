import { Injectable, inject, effect } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { Preferences } from '@capacitor/preferences';

import { AuthService } from '@/app/auth/service/auth.service';
import { ConnectivityService } from '@/app/services/connectivity.service';
import { NavigationService } from './navigation.service';
import { OfflineStorageService } from './offline-storage.service';

export interface PuntoTraza {
    latitud: number;
    longitud: number;
    velocidad_kmh?: number | null;
    rumbo?: number | null;
    es_simulacion: boolean;
    creada_en: string;
}

interface TrazaPendiente {
    idViaje: string;
    puntos: PuntoTraza[];
}

const clave = (uid: string, idViaje: string) => `offline:${uid}:traza:${idViaje}`;

/**
 * Acumula la traza real del chofer LOCALMENTE (Preferences) mientras navega
 * y la envía a `trazas_viaje` al finalizar el viaje (o al reconectar si
 * quedó pendiente). No usa Realtime: el muestreo local no cuesta la API de
 * Google, solo el envío en lote al cierre del viaje.
 *
 * NO es root: depende de `NavigationService` (scoped a DriverLayout), así
 * que se provee junto a él en DriverLayout.
 */
@Injectable()
export class TrazaService {
    private authService = inject(AuthService);
    private connectivity = inject(ConnectivityService);
    private navigationService = inject(NavigationService);
    private offlineStorage = inject(OfflineStorageService);

    private uid: string | null = null;
    private ultimaMuestra = 0;

    constructor() {
        this.uid = this.authService.getCurrentUser()?.id ?? null;
    }

    private get supabase(): SupabaseClient {
        return this.authService.client;
    }

    /** Intervalo de muestreo local en GPS real (15 s). En simulación se
     *  muestrea con el tick de posiciones (más rápido) sin coste extra. */
    static readonly INTERVALO_GPS_MS = 15_000;

    /** Acumula un punto de la traza del viaje activo en el buffer local. */
    async acumularPunto(
        idViaje: string,
        lat: number,
        lng: number,
        velocidadKmh?: number | null,
        rumbo?: number | null,
    ): Promise<void> {
        if (!this.uid) return;
        const punto: PuntoTraza = {
            latitud: lat,
            longitud: lng,
            velocidad_kmh: velocidadKmh ?? null,
            rumbo: rumbo ?? null,
            es_simulacion: this.navigationService.simulando(),
            creada_en: new Date().toISOString(),
        };
        const caché = await this.offlineStorage.leer<PuntoTraza[]>(
            this.uid,
            clave(this.uid, idViaje),
        );
        const puntos = caché?.data ?? [];
        puntos.push(punto);
        await this.offlineStorage.guardar(this.uid, clave(this.uid, idViaje), puntos);
    }

    /** Envía la traza acumulada del viaje a la BD y limpia el buffer local.
     *  Si falla (sin red), conserva el buffer para reintentar al reconectar. */
    async enviarTraza(idViaje: string): Promise<boolean> {
        if (!this.uid) return false;
        const caché = await this.offlineStorage.leer<PuntoTraza[]>(
            this.uid,
            clave(this.uid, idViaje),
        );
        const puntos = caché?.data ?? [];
        if (puntos.length < 1) return true;
        if (!this.connectivity.isOnline()) return false;

        try {
            const { error } = await this.supabase.rpc('registrar_trazas_viaje', {
                p_id_viaje: idViaje,
                p_puntos: puntos,
            });
            if (error) {
                console.warn('[Traza] Error al registrar traza', error);
                return false;
            }
            await this.offlineStorage.eliminar(this.uid, clave(this.uid, idViaje));
            return true;
        } catch (err) {
            console.warn('[Traza] No se pudo enviar la traza', err);
            return false;
        }
    }

    /** Envía todas las trazas pendientes (al reconectar). */
    async sincronizarTrazasPendientes(): Promise<void> {
        if (!this.uid) return;
        if (!this.connectivity.isOnline()) return;
        const prefijo = `offline:${this.uid}:traza:`;
        const { keys } = await Preferences.keys();
        for (const key of keys) {
            if (!key.startsWith(prefijo)) continue;
            const idViaje = key.slice(prefijo.length);
            await this.enviarTraza(idViaje);
        }
    }

    /** Elimina la traza local de un viaje (reinicio/limpieza). */
    async limpiarTrazaLocal(idViaje: string): Promise<void> {
        if (!this.uid) return;
        await this.offlineStorage.eliminar(this.uid, clave(this.uid, idViaje));
    }
}
