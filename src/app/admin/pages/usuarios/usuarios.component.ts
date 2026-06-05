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
import { Usuario, USUARIOS_MOCK, ROLES } from './data/usuarios-mock';

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

    usuarios = signal<Usuario[]>([]);
    usuariosSelected = signal<Usuario[]>([]);
    loading = false;
    dialogVisible = false;
    editingUsuario: Usuario = {} as Usuario;
    filtroGlobal = '';
    filtroRol: string | null = null;

    rolFiltros = [
        { label: 'Todos los Roles', value: null },
        ...ROLES.map(r => ({ label: r.label, value: r.value })),
    ];

    rolLabels: Record<string, string> = {};
    rolIcons: Record<string, string> = {};
    rolSeverities: Record<string, 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast'> = {
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
        this.usuarios.set([...USUARIOS_MOCK]);
    }

    get usuariosFiltrados(): Usuario[] {
        let list = this.usuarios();
        if (this.filtroRol) {
            list = list.filter(u => u.rol === this.filtroRol);
        }
        if (this.filtroGlobal?.trim()) {
            const q = this.filtroGlobal.toLowerCase();
            list = list.filter(u =>
                u.nombreCompleto.toLowerCase().includes(q) ||
                u.email.toLowerCase().includes(q) ||
                u.username.toLowerCase().includes(q) ||
                u.documentoIdentidad.numero.includes(q) ||
                u.telefono.includes(q)
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

    onSave(usuario: Usuario) {
        const idx = this.usuarios().findIndex(u => u.id === usuario.id);
        if (idx >= 0) {
            const updated = [...this.usuarios()];
            updated[idx] = { ...usuario };
            this.usuarios.set(updated);
            this.messageService.add({ severity: 'success', summary: 'Usuario actualizado', detail: `${usuario.nombreCompleto} modificado exitosamente.` });
        } else {
            usuario.id = `usr-${Date.now()}`;
            this.usuarios.set([usuario, ...this.usuarios()]);
            this.messageService.add({ severity: 'success', summary: 'Usuario creado', detail: `${usuario.nombreCompleto} registrado exitosamente.` });
        }
    }

    deleteUsuario(usuario: Usuario) {
        this.confirmationService.confirm({
            message: `¿Está seguro de eliminar a <strong>${usuario.nombreCompleto}</strong>?`,
            header: 'Confirmar Eliminación',
            icon: 'pi pi-exclamation-triangle',
            accept: () => {
                this.usuarios.set(this.usuarios().filter(u => u.id !== usuario.id));
                this.messageService.add({ severity: 'success', summary: 'Eliminado', detail: 'Usuario eliminado.' });
            },
        });
    }

    deleteSelectedUsuarios() {
        const selected = this.usuariosSelected();
        if (!selected.length) return;

        this.confirmationService.confirm({
            message: `¿Eliminar ${selected.length} usuario(s) seleccionados?`,
            header: 'Confirmar Eliminación Masiva',
            icon: 'pi pi-exclamation-triangle',
            accept: () => {
                const ids = new Set(selected.map(u => u.id));
                this.usuarios.set(this.usuarios().filter(u => !ids.has(u.id)));
                this.usuariosSelected.set([]);
                this.messageService.add({ severity: 'success', summary: 'Eliminados', detail: `${selected.length} usuario(s) eliminados.` });
            },
        });
    }

    refrescar() {
        this.loading = true;
        setTimeout(() => {
            this.usuarios.set([...USUARIOS_MOCK]);
            this.loading = false;
            this.messageService.add({ severity: 'info', summary: 'Actualizado', detail: 'Datos refrescados.' });
        }, 500);
    }
}
