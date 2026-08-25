import { Component, input, model, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TabsModule } from 'primeng/tabs';
import { TableModule } from 'primeng/table';
import { ScrollPanelModule } from 'primeng/scrollpanel';
import { DividerModule } from 'primeng/divider';

import { Vehiculo } from '../data/vehiculos-mock';
import { MantenimientoService } from '../mantenimiento/service/mantenimiento.service';
import { TipoVehiculoIconoPipe } from '../pipes/tipo-vehiculo-icono.pipe';

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
        TipoVehiculoIconoPipe,
    ],
    templateUrl: './vehiculo-detalle-dialog.component.html',
})
export class VehiculoDetalleDialogComponent {
    private mantenimientoService = inject(MantenimientoService);

    visible = model<boolean>(false);
    vehiculo = input<Vehiculo>({});

    mantenimientos: any[] = [];
    activeTab = '0';
    getSeverity(estado?: string) {
        switch ((estado || '').toUpperCase()) {
            case 'OPERATIVO':
                return 'success';
            case 'MANTENIMIENTO':
                return 'warn';
            case 'INACTIVO':
                return 'danger';
            default:
                return 'info';
        }
    }

    getEstadoLabel(estado?: string): string {
        if (!estado) return '';
        return estado.charAt(0).toUpperCase() + estado.slice(1).toLowerCase();
    }
    getLabelCaja(tipo?: string) {
        switch (tipo) {
            case 'SECA':
                return 'Caja Seca';
            case 'PLATAFORMA':
                return 'Plataforma Abierta';
            case 'REFRIGERADO':
                return 'Refrigerado';
            case 'ARTICULADO':
                return 'Articulado';
            default:
                return 'No Definido';
        }
    }

    getSeverityCaja(tipo?: string) {
        switch (tipo) {
            case 'SECA':
                return 'secondary';
            case 'PLATAFORMA':
                return 'warn';
            case 'REFRIGERADO':
                return 'secondary';
            case 'ARTICULADO':
                return 'secondary';
            default:
                return 'info';
        }
    }

    getSeverityEstadoMtto(estado: string) {
        switch (estado) {
            case 'PROGRAMADO':
                return 'info';
            case 'EN_PROCESO':
                return 'warn';
            case 'REALIZADO':
                return 'success';
            case 'CANCELADO':
                return 'danger';
            default:
                return 'secondary';
        }
    }

    constructor() {
        effect(async () => {
            const v = this.vehiculo();
            this.activeTab = '0';
            const idVehiculo = v?.id_vehiculo || v?.id;
            if (!idVehiculo) {
                this.mantenimientos = [];
                return;
            }
            try {
                const lista = await this.mantenimientoService.obtenerMantenimientos(idVehiculo);
                this.mantenimientos = lista.map((m) => ({
                    ...m,
                    tipoLabel: m.tipo === 'PREVENTIVO' ? 'Preventivo' : 'Correctivo',
                    estadoLabel:
                        m.estado === 'EN_PROCESO'
                            ? 'En Proceso'
                            : m.estado.charAt(0) + m.estado.slice(1).toLowerCase(),
                }));
            } catch {
                this.mantenimientos = [];
            }
        });
    }

    hideDialog() {
        this.visible.set(false);
    }
}
