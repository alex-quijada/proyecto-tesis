import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

import { DriverStoreService } from '../../services/driver-store.service';
import { Entrega, GuiaPendiente } from '../../services/driver-store.service';

@Component({
    selector: 'app-home',
    standalone: true,
    imports: [CommonModule, ButtonModule, TagModule],
    templateUrl: './home.component.html',
})
export class HomeComponent {
    store = inject(DriverStoreService);
    private router = inject(Router);

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
        this.router.navigate(['/driver/guia', guia.id]);
    }

    toggleHistory(g: Entrega) {
        this.selectedHistory.set(this.selectedHistory()?.id === g.id ? null : g);
    }
}
