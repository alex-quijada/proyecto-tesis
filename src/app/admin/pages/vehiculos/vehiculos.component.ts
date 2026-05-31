import { Component, OnInit, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ConfirmationService, MessageService } from 'primeng/api';

// Componentes del Módulo
import { VehiculoDialogComponent } from './components/vehiculo-dialog.component';
import { Vehiculo, VEHICULOS_MOCK } from './data/vehiculos-mock';

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
        VehiculoDialogComponent
    ],
    providers: [ConfirmationService, MessageService],
    templateUrl: './vehiculos.component.html'
})
export class VehiculosComponent implements OnInit {
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);
    private router = inject(Router);

    // Estados reactivos de la tabla de control
    vehiculos = signal<Vehiculo[]>([]);
    vehiculoSelected = signal<Vehiculo[]>([]);

    // Estados para coordinar el componente modal hijo
    isDialogOpen = signal<boolean>(false);
    vehiculoParaModificar = signal<Vehiculo>({});

    ngOnInit() {
        // Cargamos la data del archivo estático mock temporalmente.
        // Al conectar con Supabase, aquí harías el fetch a la base de datos remota.
        this.vehiculos.set([...VEHICULOS_MOCK]);
    }

    openNew() {
        this.vehiculoParaModificar.set({
            tipo: 'CARRO',
            tipoCaja: 'SECA',
            capacidadPallets: 0,
            pesoMaximo: 0,
            estado: 'OPERATIVO'
        });
        this.isDialogOpen.set(true);
    }

    editVehiculo(vehiculo: Vehiculo) {
        this.vehiculoParaModificar.set({ ...vehiculo });
        this.isDialogOpen.set(true);
    }

    // Procesa los datos capturados y emitidos por el modal independiente
    handleSaveVehiculo(vehiculoCapturado: Vehiculo) {
        let listaActual = this.vehiculos();

        if (vehiculoCapturado.id) {
            // Acción: Editar
            const index = listaActual.findIndex(v => v.id === vehiculoCapturado.id);
            listaActual[index] = vehiculoCapturado;
            this.vehiculos.set([...listaActual]);

            this.messageService.add({
                severity: 'success',
                summary: 'Actualizado',
                detail: 'Datos modificados localmente',
                life: 3000
            });
        } else {
            // Acción: Crear nuevo (Simulación de ID autogenerado)
            vehiculoCapturado.id = Math.random().toString(36).substr(2, 9);
            this.vehiculos.set([...listaActual, vehiculoCapturado]);

            this.messageService.add({
                severity: 'success',
                summary: 'Registrado',
                detail: 'Unidad agregada provisionalmente',
                life: 3000
            });
        }
    }

    verDetalleKilometraje(vehiculo: Vehiculo) {
        if (vehiculo.placa) {
            this.router.navigate(['/flota/vehiculo', vehiculo.placa, 'kilometraje']);
        }
    }

    deleteVehiculo(vehiculo: Vehiculo) {
        this.confirmationService.confirm({
            message: `¿Estás seguro de que deseas desincorporar la unidad con placa ${vehiculo.placa}?`,
            header: 'Confirmar Eliminación',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Eliminar', severity: 'danger' },
            accept: () => {
                this.vehiculos.set(this.vehiculos().filter((val) => val.id !== vehiculo.id));
                this.messageService.add({ severity: 'success', summary: 'Completado', detail: 'Unidad removida', life: 3000 });
            }
        });
    }

    deleteSelectedVehiculos() {
        this.confirmationService.confirm({
            message: '¿Estás seguro de borrar todas las unidades seleccionadas?',
            header: 'Eliminación Masiva',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Eliminar Todo', severity: 'danger' },
            accept: () => {
                const selectedIds = this.vehiculoSelected().map(v => v.id);
                this.vehiculos.set(this.vehiculos().filter((val) => !selectedIds.includes(val.id)));
                this.vehiculoSelected.set([]);
                this.messageService.add({ severity: 'success', summary: 'Completado', detail: 'Flota actualizada', life: 3000 });
            }
        });
    }

    getSeverity(estado: string) {
        switch (estado) {
            case 'OPERATIVO': return 'success';
            case 'MANTENIMIENTO': return 'warn';
            case 'INACTIVO': return 'danger';
            default: return 'info';
        }
    }

    getLabelCaja(tipo: string) {
        switch (tipo) {
            case 'SECA': return 'Caja Seca';
            case 'PLATAFORMA': return 'Plataforma Abierta';
            case 'REFRIGERADO': return 'Refrigerado';
            case 'ARTICULADO': return 'Articulado';
            default: return 'No Definido';
        }
    }

    getSeverityCaja(tipo: string) {
        switch (tipo) {
            case 'REFRIGERADO': return 'info';
            case 'SECA': return 'secondary';
            case 'PLATAFORMA': return 'warn';
            case 'ARTICULADO': return 'secondary';
            default: return 'info';
        }
    }
}
