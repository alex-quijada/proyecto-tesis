import { Component, inject, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';

import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { DriverStoreService } from '../../services/driver-store.service';
import { Entrega } from '../../services/driver-store.service';
import { FirmaDialogComponent } from '../../components/firma-dialog/firma-dialog.component';

@Component({
    selector: 'app-ruta',
    standalone: true,
    imports: [CommonModule, ButtonModule, TagModule, TooltipModule, FirmaDialogComponent],
    templateUrl: './ruta.component.html',
})
export class RutaComponent {
    store = inject(DriverStoreService);
    private messageService = inject(MessageService);

    selectedGuia = signal<Entrega | null>(null);
    firmaGuia = signal<Entrega | null>(null);

    @ViewChild(FirmaDialogComponent) private firmaDialog!: FirmaDialogComponent;

    toggleSelectedGuia(g: Entrega) {
        this.selectedGuia.set(this.selectedGuia()?.id === g.id ? null : g);
    }

    abrirFirma(entrega: Entrega) {
        this.firmaGuia.set(entrega);
        if (this.firmaDialog) {
            this.firmaDialog.guia = entrega;
            this.firmaDialog.open();
        }
    }

    onFirmaCancelada() {
        this.firmaGuia.set(null);
    }

    async onFirmaConfirmada(event: { firma: string; observaciones: string }) {
        const entrega = this.firmaGuia();
        if (!entrega) return;

        try {
            await this.store.finalizarEntrega(entrega, event.firma, event.observaciones);
            this.selectedGuia.set(null);
            this.messageService.add({
                severity: 'success',
                summary: 'Entrega completada',
                detail: `${entrega.cliente} — ${entrega.numeroFactura || entrega.numeroGuia}`,
            });
        } catch (err: any) {
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo guardar la entrega.',
            });
        } finally {
            this.firmaGuia.set(null);
        }
    }
}
