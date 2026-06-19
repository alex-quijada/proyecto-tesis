import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmationService, MessageService } from 'primeng/api';

import { MantenimientoDialogComponent } from './components/mantenimiento-dialog.component';
import { Mantenimiento, MANTENIMIENTOS_MOCK } from './data/mantenimiento-mock';

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
        MantenimientoDialogComponent,
    ],
    providers: [ConfirmationService, MessageService],
    templateUrl: './mantenimiento.component.html',
})
export class MantenimientoComponent implements OnInit {
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);

    mantenimientos = signal<Mantenimiento[]>([]);
    mantenimientoSelected = signal<Mantenimiento[]>([]);

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
        this.mantenimientos.set([...MANTENIMIENTOS_MOCK]);
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

    handleSaveMantenimiento(mCapturado: Mantenimiento) {
        let listaActual = this.mantenimientos();

        if (mCapturado.id) {
            const index = listaActual.findIndex((m) => m.id === mCapturado.id);
            listaActual[index] = mCapturado;
            this.mantenimientos.set([...listaActual]);

            this.messageService.add({
                severity: 'success',
                summary: 'Actualizado',
                detail: `Mantenimiento de ${mCapturado.placaVehiculo} actualizado`,
                life: 3000,
            });
        } else {
            mCapturado.id = crypto.randomUUID?.() || Math.random().toString(36).substr(2, 9);
            this.mantenimientos.set([...listaActual, mCapturado]);

            this.messageService.add({
                severity: 'success',
                summary: 'Registrado',
                detail: `Mantenimiento programado para ${mCapturado.placaVehiculo}`,
                life: 3000,
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
            accept: () => {
                this.mantenimientos.set(this.mantenimientos().filter((v) => v.id !== m.id));
                this.messageService.add({
                    severity: 'success',
                    summary: 'Completado',
                    detail: 'Mantenimiento eliminado',
                    life: 3000,
                });
            },
        });
    }

    deleteSelectedMantenimientos() {
        this.confirmationService.confirm({
            message: '¿Eliminar los mantenimientos seleccionados?',
            header: 'Eliminación Masiva',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Eliminar Todo', severity: 'danger' },
            accept: () => {
                const ids = this.mantenimientoSelected().map((m) => m.id);
                this.mantenimientos.set(this.mantenimientos().filter((m) => !ids.includes(m.id)));
                this.mantenimientoSelected.set([]);
                this.messageService.add({
                    severity: 'success',
                    summary: 'Completado',
                    detail: 'Registros eliminados',
                    life: 3000,
                });
            },
        });
    }
}
