import { Component, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ButtonModule } from 'primeng/button';
import { ConnectivityService } from '@/app/services/connectivity.service';

@Component({
    selector: 'app-connectivity-banner',
    standalone: true,
    imports: [CommonModule, ToastModule, ButtonModule],
    providers: [MessageService],
    template: `
        <p-toast />
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
    `,
})
export class AppConnectivityBanner {
    connectivity = inject(ConnectivityService);
    private messageService = inject(MessageService);

    constructor() {
        let prevOnline = this.connectivity.isOnline();
        effect(() => {
            const online = this.connectivity.isOnline();
            if (online && !prevOnline) {
                this.messageService.add({
                    severity: 'success',
                    summary: 'Conexión restablecida',
                    detail: 'Tu conexión a internet está activa de nuevo.',
                    life: 3000,
                });
            }
            prevOnline = online;
        });
    }

    reintentar() {
        void this.connectivity.checkNow();
    }
}
