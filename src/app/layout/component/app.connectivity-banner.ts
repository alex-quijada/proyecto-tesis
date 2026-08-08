import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ConnectivityService } from '@/app/services/connectivity.service';

const RECONEXION_BANNER_MS = 4000;

@Component({
    selector: 'app-connectivity-banner',
    standalone: true,
    imports: [CommonModule, ButtonModule],
    template: `
        <div
            *ngIf="!connectivity.isOnline()"
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
    mostrandoReconexion = signal(false);
    private destroyRef = inject(DestroyRef);
    private timer: ReturnType<typeof setTimeout> | undefined;

    constructor() {
        let prevOnline = this.connectivity.isOnline();
        effect(() => {
            const online = this.connectivity.isOnline();
            if (online && !prevOnline) {
                this.mostrandoReconexion.set(true);
                clearTimeout(this.timer);
                this.timer = setTimeout(
                    () => this.mostrandoReconexion.set(false),
                    RECONEXION_BANNER_MS,
                );
            }
            prevOnline = online;
        });

        this.destroyRef.onDestroy(() => clearTimeout(this.timer));
    }

    reintentar() {
        void this.connectivity.checkNow();
    }
}
