import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmationService, MessageService } from 'primeng/api';

import { VehiculoDetalleDialogComponent } from './components/vehiculo-detalle-dialog.component';
import { VehiculoDialogComponent } from './components/vehiculo-dialog/vehiculo-dialog.component';
import { Vehiculo } from './data/vehiculos-mock';
import { VehiculoService } from './service/vehiculo.service';
import { TipoVehiculoIconoPipe } from './pipes/tipo-vehiculo-icono.pipe';
import { TipoCajaLabelPipe } from './pipes/tipo-caja-label.pipe';

// PrimeNG
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ToolbarModule } from 'primeng/toolbar';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';

@Component({
    selector: 'app-vehiculos',
    standalone: true,
    imports: [
        CommonModule,
        TableModule,
        ButtonModule,
        ToastModule,
        ToolbarModule,
        InputTextModule,
        TagModule,
        IconFieldModule,
        InputIconModule,
        ConfirmDialogModule,
        TooltipModule,
        VehiculoDialogComponent,
        VehiculoDetalleDialogComponent,
        TipoVehiculoIconoPipe,
        TipoCajaLabelPipe,
    ],
    providers: [ConfirmationService, MessageService],
    templateUrl: './vehiculos.component.html',
})
export class VehiculosComponent implements OnInit {
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);
    private vehiculoService = inject(VehiculoService);

    vehiculos = signal<Vehiculo[]>([]);
    vehiculoSelected = signal<Vehiculo[]>([]);

    isDialogOpen = signal<boolean>(false);
    vehiculoParaModificar = signal<Vehiculo>({});

    isDetalleDialogOpen = signal<boolean>(false);
    vehiculoParaDetalle = signal<Vehiculo>({});

    loading = false;

    ngOnInit() {
        this.cargarVehiculos();
    }

    async cargarVehiculos() {
        this.loading = true;
        try {
            const data = await this.vehiculoService.obtenerVehiculos();
            this.vehiculos.set(data);
        } catch (error: any) {
            console.error('Error al cargar vehículos:', error);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: error.message || 'No se pudieron cargar los vehículos',
                life: 5000,
            });
            this.vehiculos.set([]);
        } finally {
            this.loading = false;
        }
    }

    openNew() {
        this.vehiculoParaModificar.set({
            tipo: 'CARRO',
            tipoCaja: 'SECA',
            capacidadPallets: 0,
            pesoMaximo: 0,
            estado: 'OPERATIVO',
        });
        this.isDialogOpen.set(true);
    }

    editVehiculo(vehiculo: Vehiculo) {
        this.vehiculoParaModificar.set({ ...vehiculo });
        this.isDialogOpen.set(true);
    }

    verDetalle(vehiculo: Vehiculo, tab?: string) {
        this.vehiculoParaDetalle.set({ ...vehiculo });
        this.isDetalleDialogOpen.set(true);
    }

    handleSaveVehiculo() {
        this.cargarVehiculos();
    }

    deleteVehiculo(vehiculo: Vehiculo) {
        this.confirmationService.confirm({
            message: `¿Estás seguro de que deseas desincorporar la unidad con placa ${vehiculo.placa}?`,
            header: 'Confirmar Eliminación',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Eliminar', severity: 'danger' },
            accept: async () => {
                try {
                    await this.vehiculoService.eliminarVehiculo(
                        vehiculo.id_vehiculo || vehiculo.id || '',
                    );
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Completado',
                        detail: 'Unidad removida',
                        life: 3000,
                    });
                    await this.cargarVehiculos();
                } catch (error: any) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: error.message || 'No se pudo eliminar el vehículo',
                        life: 5000,
                    });
                }
            },
        });
    }

    deleteSelectedVehiculos() {
        this.confirmationService.confirm({
            message: '¿Estás seguro de borrar todas las unidades seleccionadas?',
            header: 'Eliminación Masiva',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Eliminar Todo', severity: 'danger' },
            accept: async () => {
                try {
                    const ids = this.vehiculoSelected().map((v) => v.id_vehiculo || v.id || '');
                    for (const id of ids) {
                        await this.vehiculoService.eliminarVehiculo(id);
                    }
                    this.vehiculoSelected.set([]);
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Completado',
                        detail: 'Flota actualizada',
                        life: 3000,
                    });
                    await this.cargarVehiculos();
                } catch (error: any) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: error.message || 'Error al eliminar vehículos',
                        life: 5000,
                    });
                }
            },
        });
    }
    getSeverity(estado: string) {
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

    getEstadoLabel(estado: string): string {
        if (!estado) return '';
        return estado.charAt(0).toUpperCase() + estado.slice(1).toLowerCase();
    }
    getSeverityCaja(tipo: string) {
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
}
