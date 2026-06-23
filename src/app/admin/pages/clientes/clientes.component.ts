import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ToolbarModule } from 'primeng/toolbar';
import { RouterModule } from '@angular/router';

import { ClienteDialogComponent } from './components/cliente-dialog.component';
import { Cliente, SucursalCliente } from './clientes.types';
import { ClienteService } from './service/cliente.service';

@Component({
    selector: 'app-clientes',
    standalone: true,
    imports: [
        CommonModule,
        ButtonModule,
        ToastModule,
        ToolbarModule,
        TableModule,
        TagModule,
        RouterModule,
        ClienteDialogComponent,
    ],
    providers: [MessageService],
    templateUrl: './clientes.component.html',
})
export class ClientesComponent implements OnInit {
    private messageService = inject(MessageService);
    private clienteService = inject(ClienteService);

    isDialogOpen = signal<boolean>(false);
    clienteParaModificar = signal<Cliente>({});
    clientes = signal<Cliente[]>([]);
    loading = signal(false);

    expandedRows: { [key: string]: boolean } = {};
    loadingSucursales: { [key: string]: boolean } = {};
    municipiosMap = signal<Record<string, string>>({});

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
            console.log('Clientes cargados:', JSON.stringify(data, null, 2));
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

    get isExpanded(): boolean {
        return Object.keys(this.expandedRows).length === this.clientes().length;
    }

    expandAll() {
        const all: { [key: string]: boolean } = {};
        for (const c of this.clientes()) {
            all[c.id!] = true;
            this.cargarSucursales(c);
        }
        this.expandedRows = all;
    }

    collapseAll() {
        this.expandedRows = {};
    }

    async onRowExpand(event: any) {
        const cliente: Cliente = event.data;
        await this.cargarSucursales(cliente);
    }

    private async cargarSucursales(cliente: Cliente) {
        const id = cliente.id!;
        if (cliente.sucursales?.length) return;
        this.loadingSucursales[id] = true;
        try {
            const sucursales = await this.clienteService.obtenerSucursales(id);
            this.clientes.update((list) =>
                list.map((c) => (c.id === id ? { ...c, sucursales } : c)),
            );
        } catch {
            // silently fail
        } finally {
            this.loadingSucursales[id] = false;
        }
    }

    openNew() {
        this.clienteParaModificar.set({
            documentoIdentidad: { prefijo: 'V', numero: '12345678' },
            nombreComercial: 'Cliente de Prueba, C.A.',
            telefono: '0414-1234567',
            correo: 'test@correo.com',
            personaContacto: 'Juan Pérez',
            sucursales: [
                {
                    idMunicipio: '',
                    direccion: 'Av. Principal, Edif. Centro, Piso 1, Local 2',
                    puntoDeReferencia: 'Frente a la plaza',
                    reglas: {
                        horaEntrega: '08:00',
                        diasRecepcion: ['LUN', 'MAR', 'MIE', 'JUE', 'VIE'],
                        requiereCita: false,
                        instrucciones: 'Recepción por el muelle trasero',
                    },
                },
            ],
        });
        this.isDialogOpen.set(true);
    }

    handleSaveCliente(clienteCapturado: Cliente) {
        this.messageService.add({
            severity: 'success',
            summary: 'Registrado',
            detail: `Cliente "${clienteCapturado.nombreComercial}" registrado correctamente`,
            life: 3000,
        });
        this.cargarClientes();
    }
}
