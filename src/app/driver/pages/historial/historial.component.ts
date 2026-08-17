import { Component, inject, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';

import { DriverStoreService } from '../../services/driver-store.service';
import { Entrega } from '../../services/driver-store.service';
import {
    IncidenciaDialogComponent,
    IncidenciaGuia,
} from '../../components/incidencia-dialog/incidencia-dialog.component';

@Component({
    selector: 'app-historial',
    standalone: true,
    imports: [CommonModule, ButtonModule, IncidenciaDialogComponent],
    templateUrl: './historial.component.html',
})
export class HistorialComponent {
    store = inject(DriverStoreService);
    private messageService = inject(MessageService);

    historialFiltro = signal<'todas' | 'finalizadas' | 'canceladas' | 'incidencias'>('todas');
    municipioFiltro = signal<string>('todas');
    selectedGuia = signal<Entrega | null>(null);

    incidenciaGuia = signal<Entrega | null>(null);
    readonly incidenciaGuiaData = computed<IncidenciaGuia | null>(() => {
        const g = this.incidenciaGuia();
        return g
            ? {
                  cliente: g.cliente,
                  numeroGuia: g.numeroGuia,
                  numeroFactura: g.numeroFactura,
              }
            : null;
    });

    @ViewChild(IncidenciaDialogComponent) private incidenciaDialog!: IncidenciaDialogComponent;

    get historialFiltradas(): Entrega[] {
        const f = this.historialFiltro();
        const m = this.municipioFiltro();
        let lista = this.store.guiasCompletadas();
        if (m !== 'todas') lista = lista.filter((g) => g.ruta === m);
        switch (f) {
            case 'finalizadas':
                lista = lista.filter((g) => g.estado === 'finalizado');
                break;
            case 'canceladas':
                lista = lista.filter((g) => g.estado === 'cancelado');
                break;
            case 'incidencias':
                lista = lista.filter(
                    (g) => g.incidencia !== undefined || g.tuvoDevolucion || !!g.observaciones,
                );
                break;
        }
        return [...lista].reverse();
    }

    setHistorialFiltro(f: string) {
        this.historialFiltro.set(f as any);
        this.selectedGuia.set(null);
    }

    setMunicipioFiltro(m: string) {
        this.municipioFiltro.set(m);
        this.selectedGuia.set(null);
    }

    toggleSelectedGuia(g: Entrega) {
        this.selectedGuia.set(this.selectedGuia()?.id === g.id ? null : g);
    }

    abrirIncidencia(g: Entrega) {
        this.incidenciaGuia.set(g);
        this.incidenciaDialog.guia = this.incidenciaGuiaData();
        this.incidenciaDialog.open();
    }

    cerrarIncidencia() {
        this.incidenciaGuia.set(null);
    }

    async onIncidenciaConfirmada(texto: string) {
        const g = this.incidenciaGuia();
        if (!g) return;
        try {
            await this.store.reportarIncidencia(g.id, texto);
            this.messageService.add({
                severity: 'warn',
                summary: 'Incidencia reportada',
                detail: `${g.cliente} — ${g.numeroGuia || g.numeroFactura}`,
            });
        } catch (err: any) {
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo reportar la incidencia.',
            });
        } finally {
            this.cerrarIncidencia();
        }
    }
}
