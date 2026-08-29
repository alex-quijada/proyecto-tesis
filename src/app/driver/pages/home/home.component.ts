import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule } from 'primeng/tooltip';

import { DriverStoreService } from '../../services/driver-store.service';
import { Entrega, GuiaPendiente } from '../../services/driver-store.service';
import { CombustibleChoferDialogComponent } from './components/combustible-chofer-dialog.component';

@Component({
    selector: 'app-home',
    standalone: true,
    imports: [
        CommonModule,
        ButtonModule,
        TagModule,
        SkeletonModule,
        TooltipModule,
        CombustibleChoferDialogComponent,
    ],
    templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {
    store = inject(DriverStoreService);
    private router = inject(Router);

    selectedHistory = signal<Entrega | null>(null);
    combustibleDialogVisible = signal(false);

    ngOnInit() {
        void this.store.verificarDatosAlEntrar();
    }

    abrirCombustibleDialog() {
        this.combustibleDialogVisible.set(true);
    }

    refrescar() {
        void this.store.refrescarTodo();
    }

    /** Texto relativo "actualizado hace X" basado en ultimaActualizacion. */
    actualizadoHace(): string {
        const ultima = this.store.ultimaActualizacion();
        if (!ultima) return '';
        const diff = Math.max(0, this.store.now().getTime() - ultima.getTime());
        const seg = Math.floor(diff / 1000);
        if (seg < 60) return 'Actualizado hace segundos';
        const min = Math.floor(seg / 60);
        if (min < 60) return `Actualizado hace ${min} min`;
        const hrs = Math.floor(min / 60);
        return `Actualizado hace ${hrs} h`;
    }

    totalFacturas(guia: GuiaPendiente): number {
        return guia.facturas.reduce((sum, f) => sum + (f.precioCarga || 0), 0);
    }

    crearAutomaticamente() {
        this.router.navigate(['/driver/ruta'], { queryParams: { modo: 'auto' } });
    }

    crearManualmente() {
        this.router.navigate(['/driver/ruta'], { queryParams: { modo: 'manual' } });
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
