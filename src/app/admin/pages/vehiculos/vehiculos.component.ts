import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfirmationService } from 'primeng/api';
import { NotificationService } from '@/app/services/notification.service';

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
import { SelectButtonModule } from 'primeng/selectbutton';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';

@Component({
    selector: 'app-vehiculos',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
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
        SkeletonModule,
        SelectButtonModule,
        SelectModule,
        VehiculoDialogComponent,
        VehiculoDetalleDialogComponent,
        TipoVehiculoIconoPipe,
        TipoCajaLabelPipe,
    ],
    providers: [ConfirmationService],
    templateUrl: './vehiculos.component.html',
})
export class VehiculosComponent implements OnInit {
    private notif = inject(NotificationService);
    private confirmationService = inject(ConfirmationService);
    private vehiculoService = inject(VehiculoService);

    vehiculos = signal<Vehiculo[]>([]);
    vehiculoSelected = signal<Vehiculo[]>([]);

    filtroEstado: 'activos' | 'inactivos' | 'todos' = 'activos';
    estadosFiltro = [
        { label: 'Activos', value: 'activos' },
        { label: 'Inactivos', value: 'inactivos' },
        { label: 'Todos', value: 'todos' },
    ];

    filtroTipo: string | null = null;
    tiposFiltro = [
        { label: 'Todos los tipos', value: null },
        { label: 'Camión de Carga', value: 'CAMION' },
        { label: 'Automóvil', value: 'CARRO' },
        { label: 'Motocicleta', value: 'MOTO' },
    ];

    get vehiculosFiltrados(): Vehiculo[] {
        let list = this.vehiculos();
        if (this.filtroTipo) {
            list = list.filter((v) => (v.tipo || '').toUpperCase() === this.filtroTipo);
        }
        if (this.filtroEstado === 'activos') {
            return list.filter((v) => (v.estado || '').toUpperCase() !== 'INACTIVO');
        }
        if (this.filtroEstado === 'inactivos') {
            return list.filter((v) => (v.estado || '').toUpperCase() === 'INACTIVO');
        }
        return list;
    }

    isDialogOpen = signal<boolean>(false);
    vehiculoParaModificar = signal<Vehiculo>({});

    isDetalleDialogOpen = signal<boolean>(false);
    vehiculoParaDetalle = signal<Vehiculo>({});

    loading = signal<boolean>(true);

    ngOnInit() {
        this.cargarVehiculos();
    }

    async cargarVehiculos() {
        this.loading.set(true);
        try {
            const data = await this.vehiculoService.obtenerVehiculos();
            this.vehiculos.set(data);
        } catch (error: any) {
            console.error('Error al cargar vehículos:', error);
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: error.message || 'No se pudieron cargar los vehículos',
                life: 5000,
            });
            this.vehiculos.set([]);
        } finally {
            this.loading.set(false);
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

    toggleEstadoVehiculo(vehiculo: Vehiculo) {
        const desactivando = (vehiculo.estado || '').toUpperCase() !== 'INACTIVO';
        this.confirmationService.confirm({
            message: desactivando
                ? `¿Desactivar la unidad con placa ${vehiculo.placa}? Pasará a estado INACTIVO.`
                : `¿Reactivar la unidad con placa ${vehiculo.placa}? Pasará a estado OPERATIVO.`,
            header: desactivando ? 'Confirmar Desactivación' : 'Confirmar Reactivación',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
            acceptButtonProps: desactivando
                ? { label: 'Desactivar', severity: 'danger' }
                : { label: 'Reactivar', severity: 'success' },
            accept: async () => {
                try {
                    await this.vehiculoService.cambiarEstadoVehiculo(
                        vehiculo,
                        desactivando ? 'INACTIVO' : 'OPERATIVO',
                    );
                    this.notif.add({
                        severity: 'success',
                        summary: 'Completado',
                        detail: desactivando ? 'Unidad desactivada' : 'Unidad reactivada',
                        life: 3000,
                    });
                    await this.cargarVehiculos();
                } catch (error: any) {
                    this.notif.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: error.message || 'No se pudo actualizar el estado del vehículo',
                        life: 5000,
                    });
                }
            },
        });
    }

    desactivarSelectedVehiculos() {
        const selected = this.vehiculoSelected().filter(
            (v) => (v.estado || '').toUpperCase() !== 'INACTIVO',
        );
        if (!selected.length) {
            this.notif.add({
                severity: 'info',
                summary: 'Sin cambios',
                detail: 'No hay unidades activas seleccionadas.',
            });
            return;
        }

        this.confirmationService.confirm({
            message: `¿Desactivar ${selected.length} unidad(es) seleccionada(s)? Pasarán a estado INACTIVO.`,
            header: 'Desactivación Masiva',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Desactivar Todo', severity: 'danger' },
            accept: async () => {
                try {
                    for (const v of selected) {
                        await this.vehiculoService.cambiarEstadoVehiculo(v, 'INACTIVO');
                    }
                    this.vehiculoSelected.set([]);
                    this.notif.add({
                        severity: 'success',
                        summary: 'Completado',
                        detail: 'Unidades desactivadas',
                        life: 3000,
                    });
                    await this.cargarVehiculos();
                } catch (error: any) {
                    this.notif.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: error.message || 'Error al desactivar vehículos',
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
