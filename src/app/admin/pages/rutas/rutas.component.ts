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
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { ChipModule } from 'primeng/chip';

import { GuiaDialogComponent } from './components/guia-dialog.component';
import {
    GuiaDespacho,
    Ruta,
    GUIAS_MOCK,
    RUTAS_MOCK,
    MUNICIPIOS_NUEVA_ESPARTA,
    ESTADOS_FACTURA,
} from './data/rutas-mock';
import { AuthService } from '../../../auth/service/auth.service';

@Component({
    selector: 'app-rutas',
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
        SelectModule,
        TagModule,
        ConfirmDialogModule,
        TooltipModule,
        ChipModule,
        GuiaDialogComponent,
    ],
    providers: [ConfirmationService, MessageService],
    templateUrl: './rutas.component.html',
})
export class RutasComponent implements OnInit {
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);
    private authService = inject(AuthService);

    guias = signal<GuiaDespacho[]>([]);
    rutas = signal<Ruta[]>([]);

    guiaDialogVisible = false;
    editingGuia: GuiaDespacho = {} as GuiaDespacho;
    userRole: string = 'ADMIN';

    filtroMunicipio: string | null = null;

    municipioFiltros = [
        { label: 'Todos los Municipios', value: null },
        ...MUNICIPIOS_NUEVA_ESPARTA.map((m) => ({ label: m.label, value: m.value })),
    ];

    constructor() {
        const rawRole = this.authService.getUserRole();
        const role = rawRole ? String(rawRole).toLowerCase() : '';
        if (role === 'administrador' || role === 'coordinador') {
            this.userRole = 'ADMIN';
        } else if (role === 'analista') {
            this.userRole = 'ANALISTA';
        } else if (role === 'chofer' || role === 'ayudante') {
            this.userRole = 'CHOFER';
        } else {
            this.userRole = 'ADMIN';
        }
    }

    ngOnInit() {
        this.guias.set([...GUIAS_MOCK]);
        this.rutas.set([...RUTAS_MOCK]);
    }

    get guiasFiltradas(): GuiaDespacho[] {
        let list = this.guias();
        if (this.filtroMunicipio) {
            list = list.filter((g) => g.municipio === this.filtroMunicipio);
        }
        return list;
    }

    onRowExpand(event: any) {}

    onRowCollapse(event: any) {}

    getEstadoFacturaLabel(idEstado: string): string {
        const e = ESTADOS_FACTURA.find((ef) => ef.value === idEstado);
        return e?.label || idEstado;
    }

    getEstadoFacturaSeverity(
        idEstado: string,
    ): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
        const e = ESTADOS_FACTURA.find((ef) => ef.value === idEstado);
        return (e?.severity as any) || 'info';
    }

    openCrearGuia() {
        this.editingGuia = {} as GuiaDespacho;
        this.guiaDialogVisible = true;
    }

    editGuia(guia: GuiaDespacho) {
        this.editingGuia = { ...guia };
        this.guiaDialogVisible = true;
    }

    onSaveGuia(guia: GuiaDespacho) {
        const idx = this.guias().findIndex((g) => g.id === guia.id);
        if (idx >= 0) {
            const updated = [...this.guias()];
            updated[idx] = { ...guia };
            this.guias.set(updated);
            this.messageService.add({
                severity: 'success',
                summary: 'Guía actualizada',
                detail: `${guia.numeroGuia} modificada exitosamente.`,
            });
        } else {
            guia.id = `g-${Date.now()}`;
            this.guias.set([guia, ...this.guias()]);
            this.messageService.add({
                severity: 'success',
                summary: 'Guía creada',
                detail: `${guia.numeroGuia} registrada exitosamente.`,
            });
        }
    }

    deleteGuia(guia: GuiaDespacho) {
        this.confirmationService.confirm({
            message: `¿Eliminar la guía <strong>${guia.numeroGuia}</strong>?`,
            header: 'Confirmar Eliminación',
            icon: 'pi pi-exclamation-triangle',
            accept: () => {
                this.guias.set(this.guias().filter((g) => g.id !== guia.id));
                this.messageService.add({
                    severity: 'success',
                    summary: 'Eliminada',
                    detail: `Guía ${guia.numeroGuia} eliminada.`,
                });
            },
        });
    }
}
