import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, RouterModule } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

import { DriverStoreService } from '../services/driver-store.service';
import { NavigationService } from '../services/navigation.service';
import { DriverTopbar } from './driver-topbar';
import { DriverBottomNav } from './driver-bottom-nav';

@Component({
    selector: 'app-driver-layout',
    standalone: true,
    imports: [CommonModule, RouterModule, ToastModule, DriverTopbar, DriverBottomNav],
    providers: [MessageService, DriverStoreService, NavigationService],
    template: `
        <div
            class="min-h-screen pb-20"
            [class.bg-surface-50]="!fondoMapa()"
            [class.dark:bg-surface-950]="!fondoMapa()"
        >
            <p-toast position="top-center" />
            @if (mostrarTopbar()) {
                <app-driver-topbar />
            }
            <router-outlet />
            <app-driver-bottom-nav />
        </div>
    `,
})
export class DriverLayout implements OnInit {
    private router = inject(Router);
    private store = inject(DriverStoreService);

    mostrarTopbar = signal(true);
    // El mapa nativo (Android) se dibuja debajo del WebView: sin fondo opaco.
    fondoMapa = signal(false);

    ngOnInit() {
        this.store.cargarDatos();

        this.router.events.subscribe((event) => {
            if (event instanceof NavigationEnd) {
                const esPerfil = event.url.startsWith('/driver/perfil');
                this.mostrarTopbar.set(!esPerfil);
                this.fondoMapa.set(event.url.startsWith('/driver/mapa'));
            }
        });
    }
}
