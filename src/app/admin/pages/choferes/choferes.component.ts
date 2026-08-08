import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmationService, MessageService } from 'primeng/api';

import { ChoferDialogComponent } from './components/chofer-dialog.component';
import { Chofer, GRADOS_LICENCIA } from './data/choferes-mock';
import { AuthService } from '../../../auth/service/auth.service';

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
        ChoferDialogComponent,
    ],
    providers: [ConfirmationService, MessageService],
    templateUrl: './choferes.component.html',
})
export class ChoferesComponent implements OnInit {
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);
    private authService = inject(AuthService);

    choferes = signal<Chofer[]>([]);
    choferSelected = signal<Chofer[]>([]);
    loading = signal(false);

    isDialogOpen = signal<boolean>(false);
    choferParaModificar = signal<Chofer>({});

    filtroRol: string | null = null;
    rolesFiltro = [
        { label: 'Todos', value: null },
        { label: 'Chofer', value: 'Chofer' },
        { label: 'Ayudante', value: 'Ayudante' },
    ];
    grados = GRADOS_LICENCIA;

    async ngOnInit() {
        await this.cargarChoferes();
    }

    private async cargarChoferes() {
        this.loading.set(true);
        try {
            const data = await this.authService.obtenerChoferes();
            console.log('Choferes cargados:', data);
            this.choferes.set(data);
        } catch (error: any) {
            console.error('Error cargando choferes:', error);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: error.message || 'No se pudieron cargar los choferes',
                life: 5000,
            });
        } finally {
            this.loading.set(false);
        }
    }

    get choferesFiltrados(): Chofer[] {
        if (!this.filtroRol) return this.choferes();
        return this.choferes().filter((c) => c.rol === this.filtroRol);
    }

    getDocumentoDisplay(c: Chofer): string {
        if (!c.documentoIdentidad) return '-';
        return `${c.documentoIdentidad.prefijo}-${c.documentoIdentidad.numero}`;
    }

    getGradoLabel(value: string): string {
        const g = this.grados.find((g) => g.value === value);
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

    async handleSaveChofer(chofer: Chofer) {
        if (!chofer.id) {
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudo identificar al usuario.',
                life: 5000,
            });
            return;
        }

        try {
            await this.authService.actualizarUsuarioPorRol({
                user_id: chofer.id,
                email: chofer.email || '',
                password: '',
                nombre_completo: chofer.nombreCompleto || '',
                cedula: Number(chofer.documentoIdentidad?.numero || 0),
                nombre_rol: chofer.rol || 'Chofer',
                prefijo_doc: chofer.documentoIdentidad?.prefijo || 'V',
                certificado_numero: chofer.certificadoMedico?.numero || '',
                certificado_expedicion: chofer.certificadoMedico?.fechaExpedicion || null,
                licencia_numero: chofer.licencia?.numero || '',
                licencia_grado: chofer.licencia?.grado || '',
                licencia_expedicion: chofer.licencia?.fechaExpedicion || null,
            });

            await this.cargarChoferes();

            this.messageService.add({
                severity: 'success',
                summary: 'Completado',
                detail: `Datos de ${chofer.nombreCompleto} actualizados`,
                life: 3000,
            });
        } catch (error: any) {
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: error.message || 'No se pudieron guardar los cambios',
                life: 5000,
            });
        }
    }

    async deleteChofer(chofer: Chofer) {
        const confirmed = await new Promise<boolean>((resolve) => {
            this.confirmationService.confirm({
                message: `¿Desactivar a "${chofer.nombreCompleto}"? No podrá iniciar sesión hasta que lo actives de nuevo.`,
                header: 'Confirmar Desactivación',
                icon: 'pi pi-exclamation-triangle',
                rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
                acceptButtonProps: { label: 'Desactivar', severity: 'danger' },
                accept: () => resolve(true),
                reject: () => resolve(false),
            });
        });

        if (!confirmed || !chofer.id) return;

        try {
            await this.authService.desactivarUsuario(chofer.id);
            await this.cargarChoferes();
            this.messageService.add({
                severity: 'success',
                summary: 'Completado',
                detail: 'Chofer desactivado',
                life: 3000,
            });
        } catch (error: any) {
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: error.message,
                life: 5000,
            });
        }
    }

    async deleteSelectedChoferes() {
        const confirmed = await new Promise<boolean>((resolve) => {
            this.confirmationService.confirm({
                message: '¿Desactivar los registros seleccionados?',
                header: 'Desactivación Masiva',
                icon: 'pi pi-exclamation-triangle',
                rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
                acceptButtonProps: { label: 'Desactivar Todo', severity: 'danger' },
                accept: () => resolve(true),
                reject: () => resolve(false),
            });
        });

        if (!confirmed) return;

        try {
            for (const c of this.choferSelected()) {
                if (c.id) await this.authService.desactivarUsuario(c.id);
            }
            this.choferSelected.set([]);
            await this.cargarChoferes();
            this.messageService.add({
                severity: 'success',
                summary: 'Completado',
                detail: 'Choferes desactivados',
                life: 3000,
            });
        } catch (error: any) {
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: error.message,
                life: 5000,
            });
        }
    }

    getRolSeverity(rol: string) {
        switch (rol) {
            case 'Chofer':
                return 'info';
            case 'Ayudante':
                return 'warn';
            default:
                return 'secondary';
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
