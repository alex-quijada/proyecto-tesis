import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, RouterModule } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

import { DriverStoreService } from '../services/driver-store.service';
import { DriverTopbar } from './driver-topbar';
import { DriverBottomNav } from './driver-bottom-nav';

@Component({
    selector: 'app-driver-layout',
    standalone: true,
    imports: [CommonModule, RouterModule, ToastModule, DriverTopbar, DriverBottomNav],
    providers: [MessageService, DriverStoreService],
    template: `
        <div class="min-h-screen bg-surface-50 dark:bg-surface-950 pb-20">
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

    ngOnInit() {
        this.store.cargarDatos();

        this.router.events.subscribe((event) => {
            if (event instanceof NavigationEnd) {
                const esPerfil = event.url.startsWith('/driver/perfil');
                this.mostrarTopbar.set(!esPerfil);
            }
        });
    }
}
