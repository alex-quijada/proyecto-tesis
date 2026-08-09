import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

import { DriverStoreService } from '../../services/driver-store.service';
import { Entrega } from '../../services/driver-store.service';

@Component({
    selector: 'app-home',
    standalone: true,
    imports: [CommonModule, ButtonModule, TagModule],
    templateUrl: './home.component.html',
})
export class HomeComponent {
    store = inject(DriverStoreService);
    private router = inject(Router);

    guiaActivaExpandida = signal<string | null>(null);
    selectedHistory = signal<Entrega | null>(null);

    irARuta() {
        this.router.navigate(['/driver/ruta']);
    }

    irAHistorial() {
        this.router.navigate(['/driver/historial']);
    }

    toggleGuiaActiva(id: string) {
        this.guiaActivaExpandida.set(this.guiaActivaExpandida() === id ? null : id);
    }

    toggleHistory(g: Entrega) {
        this.selectedHistory.set(this.selectedHistory()?.id === g.id ? null : g);
    }
}
