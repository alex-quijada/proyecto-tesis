import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DrawerModule } from 'primeng/drawer';

import { DriverStoreService } from '../../services/driver-store.service';
import { Entrega, GuiaPendiente } from '../../services/driver-store.service';

@Component({
    selector: 'app-home',
    standalone: true,
    imports: [CommonModule, ButtonModule, TagModule, DrawerModule],
    templateUrl: './home.component.html',
    styles: [
        `
            .guia-drawer .p-drawer {
                border-radius: 1rem 0 0 1rem;
                width: 85vw;
                max-width: 380px;
            }
            .guia-drawer .p-drawer-content {
                padding: 1rem;
                overflow-y: auto;
            }
        `,
    ],
})
export class HomeComponent {
    store = inject(DriverStoreService);
    private router = inject(Router);

    guiaSeleccionada = signal<GuiaPendiente | null>(null);
    drawerVisible = signal(false);
    selectedHistory = signal<Entrega | null>(null);

    totalFacturas(guia: GuiaPendiente): number {
        return guia.facturas.reduce((sum, f) => sum + (f.precioCarga || 0), 0);
    }

    irARuta() {
        this.router.navigate(['/driver/ruta']);
    }

    irAHistorial() {
        this.router.navigate(['/driver/historial']);
    }

    abrirGuia(guia: GuiaPendiente) {
        this.guiaSeleccionada.set(guia);
        this.drawerVisible.set(true);
    }

    verGuiaCompleta() {
        const guia = this.guiaSeleccionada();
        if (!guia) return;
        this.drawerVisible.set(false);
        this.router.navigate(['/driver/guia', guia.id]);
    }

    toggleHistory(g: Entrega) {
        this.selectedHistory.set(this.selectedHistory()?.id === g.id ? null : g);
    }
}
