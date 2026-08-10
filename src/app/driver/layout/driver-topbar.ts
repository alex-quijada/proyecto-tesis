import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { DriverStoreService } from '../services/driver-store.service';
import { CapitalizePipe } from '../pipes/capitalize.pipe';

@Component({
    selector: 'app-driver-topbar',
    standalone: true,
    imports: [CommonModule, CapitalizePipe],
    template: `
        <div
            class="bg-white dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700 px-4 py-3"
        >
            <div class="flex items-center justify-between">
                <div class="min-w-0">
                    <div class="text-base text-surface-500 font-medium">¡Bienvenido!</div>
                    <div
                        class="text-lg font-semibold text-surface-800 dark:text-surface-100 truncate"
                    >
                        {{ store.driverInfo()?.nombre || 'Chofer' | capitalize }}
                    </div>
                </div>
                <div class="flex items-center gap-3 flex-shrink-0 ml-3">
                    @if (store.vehiculoPrincipal(); as v) {
                        <div
                            class="flex items-center gap-1.5 bg-surface-100 dark:bg-surface-700 rounded-full px-3 py-1.5"
                        >
                            <i class="pi pi-truck text-xs text-surface-400"></i>
                            <span
                                class="text-sm font-semibold text-surface-600 dark:text-surface-300 whitespace-nowrap"
                                >{{ v.placa }}</span
                            >
                        </div>
                    }
                    <div
                        class="w-11 h-11 rounded-full bg-primary/10 dark:bg-primary-900/30 text-primary flex items-center justify-center text-base font-bold flex-shrink-0 cursor-pointer border-2 border-primary/20"
                        (click)="irAPerfil()"
                    >
                        {{ (store.driverInfo()?.nombre || 'C').charAt(0) }}
                    </div>
                </div>
            </div>
        </div>
    `,
})
export class DriverTopbar {
    store = inject(DriverStoreService);
    private router = inject(Router);

    irAPerfil() {
        this.router.navigate(['/driver/perfil']);
    }
}
