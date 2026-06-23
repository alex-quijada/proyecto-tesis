import { Component, signal, computed, inject, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { RippleModule } from 'primeng/ripple';
import { ToastModule } from 'primeng/toast';
import { ToolbarModule } from 'primeng/toolbar';
import { InputTextModule } from 'primeng/inputtext';
import { InputIconModule } from 'primeng/inputicon';
import { IconFieldModule } from 'primeng/iconfield';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { RouterModule } from '@angular/router';

import { ClienteDialogComponent } from './components/cliente-dialog.component';
import { SucursalDialogComponent } from './components/sucursal-dialog.component';
import { Cliente, SucursalCliente } from './clientes.types';
import { ClienteService } from './service/cliente.service';

@Component({
    selector: 'app-clientes',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        RippleModule,
        ToastModule,
        ToolbarModule,
        TableModule,
        TagModule,
        InputTextModule,
        InputIconModule,
        IconFieldModule,
        TooltipModule,
        ConfirmDialogModule,
        RouterModule,
        ClienteDialogComponent,
        SucursalDialogComponent,
    ],
    providers: [MessageService, ConfirmationService],
    templateUrl: './clientes.component.html',
})
export class ClientesComponent implements OnInit {
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);
    private clienteService = inject(ClienteService);

    @ViewChild('dt') dt!: Table;

    isDialogOpen = signal<boolean>(false);
    clienteParaModificar = signal<Cliente>({});
    clientes = signal<Cliente[]>([]);
    loading = signal(false);
    selectedClientes: Cliente[] = [];

    expandedRows = signal<{ [key: string]: boolean }>({});
    loadingSucursales = signal<{ [key: string]: boolean }>({});
    municipiosMap = signal<Record<string, string>>({});

    sucursalDialogVisible = signal(false);
    sucursalClienteId = signal('');
    sucursalParaEditar = signal<SucursalCliente | null>(null);

    isExpanded = computed(() => {
        const rows = this.expandedRows();
        return this.clientes().length > 0 && Object.keys(rows).length === this.clientes().length;
    });

    async ngOnInit() {
        await Promise.all([this.cargarClientes(), this.cargarMunicipios()]);
    }

    private async cargarMunicipios() {
        try {
            const items = await this.clienteService.obtenerMunicipios();
            const map: Record<string, string> = {};
            for (const m of items) map[m.id_municipio] = m.nombre;
            this.municipiosMap.set(map);
        } catch {
            /* ok */
        }
    }

    async cargarClientes() {
        this.loading.set(true);
        try {
            const data = await this.clienteService.obtenerClientes();
            this.clientes.set(data);
        } catch (e: any) {
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: e.message || 'No se pudieron cargar los clientes',
            });
        } finally {
            this.loading.set(false);
        }
    }

    expandAll() {
        const all: { [key: string]: boolean } = {};
        for (const c of this.clientes()) {
            all[c.id!] = true;
            this.cargarSucursales(c);
        }
        this.expandedRows.set(all);
    }

    collapseAll() {
        this.expandedRows.set({});
    }

    async onRowExpand(event: any) {
        const cliente: Cliente = event.data;
        await this.cargarSucursales(cliente);
    }

    private async cargarSucursales(cliente: Cliente) {
        const id = cliente.id!;
        if (cliente.sucursales?.length) return;
        this.loadingSucursales.update((map) => ({ ...map, [id]: true }));
        try {
            const sucursales = await this.clienteService.obtenerSucursales(id);
            this.clientes.update((list) =>
                list.map((c) => (c.id === id ? { ...c, sucursales } : c)),
            );
        } catch {
            // silently fail
        } finally {
            this.loadingSucursales.update((map) => ({ ...map, [id]: false }));
        }
    }

    onGlobalFilter(event: Event) {
        this.dt.filterGlobal((event.target as HTMLInputElement).value, 'contains');
    }

    getPrioridadSeverity(prioridad: string | undefined): 'success' | 'warn' | 'danger' | 'info' {
        switch (prioridad?.toLowerCase()) {
            case 'alta':
                return 'danger';
            case 'media':
                return 'warn';
            case 'baja':
                return 'info';
            default:
                return 'info';
        }
    }

    openNew() {
        this.clienteParaModificar.set({
            documentoIdentidad: { prefijo: 'V', numero: '' },
            nombreComercial: '',
            telefono: '',
            correo: '',
            personaContacto: '',
            sucursales: [this.sucursalVacia()],
        });
        this.isDialogOpen.set(true);
    }

    async editCliente(cliente: Cliente) {
        if (!cliente.sucursales?.length) {
            await this.cargarSucursales(cliente);
        }
        const actualizado = this.clientes().find(
            (c) => c.id === cliente.id || c.idCliente === cliente.id,
        );
        this.clienteParaModificar.set({ ...(actualizado || cliente) });
        this.isDialogOpen.set(true);
    }

    deleteCliente(cliente: Cliente) {
        this.confirmationService.confirm({
            message: `¿Estás seguro de eliminar a <b>${cliente.nombreComercial}</b>?`,
            header: 'Eliminar Cliente',
            icon: 'pi pi-exclamation-triangle',
            accept: () => {
                this.clientes.set(this.clientes().filter((c) => c.id !== cliente.id));
                this.messageService.add({
                    severity: 'success',
                    summary: 'Eliminado',
                    detail: `Cliente "${cliente.nombreComercial}" eliminado`,
                    life: 3000,
                });
            },
        });
    }

    deleteSelectedClientes() {
        this.confirmationService.confirm({
            message: `¿Estás seguro de eliminar los <b>${this.selectedClientes.length}</b> clientes seleccionados?`,
            header: 'Eliminar Clientes',
            icon: 'pi pi-exclamation-triangle',
            accept: () => {
                const ids = new Set(this.selectedClientes.map((c) => c.id));
                this.clientes.set(this.clientes().filter((c) => !ids.has(c.id)));
                this.selectedClientes = [];
                this.messageService.add({
                    severity: 'success',
                    summary: 'Eliminados',
                    detail: 'Clientes eliminados correctamente',
                    life: 3000,
                });
            },
        });
    }

    readonly pluralSucursalMapping: Record<string, string> = {
        '=0': 'No tiene sucursales',
        '=1': '1 sucursal',
        other: '# sucursales',
    };

    private sucursalVacia(): SucursalCliente {
        return {
            direccion: '',
            puntoDeReferencia: '',
            idMunicipio: '',
            reglas: {
                diasRecepcion: [],
                requiereCita: false,
                instrucciones: '',
            },
        };
    }

    async agregarSucursal(cliente: Cliente) {
        const id = cliente.id || cliente.idCliente;
        if (!id) return;
        this.sucursalClienteId.set(id);
        this.sucursalParaEditar.set(null);
        this.sucursalDialogVisible.set(true);
    }

    async editarSucursal(sucursal: SucursalCliente, cliente: Cliente) {
        const id = cliente.id || cliente.idCliente;
        if (!id) return;
        this.sucursalClienteId.set(id);
        this.sucursalParaEditar.set({ ...sucursal });
        this.sucursalDialogVisible.set(true);
    }

    handleSaveSucursal() {
        this.messageService.add({
            severity: 'success',
            summary: 'Sucursal guardada',
            detail: 'La sucursal se ha guardado correctamente',
            life: 3000,
        });
        this.cargarClientes();
    }

    handleSaveCliente(clienteCapturado: Cliente) {
        const esEdicion = !!clienteCapturado.id;
        this.messageService.add({
            severity: 'success',
            summary: esEdicion ? 'Actualizado' : 'Registrado',
            detail: `Cliente "${clienteCapturado.nombreComercial}" ${
                esEdicion ? 'modificado' : 'registrado'
            } correctamente`,
            life: 3000,
        });
        this.cargarClientes();
    }
}
