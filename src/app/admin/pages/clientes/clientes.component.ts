import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmationService, MessageService } from 'primeng/api';

import { ClienteDialogComponent } from './components/cliente-dialog.component';
import { Cliente, CLIENTES_MOCK, MUNICIPIOS_NUEVA_ESPARTA } from './data/clientes-mock';

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
import { BadgeModule } from 'primeng/badge';

@Component({
    selector: 'app-clientes',
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
        BadgeModule,
        ClienteDialogComponent
    ],
    providers: [ConfirmationService, MessageService],
    templateUrl: './clientes.component.html'
})
export class ClientesComponent implements OnInit {
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);

    clientes = signal<Cliente[]>([]);
    clienteSelected = signal<Cliente[]>([]);

    isDialogOpen = signal<boolean>(false);
    clienteParaModificar = signal<Cliente>({});

    municipios = MUNICIPIOS_NUEVA_ESPARTA;

    ngOnInit() {
        this.clientes.set([...CLIENTES_MOCK]);
    }

    getDocumentoDisplay(cliente: Cliente): string {
        if (!cliente.documentoIdentidad) return '-';
        return `${cliente.documentoIdentidad.prefijo}-${cliente.documentoIdentidad.numero}`;
    }

    getMunicipioLabel(value: string): string {
        const m = this.municipios.find(m => m.value === value);
        return m ? m.label : value || '';
    }

    openNew() {
        this.clienteParaModificar.set({
            documentoIdentidad: { prefijo: 'V', numero: '' },
            nombreComercial: '',
            telefono: '',
            idPrioridad: 'MEDIA',
            ubicaciones: [{ municipio: '', direccion: '', referencia: '', pais: 'Venezuela', estado: 'Nueva Esparta' }]
        });
        this.isDialogOpen.set(true);
    }

    editCliente(cliente: Cliente) {
        this.clienteParaModificar.set({
            ...cliente,
            ubicaciones: cliente.ubicaciones?.map(u => ({ ...u }))
        });
        this.isDialogOpen.set(true);
    }

    handleSaveCliente(clienteCapturado: Cliente) {
        let listaActual = this.clientes();

        if (clienteCapturado.id) {
            const index = listaActual.findIndex(c => c.id === clienteCapturado.id);
            listaActual[index] = clienteCapturado;
            this.clientes.set([...listaActual]);

            this.messageService.add({
                severity: 'success',
                summary: 'Actualizado',
                detail: 'Cliente modificado correctamente',
                life: 3000
            });
        } else {
            clienteCapturado.id = crypto.randomUUID?.() || Math.random().toString(36).substr(2, 9);
            this.clientes.set([...listaActual, clienteCapturado]);

            this.messageService.add({
                severity: 'success',
                summary: 'Registrado',
                detail: 'Nuevo cliente agregado',
                life: 3000
            });
        }
    }

    deleteCliente(cliente: Cliente) {
        this.confirmationService.confirm({
            message: `¿Estás seguro de eliminar al cliente "${cliente.nombreComercial}"?`,
            header: 'Confirmar Eliminación',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Eliminar', severity: 'danger' },
            accept: () => {
                this.clientes.set(this.clientes().filter((val) => val.id !== cliente.id));
                this.messageService.add({ severity: 'success', summary: 'Completado', detail: 'Cliente eliminado', life: 3000 });
            }
        });
    }

    deleteSelectedClientes() {
        this.confirmationService.confirm({
            message: '¿Estás seguro de eliminar todos los clientes seleccionados?',
            header: 'Eliminación Masiva',
            icon: 'pi pi-exclamation-triangle',
            rejectButtonProps: { label: 'Cancelar', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Eliminar Todo', severity: 'danger' },
            accept: () => {
                const selectedIds = this.clienteSelected().map(c => c.id);
                this.clientes.set(this.clientes().filter((val) => !selectedIds.includes(val.id)));
                this.clienteSelected.set([]);
                this.messageService.add({ severity: 'success', summary: 'Completado', detail: 'Clientes eliminados', life: 3000 });
            }
        });
    }

    getSeverity(prioridad: string) {
        switch (prioridad) {
            case 'Alta': return 'danger';
            case 'Media': return 'warn';
            case 'Baja': return 'info';
            default: return 'secondary';
        }
    }
}
