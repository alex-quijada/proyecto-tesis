import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ToolbarModule } from 'primeng/toolbar';
import { InputTextModule } from 'primeng/inputtext';
import { InputIconModule } from 'primeng/inputicon';
import { IconFieldModule } from 'primeng/iconfield';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { CardModule } from 'primeng/card';

import { UsuarioDialogComponent } from './components/usuario-dialog.component';
import { Usuario, ROLES } from './data/usuarios-mock';
import { AuthService } from '../../../auth/service/auth.service';

@Component({
    selector: 'app-usuarios',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        TableModule,
        ButtonModule,
        ToastModule,
        ToolbarModule,
        InputTextModule,
        InputIconModule,
        IconFieldModule,
        TagModule,
        SelectModule,
        ConfirmDialogModule,
        TooltipModule,
        CardModule,
        UsuarioDialogComponent,
    ],
    providers: [ConfirmationService, MessageService],
    templateUrl: './usuarios.component.html',
})
export class UsuariosComponent implements OnInit {
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);
    private authService = inject(AuthService);

    usuarios = signal<Usuario[]>([]);
    usuariosSelected = signal<Usuario[]>([]);
    loading = signal(false);
    dialogVisible = false;
    editingUsuario: Usuario = {} as Usuario;
    filtroGlobal = '';
    filtroRol: string | null = null;

    rolFiltros = [
        { label: 'Todos los Roles', value: null },
        ...ROLES.map((r) => ({ label: r.label, value: r.value })),
    ];

    rolLabels: Record<string, string> = {};
    rolIcons: Record<string, string> = {};
    rolSeverities: Record<
        string,
        'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast'
    > = {
        ADMIN: 'danger',
        ANALISTA: 'info',
        CHOFER: 'success',
        AYUDANTE: 'warn',
        CLIENTE: 'secondary',
    };

    constructor() {
        for (const r of ROLES) {
            this.rolLabels[r.value] = r.label;
            this.rolIcons[r.value] = r.icon;
        }
    }

    ngOnInit() {
        this.cargarUsuarios();
    }

    private async cargarUsuarios() {
        this.loading.set(true);
        try {
            const data = await this.authService.listarUsuarios();
            this.usuarios.set(data);
        } catch (error: any) {
            console.error('Error al cargar usuarios desde Supabase:', error);
            this.messageService.add({
                severity: 'warn',
                summary: 'Usando datos de respaldo',
                detail: 'No se pudo conectar con la base de datos. Mostrando datos locales.',
            });
        } finally {
            this.loading.set(false);
        }
    }

    get usuariosFiltrados(): Usuario[] {
        let list = this.usuarios();
        if (this.filtroRol) {
            list = list.filter((u) => u.rol === this.filtroRol);
        }
        if (this.filtroGlobal?.trim()) {
            const q = this.filtroGlobal.toLowerCase();
            list = list.filter(
                (u) =>
                    u.nombreCompleto.toLowerCase().includes(q) ||
                    u.email.toLowerCase().includes(q) ||
                    u.username.toLowerCase().includes(q) ||
                    u.documentoIdentidad.numero.includes(q),
            );
        }
        return list;
    }

    get totalUsuarios(): number {
        return this.usuariosFiltrados.length;
    }

    getRolSeverity(rol: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
        return this.rolSeverities[rol] || 'info';
    }

    openNew() {
        this.editingUsuario = {} as Usuario;
        this.dialogVisible = true;
    }

    editUsuario(usuario: Usuario) {
        this.editingUsuario = { ...usuario };
        this.dialogVisible = true;
    }

    onSave(_usuario: Usuario) {
        this.cargarUsuarios();
    }

    toggleEstadoUsuario(usuario: Usuario) {
        const desactivando = usuario.activo;
        this.confirmationService.confirm({
            message: desactivando
                ? `¿Desactivar a <strong>${usuario.nombreCompleto}</strong>? No podrá iniciar sesión hasta que lo actives de nuevo.`
                : `¿Reactivar a <strong>${usuario.nombreCompleto}</strong>? Podrá iniciar sesión nuevamente.`,
            header: desactivando ? 'Confirmar Desactivación' : 'Confirmar Reactivación',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: desactivando ? 'Desactivar' : 'Reactivar',
            rejectLabel: 'Cancelar',
            accept: async () => {
                try {
                    if (desactivando) {
                        await this.authService.desactivarUsuario(usuario.id!);
                    } else {
                        await this.authService.reactivarUsuario(usuario.id!);
                    }
                    this.messageService.add({
                        severity: 'success',
                        summary: desactivando ? 'Desactivado' : 'Reactivado',
                        detail: `${usuario.nombreCompleto} ${
                            desactivando ? 'desactivado.' : 'reactivado.'
                        }`,
                    });
                    await this.cargarUsuarios();
                } catch (error: any) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail:
                            error.message ||
                            `No se pudo ${desactivando ? 'desactivar' : 'reactivar'} el usuario.`,
                    });
                }
            },
        });
    }

    desactivarSelectedUsuarios() {
        const selected = this.usuariosSelected().filter((u) => u.activo);
        if (!selected.length) {
            this.messageService.add({
                severity: 'info',
                summary: 'Sin cambios',
                detail: 'No hay usuarios activos seleccionados.',
            });
            return;
        }

        this.confirmationService.confirm({
            message: `¿Desactivar ${selected.length} usuario(s) seleccionados?`,
            header: 'Confirmar Desactivación Masiva',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Desactivar Todo',
            rejectLabel: 'Cancelar',
            accept: async () => {
                try {
                    for (const u of selected) {
                        await this.authService.desactivarUsuario(u.id!);
                    }
                    this.usuariosSelected.set([]);
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Desactivados',
                        detail: `${selected.length} usuario(s) desactivados.`,
                    });
                    await this.cargarUsuarios();
                } catch (error: any) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: error.message || 'Error al desactivar usuarios.',
                    });
                }
            },
        });
    }

    refrescar() {
        this.cargarUsuarios();
        this.messageService.add({
            severity: 'info',
            summary: 'Actualizado',
            detail: 'Datos refrescados.',
        });
    }
}
