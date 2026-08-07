import { Injectable, signal, DestroyRef, inject } from '@angular/core';
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

    constructor() {
        this.wrapGlobalFetch();

        const goOnline = () => this.setOnline(true);
        const goOffline = () => this.setOnline(false);

        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);

        this.destroyRef.onDestroy(() => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
            this.stopHealthCheck();
        });
    }

    private setOnline(online: boolean) {
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
                this.setOnline(false);
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
            this.isOnline.set(false);
            return false;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

        try {
            const res = await fetch(`${environment.supabaseUrl}/rest/v1/`, {
                method: 'GET',
                cache: 'no-store',
                signal: controller.signal,
            });
            const online = res.status < 500;
            this.isOnline.set(online);
            return online;
        } catch {
            this.isOnline.set(false);
            return false;
        } finally {
            clearTimeout(timeoutId);
        }
    }
}
