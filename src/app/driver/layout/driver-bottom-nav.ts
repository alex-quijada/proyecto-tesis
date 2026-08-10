import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { DriverStoreService } from '../services/driver-store.service';

@Component({
    selector: 'app-driver-bottom-nav',
    standalone: true,
    imports: [CommonModule, RouterModule],
    template: `
        <div
            class="fixed bottom-0 left-0 right-0 bg-white dark:bg-surface-800 border-t border-surface-200 dark:border-surface-700 px-2 py-1.5 z-20 shadow-lg"
        >
            <div class="flex items-center justify-around">
                <a
                    routerLink="/driver/home"
                    routerLinkActive="active"
                    class="flex flex-col items-center gap-0.5 cursor-pointer px-3 py-1 rounded-lg transition-colors min-w-0 relative"
                >
                    <div class="relative">
                        <i class="pi pi-home text-xl"></i>
                        @if (store.pendingGuiasCount() > 0) {
                            <span
                                class="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1"
                                >{{ store.pendingGuiasCount() }}</span
                            >
                        }
                    </div>
                    <span class="text-xs font-medium">Home</span>
                </a>
                <a
                    routerLink="/driver/ruta"
                    routerLinkActive="active"
                    class="flex flex-col items-center gap-0.5 cursor-pointer px-3 py-1 rounded-lg transition-colors min-w-0"
                >
                    <i class="pi pi-list text-xl"></i>
                    <span class="text-xs font-medium">Ruta</span>
                </a>
                <a
                    routerLink="/driver/mapa"
                    routerLinkActive="active"
                    class="flex flex-col items-center gap-0.5 cursor-pointer px-3 py-1 rounded-lg transition-colors min-w-0"
                >
                    <i class="pi pi-map text-xl"></i>
                    <span class="text-xs font-medium">Mapa</span>
                </a>
                <a
                    routerLink="/driver/historial"
                    routerLinkActive="active"
                    class="flex flex-col items-center gap-0.5 cursor-pointer px-3 py-1 rounded-lg transition-colors min-w-0"
                >
                    <i class="pi pi-history text-xl"></i>
                    <span class="text-xs font-medium">Historial</span>
                </a>
            </div>
        </div>
    `,
    styles: `
        a.active {
            color: var(--p-primary-color);
            background: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
        }
        a:not(.active) {
            color: var(--p-surface-400);
        }
        a:not(.active):hover {
            color: var(--p-surface-600);
        }
    `,
})
export class DriverBottomNav {
    store = inject(DriverStoreService);
}
