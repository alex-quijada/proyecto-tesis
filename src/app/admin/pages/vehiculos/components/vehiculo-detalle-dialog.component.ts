import { Component, input, model, effect } from '@angular/core';
import { CommonModule } from '@angular/common';

import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TabsModule } from 'primeng/tabs';
import { TableModule } from 'primeng/table';
import { ScrollPanelModule } from 'primeng/scrollpanel';
import { DividerModule } from 'primeng/divider';

import { Vehiculo } from '../data/vehiculos-mock';
import { MANTENIMIENTOS_MOCK } from '../mantenimiento/data/mantenimiento-mock';

@Component({
    selector: 'app-vehiculo-detalle-dialog',
    standalone: true,
    imports: [
        CommonModule,
        DialogModule,
        ButtonModule,
        TagModule,
        TabsModule,
        TableModule,
        ScrollPanelModule,
        DividerModule,
    ],
    templateUrl: './vehiculo-detalle-dialog.component.html'
})
export class VehiculoDetalleDialogComponent {
    visible = model<boolean>(false);
    vehiculo = input<Vehiculo>({});

    mantenimientos: any[] = [];
    activeTab = '0';

    getSeverity(estado?: string) {
        switch (estado) {
            case 'OPERATIVO': return 'success';
            case 'MANTENIMIENTO': return 'warn';
            case 'INACTIVO': return 'danger';
            default: return 'info';
        }
    }

    getLabelCaja(tipo?: string) {
        switch (tipo) {
            case 'SECA': return 'Caja Seca';
            case 'PLATAFORMA': return 'Plataforma Abierta';
            case 'REFRIGERADO': return 'Refrigerado';
            case 'ARTICULADO': return 'Articulado';
            default: return 'No Definido';
        }
    }

    getSeverityCaja(tipo?: string) {
        switch (tipo) {
            case 'REFRIGERADO': return 'info';
            case 'SECA': return 'secondary';
            case 'PLATAFORMA': return 'warn';
            case 'ARTICULADO': return 'secondary';
            default: return 'info';
        }
    }

    getSeverityEstadoMtto(estado: string) {
        switch (estado) {
            case 'PROGRAMADO': return 'info';
            case 'EN_PROCESO': return 'warn';
            case 'REALIZADO': return 'success';
            case 'CANCELADO': return 'danger';
            default: return 'secondary';
        }
    }

    constructor() {
        effect(() => {
            const v = this.vehiculo();
            if (v?.id) {
                this.mantenimientos = MANTENIMIENTOS_MOCK
                    .filter(m => m.idVehiculo === v.id)
                    .map(m => ({
                        ...m,
                        tipoLabel: m.tipo === 'PREVENTIVO' ? 'Preventivo' : 'Correctivo',
                        estadoLabel: m.estado === 'EN_PROCESO' ? 'En Proceso' : m.estado.charAt(0) + m.estado.slice(1).toLowerCase(),
                    }));
            } else {
                this.mantenimientos = [];
            }
            this.activeTab = '0';
        });
    }

    hideDialog() {
        this.visible.set(false);
    }
}
