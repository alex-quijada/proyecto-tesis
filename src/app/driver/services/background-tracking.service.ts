import { Injectable, inject, DestroyRef } from '@angular/core';
import { Capacitor, registerPlugin, PluginListenerHandle } from '@capacitor/core';

export interface BackgroundLocation {
    latitude: number;
    longitude: number;
    accuracy?: number;
    speed?: number; // m/s
    bearing?: number; // degrees
    time?: number;
    provider?: string;
}

interface BackgroundTrackingPlugin {
    startTracking(options?: { title?: string; text?: string }): Promise<{ success: boolean }>;
    stopTracking(): Promise<{ success: boolean }>;
    isTracking(): Promise<{ isTracking: boolean }>;
    addListener(
        eventName: 'locationUpdate',
        listenerFunc: (location: BackgroundLocation) => void,
    ): Promise<PluginListenerHandle>;
}

const BackgroundTracking = registerPlugin<BackgroundTrackingPlugin>('BackgroundTracking');

/**
 * Servicio Angular para controlar el Foreground Service nativo de Android.
 * Permite que el GPS siga transmitiendo y acumulando trazas aun con la pantalla apagada.
 */
@Injectable({ providedIn: 'root' })
export class BackgroundTrackingService {
    private destroyRef = inject(DestroyRef);
    private listenerHandle: PluginListenerHandle | null = null;
    private locationCallback: ((loc: BackgroundLocation) => void) | null = null;
    private activo = false;

    constructor() {
        this.destroyRef.onDestroy(() => {
            void this.stop();
        });
    }

    /**
     * Inicia el Foreground Service nativo con la notificación en la barra de Android.
     */
    async start(options?: { title?: string; text?: string }): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) {
            this.activo = true;
            return true;
        }

        try {
            if (!this.listenerHandle) {
                this.listenerHandle = await BackgroundTracking.addListener(
                    'locationUpdate',
                    (location: BackgroundLocation) => {
                        this.locationCallback?.(location);
                    },
                );
            }

            await BackgroundTracking.startTracking({
                title: options?.title || 'BrandIA Driver • Ruta activa',
                text: options?.text || 'Transmitiendo ubicación GPS en segundo plano...',
            });
            this.activo = true;
            return true;
        } catch (err) {
            console.warn('[BackgroundTracking] Error iniciando servicio:', err);
            return false;
        }
    }

    /**
     * Detiene el Foreground Service y remueve la notificación de la barra.
     */
    async stop(): Promise<boolean> {
        this.activo = false;
        if (!Capacitor.isNativePlatform()) return true;

        try {
            if (this.listenerHandle) {
                await this.listenerHandle.remove();
                this.listenerHandle = null;
            }
            await BackgroundTracking.stopTracking();
            return true;
        } catch (err) {
            console.warn('[BackgroundTracking] Error deteniendo servicio:', err);
            return false;
        }
    }

    /**
     * Registra un callback para recibir coordenadas continuas del servicio nativo.
     */
    onLocationUpdate(callback: (loc: BackgroundLocation) => void): () => void {
        this.locationCallback = callback;
        return () => {
            if (this.locationCallback === callback) {
                this.locationCallback = null;
            }
        };
    }

    isActivo(): boolean {
        return this.activo;
    }
}
