import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-notfound',
    standalone: true,
    imports: [CommonModule, RouterModule, ButtonModule],
    template: `
        <div
            class="bg-surface-50 dark:bg-surface-950 flex items-center justify-center min-h-screen min-w-screen p-4"
        >
            <div class="w-full max-w-xl">
                <div
                    class="bg-surface-0 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-3xl p-8 sm:p-12 shadow-xl text-center"
                >
                    <!-- Badge 404 -->
                    <div
                        class="w-20 h-20 rounded-3xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mx-auto mb-6"
                    >
                        <span class="text-3xl font-extrabold">404</span>
                    </div>

                    <span
                        class="text-xs uppercase font-bold tracking-wider text-primary bg-primary/10 px-3 py-1 rounded-full"
                        >Página no encontrada</span
                    >

                    <h1
                        class="text-3xl sm:text-4xl font-extrabold text-surface-900 dark:text-surface-0 mt-4 mb-3"
                    >
                        Ruta Inexistente
                    </h1>

                    <p
                        class="text-surface-600 dark:text-surface-400 text-sm sm:text-base leading-relaxed mb-8 max-w-md mx-auto"
                    >
                        El enlace o recurso al que intentas acceder no existe, ha sido movido o no
                        se encuentra disponible.
                    </p>

                    <!-- Accesos Rápidos del Sistema -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8 text-left">
                        <a
                            routerLink="/"
                            class="p-4 rounded-2xl bg-surface-50 dark:bg-surface-800/60 border border-surface-200 dark:border-surface-700/60 hover:border-primary/50 transition-all flex items-center gap-3 group cursor-pointer"
                        >
                            <div
                                class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-surface-0 transition-colors"
                            >
                                <i class="pi pi-home text-lg"></i>
                            </div>
                            <div>
                                <div class="font-bold text-sm text-surface-900 dark:text-surface-0">
                                    Inicio
                                </div>
                                <div class="text-xs text-muted-color">Portal de acceso</div>
                            </div>
                        </a>

                        <a
                            routerLink="/app/rutas/seguimiento"
                            class="p-4 rounded-2xl bg-surface-50 dark:bg-surface-800/60 border border-surface-200 dark:border-surface-700/60 hover:border-primary/50 transition-all flex items-center gap-3 group cursor-pointer"
                        >
                            <div
                                class="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-surface-0 transition-colors"
                            >
                                <i class="pi pi-map text-lg"></i>
                            </div>
                            <div>
                                <div class="font-bold text-sm text-surface-900 dark:text-surface-0">
                                    Monitoreo GPS
                                </div>
                                <div class="text-xs text-muted-color">Seguimiento en vivo</div>
                            </div>
                        </a>

                        <a
                            routerLink="/app/rutas/carga"
                            class="p-4 rounded-2xl bg-surface-50 dark:bg-surface-800/60 border border-surface-200 dark:border-surface-700/60 hover:border-primary/50 transition-all flex items-center gap-3 group cursor-pointer"
                        >
                            <div
                                class="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center group-hover:bg-purple-500 group-hover:text-surface-0 transition-colors"
                            >
                                <i class="pi pi-truck text-lg"></i>
                            </div>
                            <div>
                                <div class="font-bold text-sm text-surface-900 dark:text-surface-0">
                                    Gestión de Rutas
                                </div>
                                <div class="text-xs text-muted-color">Carga y despacho</div>
                            </div>
                        </a>

                        <a
                            routerLink="/app/flota/vehiculos"
                            class="p-4 rounded-2xl bg-surface-50 dark:bg-surface-800/60 border border-surface-200 dark:border-surface-700/60 hover:border-primary/50 transition-all flex items-center gap-3 group cursor-pointer"
                        >
                            <div
                                class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-surface-0 transition-colors"
                            >
                                <i class="pi pi-wrench text-lg"></i>
                            </div>
                            <div>
                                <div class="font-bold text-sm text-surface-900 dark:text-surface-0">
                                    Flota Vehicular
                                </div>
                                <div class="text-xs text-muted-color">Mantenimiento y control</div>
                            </div>
                        </a>
                    </div>

                    <!-- Botón de retorno -->
                    <div class="flex items-center justify-center gap-3">
                        <p-button
                            label="Volver a la Página Anterior"
                            icon="pi pi-arrow-left"
                            (onClick)="volver()"
                            [outlined]="true"
                            severity="secondary"
                            [rounded]="true"
                        />
                    </div>
                </div>
            </div>
        </div>
    `,
})
export class Notfound {
    volver() {
        window.history.back();
    }
}
