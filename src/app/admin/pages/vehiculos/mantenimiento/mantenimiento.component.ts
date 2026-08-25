import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmationService } from 'primeng/api';
import { NotificationService } from '@/app/services/notification.service';

import { MantenimientoDialogComponent } from './components/mantenimiento-dialog.component';
import { Mantenimiento } from './data/mantenimiento-mock';
import { MantenimientoService } from './service/mantenimiento.service';

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
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-mantenimiento',
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
        SelectModule,
        SkeletonModule,
        MantenimientoDialogComponent,
    ],
    providers: [ConfirmationService],
    templateUrl: './mantenimiento.component.html',
})
export class MantenimientoComponent implements OnInit {
    private notif = inject(NotificationService);
    private confirmationService = inject(ConfirmationService);
    private mantenimientoService = inject(MantenimientoService);

    mantenimientos = signal<Mantenimiento[]>([]);
    mantenimientoSelected = signal<Mantenimiento[]>([]);

    cargando = signal(true);
    isDialogOpen = signal<boolean>(false);
    mantenimientoParaModificar = signal<Mantenimiento>({} as Mantenimiento);

    filtroEstado: string | null = null;
    filtroEstados = [
        { label: 'Todos', value: null },
        { label: 'Programado', value: 'PROGRAMADO' },
        { label: 'En Proceso', value: 'EN_PROCESO' },
        { label: 'Realizado', value: 'REALIZADO' },
        { label: 'Cancelado', value: 'CANCELADO' },
    ];

    ngOnInit() {
        void this.cargarDatos();
    }

    private async cargarDatos() {
        this.cargando.set(true);
        try {
            const lista = await this.mantenimientoService.obtenerMantenimientos();
            this.mantenimientos.set(lista);
        } catch (err: any) {
            console.error('Error cargando mantenimientos:', err);
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudieron cargar los mantenimientos.',
            });
        } finally {
            this.cargando.set(false);
        }
    }

    get mantenimientosFiltrados(): Mantenimiento[] {
        if (!this.filtroEstado) return this.mantenimientos();
        return this.mantenimientos().filter((m) => m.estado === this.filtroEstado);
    }

    getSeverityTipo(tipo: string) {
        return tipo === 'PREVENTIVO' ? 'info' : 'warn';
    }

    getSeverityEstado(estado: string) {
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

    openNew() {
        this.mantenimientoParaModificar.set({} as Mantenimiento);
        this.isDialogOpen.set(true);
    }

    editMantenimiento(m: Mantenimiento) {
        this.mantenimientoParaModificar.set({ ...m });
        this.isDialogOpen.set(true);
    }

    async handleSaveMantenimiento(mCapturado: Mantenimiento) {
        try {
            if (mCapturado.id) {
                await this.mantenimientoService.actualizarMantenimiento(mCapturado);
                this.notif.add({
                    severity: 'success',
                    summary: 'Actualizado',
                    detail: `Mantenimiento de ${mCapturado.placaVehiculo} actualizado`,
                    life: 3000,
                });
            } else {
                await this.mantenimientoService.crearMantenimiento(mCapturado);
                this.notif.add({
                    severity: 'success',
                    summary: 'Registrado',
                    detail: `Mantenimiento programado para ${mCapturado.placaVehiculo}`,
                    life: 3000,
                });
            }
            await this.cargarDatos();
        } catch (err: any) {
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo guardar el mantenimiento.',
            });
        }
    }

    deleteMantenimiento(m: Mantenimiento) {
        this.confirmationService.confirm({
            message: `¿Eliminar el mantenimiento "${m.descripcion?.substring(0, 40)}..." de ${m.placaVehiculo}?`,
            header: 'Confirmar Eliminación',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Eliminar', severity: 'danger' },
            accept: () => void this.confirmarEliminar(m),
        });
    }

    private async confirmarEliminar(m: Mantenimiento) {
        if (!m.id) return;
        try {
            await this.mantenimientoService.eliminarMantenimiento(m.id);
            this.notif.add({
                severity: 'success',
                summary: 'Completado',
                detail: 'Mantenimiento eliminado',
                life: 3000,
            });
            await this.cargarDatos();
        } catch (err: any) {
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo eliminar el mantenimiento.',
            });
        }
    }

    deleteSelectedMantenimientos() {
        this.confirmationService.confirm({
            message: '¿Eliminar los mantenimientos seleccionados?',
            header: 'Eliminación Masiva',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Eliminar Todo', severity: 'danger' },
            accept: () => void this.confirmarEliminarSeleccionados(),
        });
    }

    private async confirmarEliminarSeleccionados() {
        const ids = this.mantenimientoSelected()
            .map((m) => m.id)
            .filter((id): id is string => !!id);
        if (!ids.length) return;
        try {
            await Promise.all(ids.map((id) => this.mantenimientoService.eliminarMantenimiento(id)));
            this.mantenimientoSelected.set([]);
            this.notif.add({
                severity: 'success',
                summary: 'Completado',
                detail: 'Registros eliminados',
                life: 3000,
            });
            await this.cargarDatos();
        } catch (err: any) {
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudieron eliminar los registros.',
            });
        }
    }
}
