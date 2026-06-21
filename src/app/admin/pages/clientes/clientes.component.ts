import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';

import { ClienteDialogComponent } from './components/cliente-dialog.component';
import { Cliente } from './clientes.types';

import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ToolbarModule } from 'primeng/toolbar';

@Component({
    selector: 'app-clientes',
    standalone: true,
    imports: [
        CommonModule,
        ButtonModule,
        ToastModule,
        ToolbarModule,
        ClienteDialogComponent,
    ],
    providers: [MessageService],
    templateUrl: './clientes.component.html',
})
export class ClientesComponent {
    private messageService = inject(MessageService);

    isDialogOpen = signal<boolean>(false);
    clienteParaModificar = signal<Cliente>({});

    openNew() {
        this.clienteParaModificar.set({
            documentoIdentidad: { prefijo: 'V', numero: '' },
            nombreComercial: '',
            telefono: '',
            correo: '',
            personaContacto: '',
            ubicaciones: [
                {
                    idMunicipio: '',
                    municipio: '',
                    direccion: '',
                    referencia: '',
                    pais: 'Venezuela',
                    estado: 'Nueva Esparta',
                    reglas: {
                        horarioDesde: '',
                        horarioHasta: '',
                        diasRecepcion: [],
                        requiereCita: false,
                        instrucciones: '',
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
    }
}
