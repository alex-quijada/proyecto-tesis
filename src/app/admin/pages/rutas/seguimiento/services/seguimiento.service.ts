import { Injectable, OnDestroy, signal, inject } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';

import { AuthService } from '@/app/auth/service/auth.service';
import { ViajeService } from '@/app/services/viaje.service';
import { ViajeAdmin } from '@/app/services/viaje.types';

export interface PosicionChofer {
    id_chofer: string;
    latitud: number;
    longitud: number;
    velocidad_kmh?: number | null;
    precision_m?: number | null;
    rumbo?: number | null;
    id_viaje_activo?: string | null;
    actualizado_en: string;
    nombre_chofer?: string;
    placa_vehiculo?: string;
}

interface PayloadPosicion {
    new?: PosicionChofer | null;
}

export interface HistorialViajeRow {
    id_factura: string;
    numero_factura: string;
    nombre_cliente?: string | null;
    orden_visita?: number | null;
    estado: string;
    observacion?: string | null;
    fecha_cambio: string;
}

/**
 * Ventana de Monitoreo en Tiempo Real (admin). Mantiene los viajes
 * activos (`obtener_viajes`) y la última posición por chofer
 * (`obtener_posiciones_choferes`) y escucha Realtime para actualizar
 * ambos en vivo: movimientos de `posiciones_chofer` se aplican directo
 * al mapa; cambios en `viajes`/`itinerario_viaje` disparan un refetch
 * con debounce para refrescar estado y rutas.
 */
@Injectable()
export class SeguimientoService implements OnDestroy {
    private authService = inject(AuthService);
    private viajeService = inject(ViajeService);

    readonly viajes = signal<ViajeAdmin[]>([]);
    readonly posiciones = signal<Record<string, PosicionChofer>>({});
    readonly cargando = signal(true);
    readonly conectado = signal(false);
    readonly ultimaActualizacion = signal<Date | null>(null);

    private canal: RealtimeChannel | null = null;
    private debounceViaje: ReturnType<typeof setTimeout> | null = null;
    private alReconectar: (() => void) | null = null;
    private pendienteRefrescar = false;

    async cargar(): Promise<void> {
        try {
            const [viajes, posiciones] = await Promise.all([
                this.viajeService.obtenerViajes(),
                this.obtenerPosiciones(),
            ]);
            this.viajes.set(viajes);
            this.posiciones.set(posiciones);
            this.ultimaActualizacion.set(new Date());
        } catch (err) {
            console.error('[Seguimiento] Error al cargar datos', err);
        } finally {
            this.cargando.set(false);
        }
    }

    async refrescar(): Promise<void> {
        try {
            const [viajes, posiciones] = await Promise.all([
                this.viajeService.obtenerViajes(),
                this.obtenerPosiciones(),
            ]);
            this.viajes.set(viajes);
            this.posiciones.set(posiciones);
            this.ultimaActualizacion.set(new Date());
        } catch (err) {
            console.error('[Seguimiento] Error al refrescar datos', err);
        }
    }

    async obtenerHistorialViaje(idViaje: string): Promise<HistorialViajeRow[]> {
        const { data, error } = await this.authService.client.rpc('obtener_historial_viaje', {
            p_id_viaje: idViaje,
        });
        if (error) throw error;
        return (data as HistorialViajeRow[]) || [];
    }

    /** Reinicia un viaje (solo staff): vuelve a 'programado', sus facturas a
     *  'embarque' y limpia firmas, incidencias, fotos e historial. Devuelve las
     *  URLs de fotos de incidencia limpiadas en BD. */
    async reiniciarViaje(idViaje: string): Promise<string[]> {
        const res = await this.viajeService.reiniciarViaje(idViaje);
        return res.fotos_eliminadas || [];
    }

    private async obtenerPosiciones(): Promise<Record<string, PosicionChofer>> {
        const { data, error } = await this.authService.client.rpc('obtener_posiciones_choferes');
        if (error) throw error;
        const lista = (data as PosicionChofer[]) || [];
        const mapa: Record<string, PosicionChofer> = {};
        for (const p of lista) {
            mapa[p.id_chofer] = p;
        }
        return mapa;
    }

    async initRealtime(): Promise<void> {
        if (this.canal) return;
        const user = this.authService.getCurrentUser();
        if (!user) return;

        await this.crearCanal(user.id);

        if (!this.alReconectar) {
            this.alReconectar = () => {
                if (this.conectado()) return;
                const id = this.authService.getCurrentUser()?.id;
                if (!id) return;
                this.pendienteRefrescar = true;
                void this.crearCanal(id);
            };
            window.addEventListener('online', this.alReconectar);
        }
    }

    private async crearCanal(userId: string): Promise<void> {
        const topic = `seguimiento-admin-${userId}`;
        const existentes = this.authService.client
            .getChannels()
            .filter((c) => c.topic === topic || c.topic === `realtime:${topic}`);
        for (const canalExistente of existentes) {
            await this.authService.client.removeChannel(canalExistente);
        }
        this.canal = null;

        this.canal = this.authService.client
            .channel(topic)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'posiciones_chofer' },
                (payload) => this.onPosicion(payload as unknown as PayloadPosicion),
            )
            .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, () =>
                this.onCambioViaje(),
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'itinerario_viaje' },
                () => this.onCambioViaje(),
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'historial_estados_factura' },
                () => this.onCambioViaje(),
            )
            .subscribe((status) => {
                this.conectado.set(status === 'SUBSCRIBED');
                if (status === 'SUBSCRIBED' && this.pendienteRefrescar) {
                    this.pendienteRefrescar = false;
                    void this.refrescar();
                }
            });
    }

    private onPosicion(payload: PayloadPosicion): void {
        const nueva = payload.new;
        if (!nueva?.id_chofer || nueva.latitud == null || nueva.longitud == null) return;
        // El payload Realtime solo trae las columnas de `posiciones_chofer`;
        // `nombre_chofer`/`placa_vehiculo` vienen del JOIN del RPC y se
        // pierden si se sobrescribe el objeto. Se conservan del valor anterior.
        const id = nueva.id_chofer!;
        const anterior = this.posiciones()[id];
        this.posiciones.update((mapa) => ({
            ...mapa,
            [id]: {
                ...anterior,
                ...nueva,
                nombre_chofer: nueva.nombre_chofer || anterior?.nombre_chofer || undefined,
                placa_vehiculo: nueva.placa_vehiculo || anterior?.placa_vehiculo || undefined,
            },
        }));
        this.ultimaActualizacion.set(new Date());
    }

    private onCambioViaje(): void {
        if (this.debounceViaje) clearTimeout(this.debounceViaje);
        this.debounceViaje = setTimeout(() => {
            void this.refrescar();
        }, 500);
    }

    ngOnDestroy(): void {
        if (this.debounceViaje) clearTimeout(this.debounceViaje);
        if (this.alReconectar) {
            window.removeEventListener('online', this.alReconectar);
            this.alReconectar = null;
        }
        if (this.canal) {
            void this.authService.client.removeChannel(this.canal);
            this.canal = null;
        }
    }
}
