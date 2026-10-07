import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ConnectivityService } from '@/app/services/connectivity.service';

const DEBOUNCE_OFFLINE_MS = 1500;
const RECONEXION_BANNER_MS = 4000;

@Component({
    selector: 'app-connectivity-banner',
    standalone: true,
    imports: [CommonModule, ButtonModule],
    template: `
        <div
            *ngIf="mostrandoOffline()"
            class="fixed inset-x-0 top-0 z-[2000] flex justify-center px-4 pt-3 pointer-events-none"
        >
            <div
                class="pointer-events-auto flex items-center gap-3 rounded-lg bg-amber-500 text-white px-4 py-2 shadow-lg text-sm"
            >
                <i class="pi pi-wifi text-base"></i>
                <span>Sin conexión a internet. Verifica tu conexión y vuelve a intentar.</span>
                <p-button
                    label="Reintentar"
                    severity="contrast"
                    text
                    size="small"
                    (onClick)="reintentar()"
                />
            </div>
        </div>

        <div
            *ngIf="mostrandoReconexion()"
            class="fixed inset-x-0 top-0 z-[2000] flex justify-center px-4 pt-3 pointer-events-none"
        >
            <div
                class="pointer-events-auto flex items-center gap-3 rounded-lg bg-green-500 text-white px-4 py-2 shadow-lg text-sm"
            >
                <i class="pi pi-check-circle text-base"></i>
                <span>Conexión restablecida. Ya tienes internet de nuevo.</span>
            </div>
        </div>
    `,
})
export class AppConnectivityBanner {
    connectivity = inject(ConnectivityService);
    mostrandoOffline = signal(false);
    mostrandoReconexion = signal(false);
    private destroyRef = inject(DestroyRef);
    private timerReconexion: ReturnType<typeof setTimeout> | undefined;
    private timerOffline: ReturnType<typeof setTimeout> | undefined;

    constructor() {
        let prevOnline = this.connectivity.isOnline();

        effect(() => {
            const online = this.connectivity.isOnline();

            if (!online) {
                // Si pasa a offline, esperar DEBOUNCE_OFFLINE_MS antes de mostrar el banner
                // para evitar falsas alarmas durante cambios rápidos de app o bloqueo de pantalla
                clearTimeout(this.timerOffline);
                this.timerOffline = setTimeout(() => {
                    if (!this.connectivity.isOnline()) {
                        this.mostrandoOffline.set(true);
                    }
                }, DEBOUNCE_OFFLINE_MS);
            } else {
                // Al volver online
                clearTimeout(this.timerOffline);
                const estabaMostrandoOffline = this.mostrandoOffline();
                this.mostrandoOffline.set(false);

                // Solo mostrar "Conexión restablecida" si realmente se le mostró el banner de desconexión
                if (estabaMostrandoOffline && !prevOnline) {
                    this.mostrandoReconexion.set(true);
                    clearTimeout(this.timerReconexion);
                    this.timerReconexion = setTimeout(
                        () => this.mostrandoReconexion.set(false),
                        RECONEXION_BANNER_MS,
                    );
                }
            }
            prevOnline = online;
        });

        this.destroyRef.onDestroy(() => {
            clearTimeout(this.timerOffline);
            clearTimeout(this.timerReconexion);
        });
    }

    reintentar() {
        void this.connectivity.checkNow();
    }
}
