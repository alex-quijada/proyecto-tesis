import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { TagModule } from 'primeng/tag';

import { DriverStoreService } from '../services/driver-store.service';
import { CapitalizePipe } from '../pipes/capitalize.pipe';

@Component({
    selector: 'app-driver-topbar',
    standalone: true,
    imports: [CommonModule, CapitalizePipe, TagModule],
    template: `
        <div
            class="bg-white dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700 px-4"
        >
            @if (esMapa()) {
                <div class="flex items-center justify-between gap-2 py-3">
                    <!-- Cambiado de h1 a div para evitar conflictos de estilos globales -->
                    <div
                        class="min-w-0 truncate text-lg font-semibold text-surface-600 dark:text-surface-100"
                    >
                        Mapa del viaje
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0 ml-3">
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
                        @if (viajeEnProceso()) {
                            <p-tag
                                value="En proceso"
                                severity="warn"
                                icon="pi pi-route"
                                styleClass="!text-xs"
                            />
                        }
                    </div>
                </div>
            } @else {
                <div class="flex items-center justify-between py-3">
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
                            <i class="pi pi-user" style="font-size: 1.5rem"></i>
                        </div>
                    </div>
                </div>
            }
        </div>
    `,
})
export class DriverTopbar {
    store = inject(DriverStoreService);
    private router = inject(Router);

    readonly esMapa = signal(this.router.url.startsWith('/driver/mapa'));
    readonly viajeEnProceso = computed(() => this.store.viajesChofer()[0]?.estado === 'proceso');

    constructor() {
        this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
            if (event instanceof NavigationEnd) {
                this.esMapa.set(event.url.startsWith('/driver/mapa'));
            }
        });
    }

    irAPerfil() {
        this.router.navigate(['/driver/perfil']);
    }
}
