import { Injectable, signal, DestroyRef, inject } from '@angular/core';
import { Network, ConnectionStatus } from '@capacitor/network';
import { App, AppState } from '@capacitor/app';
import { PluginListenerHandle } from '@capacitor/core';
import { environment } from '@/environments/environment';

const HEALTH_CHECK_INTERVAL_MS = 10_000;
const HEALTH_CHECK_TIMEOUT_MS = 5_000;

@Injectable({
    providedIn: 'root',
})
export class ConnectivityService {
    private destroyRef = inject(DestroyRef);

    isOnline = signal<boolean>(navigator.onLine);

    private healthTimer: ReturnType<typeof setInterval> | undefined;
    private networkListener: PluginListenerHandle | null = null;
    private appListener: PluginListenerHandle | null = null;
    private appEnPrimerPlano = true;

    constructor() {
        this.wrapGlobalFetch();
        this.initListeners();

        this.destroyRef.onDestroy(() => {
            this.networkListener?.remove();
            this.appListener?.remove();
            this.stopHealthCheck();
        });
    }

    private async initListeners() {
        // 1. Estado inicial nativo
        try {
            const status = await Network.getStatus();
            this.setOnline(status.connected);
        } catch {
            this.setOnline(navigator.onLine);
        }

        // 2. Escuchar cambios de red con el plugin nativo
        try {
            this.networkListener = await Network.addListener(
                'networkStatusChange',
                (status: ConnectionStatus) => {
                    this.setOnline(status.connected);
                },
            );
        } catch {
            // Fallback a eventos web estándar
            window.addEventListener('online', () => this.setOnline(true));
            window.addEventListener('offline', () => this.setOnline(false));
        }

        // 3. Escuchar ciclo de vida de la aplicación
        try {
            this.appListener = await App.addListener('appStateChange', (state: AppState) => {
                this.appEnPrimerPlano = state.isActive;
                if (state.isActive) {
                    // Al despertar la app: verificar red inmediatamente de forma no intrusiva
                    void this.checkNow();
                }
            });
        } catch {
            document.addEventListener('visibilitychange', () => {
                this.appEnPrimerPlano = document.visibilityState === 'visible';
                if (this.appEnPrimerPlano) void this.checkNow();
            });
        }
    }

    private setOnline(online: boolean) {
        if (this.isOnline() === online) return;
        this.isOnline.set(online);
        if (online) {
            this.stopHealthCheck();
        } else {
            this.startHealthCheck();
        }
    }

    private wrapGlobalFetch() {
        const originalFetch = window.fetch.bind(window);

        window.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
            originalFetch(input, init).catch((err) => {
                if (err instanceof DOMException && err.name === 'AbortError') {
                    throw err;
                }
                // Si la app está en segundo plano o el navegador ya marca offline, actualizar estado
                if (!this.appEnPrimerPlano || !navigator.onLine) {
                    this.setOnline(false);
                } else {
                    // Si falló pero estamos en primer plano, verificar de forma asíncrona antes de marcar offline
                    void this.checkNow();
                }
                throw err;
            })) as typeof window.fetch;
    }

    private startHealthCheck() {
        if (this.healthTimer) return;
        this.healthTimer = setInterval(() => {
            void this.checkNow();
        }, HEALTH_CHECK_INTERVAL_MS);
    }

    private stopHealthCheck() {
        if (this.healthTimer) {
            clearInterval(this.healthTimer);
            this.healthTimer = undefined;
        }
    }

    async checkNow(): Promise<boolean> {
        if (!navigator.onLine) {
            this.setOnline(false);
            return false;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

        try {
            const res = await fetch(`${environment.supabaseUrl}/auth/v1/health`, {
                method: 'GET',
                cache: 'no-store',
                headers: { apikey: environment.supabaseKey },
                signal: controller.signal,
            });
            const online = res.status < 500;
            this.setOnline(online);
            return online;
        } catch {
            // Solo marcar offline si la app está en primer plano (evita falsos al suspender)
            if (this.appEnPrimerPlano && !navigator.onLine) {
                this.setOnline(false);
            }
            return false;
        } finally {
            clearTimeout(timeoutId);
        }
    }
}
