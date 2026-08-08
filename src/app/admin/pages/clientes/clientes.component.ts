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
import { SkeletonModule } from 'primeng/skeleton';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { RouterModule } from '@angular/router';
import { SelectButtonModule } from 'primeng/selectbutton';

import { ClienteDialogComponent } from './components/cliente-dialog.component';
import { SucursalDialogComponent } from './components/sucursal-dialog.component';
import { Cliente, ReglasSucursal, SucursalCliente } from './clientes.types';
import { ClienteService } from './service/cliente.service';
import { CapitalizePipe } from './pipes/capitalize.pipe';

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
        SkeletonModule,
        TooltipModule,
        ConfirmDialogModule,
        SelectButtonModule,
        RouterModule,
        ClienteDialogComponent,
        SucursalDialogComponent,
        CapitalizePipe,
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

    filtroEstado: 'activos' | 'inactivos' | 'todos' = 'activos';
    estadosFiltro = [
        { label: 'Activos', value: 'activos' },
        { label: 'Inactivos', value: 'inactivos' },
        { label: 'Todos', value: 'todos' },
    ];

    get clientesFiltrados(): Cliente[] {
        const list = this.clientes();
        if (this.filtroEstado === 'activos') {
            return list.filter((c) => c.activo !== false);
        }
        if (this.filtroEstado === 'inactivos') {
            return list.filter((c) => c.activo === false);
        }
        return list;
    }

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

    toggleEstadoCliente(cliente: Cliente) {
        const desactivando = cliente.activo !== false;
        this.confirmationService.confirm({
            message: `¿${desactivando ? 'Desactivar' : 'Reactivar'} a <b>${cliente.nombreComercial}</b>?`,
            header: desactivando ? 'Desactivar Cliente' : 'Reactivar Cliente',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
            acceptButtonProps: desactivando
                ? { label: 'Desactivar', severity: 'danger' }
                : { label: 'Reactivar', severity: 'success' },
            accept: async () => {
                try {
                    await this.clienteService.cambiarEstadoCliente(cliente, !desactivando);
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Completado',
                        detail: `Cliente "${cliente.nombreComercial}" ${
                            desactivando ? 'desactivado' : 'reactivado'
                        }`,
                        life: 3000,
                    });
                    await this.cargarClientes();
                } catch (error: any) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: error.message || 'No se pudo actualizar el estado del cliente',
                        life: 5000,
                    });
                }
            },
        });
    }

    desactivarSelectedClientes() {
        const selected = this.selectedClientes.filter((c) => c.activo !== false);
        if (!selected.length) {
            this.messageService.add({
                severity: 'info',
                summary: 'Sin cambios',
                detail: 'No hay clientes activos seleccionados.',
            });
            return;
        }

        this.confirmationService.confirm({
            message: `¿Estás seguro de desactivar los <b>${selected.length}</b> clientes seleccionados?`,
            header: 'Desactivar Clientes',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Desactivar Todo', severity: 'danger' },
            accept: async () => {
                try {
                    for (const c of selected) {
                        await this.clienteService.cambiarEstadoCliente(c, false);
                    }
                    this.selectedClientes = [];
                    this.messageService.add({
                        severity: 'success',
                        summary: 'Desactivados',
                        detail: 'Clientes desactivados correctamente',
                        life: 3000,
                    });
                    await this.cargarClientes();
                } catch (error: any) {
                    this.messageService.add({
                        severity: 'error',
                        summary: 'Error',
                        detail: error.message || 'Error al desactivar clientes',
                        life: 5000,
                    });
                }
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

    formatHoraIntervalo(reglas: ReglasSucursal | undefined): string {
        if (!reglas?.horaDesde && !reglas?.horaHasta) return '—';
        if (reglas.horaDesde && reglas.horaHasta)
            return `${reglas.horaDesde} - ${reglas.horaHasta}`;
        return reglas.horaDesde || reglas.horaHasta || '—';
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
