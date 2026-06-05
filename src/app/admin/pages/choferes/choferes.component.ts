import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmationService, MessageService } from 'primeng/api';

import { ChoferDialogComponent } from './components/chofer-dialog.component';
import { Chofer, CHOFERES_MOCK, GRADOS_LICENCIA } from './data/choferes-mock';

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
    selector: 'app-choferes',
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
        ChoferDialogComponent
    ],
    providers: [ConfirmationService, MessageService],
    templateUrl: './choferes.component.html'
})
export class ChoferesComponent implements OnInit {
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);

    choferes = signal<Chofer[]>([]);
    choferSelected = signal<Chofer[]>([]);

    isDialogOpen = signal<boolean>(false);
    choferParaModificar = signal<Chofer>({});

    filtroRol: string | null = null;
    rolesFiltro = [
        { label: 'Todos', value: null },
        { label: 'Chofer', value: 'Chofer' },
        { label: 'Ayudante', value: 'Ayudante' },
    ];
    grados = GRADOS_LICENCIA;

    ngOnInit() {
        this.choferes.set([...CHOFERES_MOCK]);
    }

    get choferesFiltrados(): Chofer[] {
        if (!this.filtroRol) return this.choferes();
        return this.choferes().filter(c => c.rol === this.filtroRol);
    }

    getDocumentoDisplay(c: Chofer): string {
        if (!c.documentoIdentidad) return '-';
        return `${c.documentoIdentidad.prefijo}-${c.documentoIdentidad.numero}`;
    }

    getGradoLabel(value: string): string {
        const g = this.grados.find(g => g.value === value);
        return g ? g.label : value;
    }

    openNew() {
        this.choferParaModificar.set({
            documentoIdentidad: { prefijo: 'V', numero: '' },
            nombreCompleto: '',
            telefono: '',
            rol: 'Chofer',
            fechaIngreso: '',
            licencia: { numero: '', grado: '', fechaVencimiento: '' },
            certificadoMedico: { numero: '', fechaExpedicion: '', fechaVencimiento: '' },
        });
        this.isDialogOpen.set(true);
    }

    editChofer(chofer: Chofer) {
        this.choferParaModificar.set({ ...chofer });
        this.isDialogOpen.set(true);
    }

    handleSaveChofer(choferCapturado: Chofer) {
        let listaActual = this.choferes();

        if (choferCapturado.id) {
            const index = listaActual.findIndex(c => c.id === choferCapturado.id);
            listaActual[index] = choferCapturado;
            this.choferes.set([...listaActual]);

            this.messageService.add({
                severity: 'success',
                summary: 'Actualizado',
                detail: `Datos de ${choferCapturado.nombreCompleto} actualizados`,
                life: 3000
            });
        } else {
            choferCapturado.id = crypto.randomUUID?.() || Math.random().toString(36).substr(2, 9);
            this.choferes.set([...listaActual, choferCapturado]);

            this.messageService.add({
                severity: 'success',
                summary: 'Registrado',
                detail: `${choferCapturado.rol} registrado correctamente`,
                life: 3000
            });
        }
    }

    deleteChofer(chofer: Chofer) {
        this.confirmationService.confirm({
            message: `¿Estás seguro de eliminar a "${chofer.nombreCompleto}"?`,
            header: 'Confirmar Eliminación',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Eliminar', severity: 'danger' },
            accept: () => {
                this.choferes.set(this.choferes().filter((val) => val.id !== chofer.id));
                this.messageService.add({ severity: 'success', summary: 'Completado', detail: 'Registro eliminado', life: 3000 });
            }
        });
    }

    deleteSelectedChoferes() {
        this.confirmationService.confirm({
            message: '¿Estás seguro de eliminar los registros seleccionados?',
            header: 'Eliminación Masiva',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Eliminar Todo', severity: 'danger' },
            accept: () => {
                const selectedIds = this.choferSelected().map(c => c.id);
                this.choferes.set(this.choferes().filter((val) => !selectedIds.includes(val.id)));
                this.choferSelected.set([]);
                this.messageService.add({ severity: 'success', summary: 'Completado', detail: 'Registros eliminados', life: 3000 });
            }
        });
    }

    getRolSeverity(rol: string) {
        switch (rol) {
            case 'Chofer': return 'info';
            case 'Ayudante': return 'warn';
            default: return 'secondary';
        }
    }

    getDocumentoValidez(fechaVencimiento?: string): 'success' | 'warn' | 'danger' {
        if (!fechaVencimiento) return 'danger';
        const hoy = new Date();
        const venc = new Date(fechaVencimiento);
        const diffMs = venc.getTime() - hoy.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return 'danger';
        if (diffDays < 60) return 'warn';
        return 'success';
    }
}
