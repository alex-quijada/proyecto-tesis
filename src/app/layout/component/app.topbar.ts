import { Component, computed, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { StyleClassModule } from 'primeng/styleclass';
import { AppConfigurator } from './app.configurator';
import { LayoutService } from '@/app/layout/service/layout.service';
import { AuthService } from '../../auth/service/auth.service';

@Component({
    selector: 'app-topbar',
    standalone: true,
    imports: [RouterModule, CommonModule, StyleClassModule, AppConfigurator],
    template: ` <div class="layout-topbar">
        <div class="layout-topbar-logo-container">
            <button
                class="layout-menu-button layout-topbar-action"
                (click)="layoutService.onMenuToggle()"
            >
                <i class="pi pi-bars"></i>
            </button>
            <a class="layout-topbar-logo flex items-center" routerLink="/app">
                <div class="w-15 h-15 shrink-0 rounded-xl flex items-center justify-center">
                    <img
                        src="/pictures/Brandia-icon.svg"
                        alt="BrandIA"
                        class="w-full h-full object-contain transition-[filter] duration-200"
                        [class.brightness-0]="layoutService.isDarkTheme()"
                        [class.invert]="layoutService.isDarkTheme()"
                    />
                </div>
                <span class="-ml-4">BrandIA</span>
            </a>
        </div>

        <!-- Mensaje de bienvenida (Oculto en móviles para no amontonar) -->
        <div class="hidden md:flex flex-col ml-4 leading-tight">
            <span class="text-color-secondary text-sm font-medium"
                >{{ saludo() }}, <b class="text-color">{{ nombreUsuario() | titlecase }}</b></span
            >
            <span class="text-xs text-muted-color capitalize">{{ fechaHoy }}</span>
        </div>

        <div class="layout-topbar-actions">
            <div class="layout-config-menu">
                <button type="button" class="layout-topbar-action" (click)="toggleDarkMode()">
                    <i
                        [ngClass]="{
                            'pi ': true,
                            'pi-moon': layoutService.isDarkTheme(),
                            'pi-sun': !layoutService.isDarkTheme(),
                        }"
                    ></i>
                </button>
                <div class="relative">
                    <button
                        class="layout-topbar-action layout-topbar-action-highlight"
                        pStyleClass="@next"
                        enterFromClass="hidden"
                        enterActiveClass="animate-scalein"
                        leaveToClass="hidden"
                        leaveActiveClass="animate-fadeout"
                        [hideOnOutsideClick]="true"
                    >
                        <i class="pi pi-palette"></i>
                    </button>
                    <app-configurator />
                </div>
            </div>

            <button type="button" class="layout-topbar-action" (click)="authService.logout()">
                <i class="pi pi-sign-out"></i>
            </button>
        </div>
    </div>`,
    styles: [
        `
            .layout-topbar-search {
                position: absolute;
                left: 50%;
                transform: translateX(-50%);
            }

            :ng-deep .user-menubar .p-menubar {
                background: transparent;
                border: none;
                padding: 0;
            }

            :ng-deep .user-menubar .p-menuitem-link {
                padding: 0.5rem !important;
            }

            .custom-user-menu {
                display: flex;
                align-items: center;
            }
            :ng-deep .layout-topbar-action.p-button-text {
                color: var(--text-color-secondary) !important;
                background: transparent !important;
                border: none !important;
            }

            :ng-deep .layout-topbar-action.p-button-text:hover {
                background: var(--surface-hover) !important;
                color: var(--text-color) !important;
            }
        `,
    ],
})
export class AppTopbar {
    layoutService = inject(LayoutService);
    authService = inject(AuthService);

    readonly saludo = computed(() => {
        const h = new Date().getHours();
        if (h < 12) return '¡Buenos días!';
        if (h < 19) return '¡Buenas tardes!';
        return '¡Buenas noches!';
    });

    readonly fechaHoy = new Date().toLocaleDateString('es-VE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    });

    readonly nombreUsuario = computed(
        () => this.authService.getCurrentUser()?.user_metadata?.['nombre_completo'] || 'Analista',
    );

    toggleDarkMode() {
        this.layoutService.layoutConfig.update((state) => ({
            ...state,
            darkTheme: !state.darkTheme,
        }));
    }
}
