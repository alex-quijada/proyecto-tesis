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
import { ChipModule } from 'primeng/chip';

import { GuiaDialogComponent } from './components/guia-dialog.component';
import { RutaDialogComponent } from './components/ruta-dialog.component';
import { GuiaDespacho, Ruta, GUIAS_MOCK, RUTAS_MOCK, ESTADOS_GUIA, MUNICIPIOS_NUEVA_ESPARTA } from './data/rutas-mock';

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
        TagModule,
        SelectModule,
        ConfirmDialogModule,
        TooltipModule,
        ChipModule,
        GuiaDialogComponent,
        RutaDialogComponent,
    ],
    providers: [ConfirmationService, MessageService],
    templateUrl: './rutas.component.html',
})
export class RutasComponent implements OnInit {
    private messageService = inject(MessageService);
    private confirmationService = inject(ConfirmationService);

    guias = signal<GuiaDespacho[]>([]);
    rutas = signal<Ruta[]>([]);

    guiaDialogVisible = false;
    rutaDialogVisible = false;
    editingGuia: GuiaDespacho = {} as GuiaDespacho;

    filtroEstado: string | null = null;
    filtroMunicipio: string | null = null;

    estadoFiltros = [
        { label: 'Todos los Estados', value: null },
        ...ESTADOS_GUIA.map(e => ({ label: e.label, value: e.value })),
    ];

    municipioFiltros = [
        { label: 'Todos los Municipios', value: null },
        ...MUNICIPIOS_NUEVA_ESPARTA.map(m => ({ label: m.label, value: m.value })),
    ];

    estadoLabels: Record<string, string> = {};
    estadoSeverities: Record<string, 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast'> = {
        EN_PROCESO: 'info',
        CARGADO: 'warn',
        EN_ESPERA: 'warn',
        FINALIZADO: 'success',
    };

    constructor() {
        for (const e of ESTADOS_GUIA) {
            this.estadoLabels[e.value] = e.label;
            this.estadoSeverities[e.value] = e.severity as any;
        }
    }

    ngOnInit() {
        this.guias.set([...GUIAS_MOCK]);
        this.rutas.set([...RUTAS_MOCK]);
    }

    get guiasFiltradas(): GuiaDespacho[] {
        let list = this.guias();
        if (this.filtroEstado) {
            list = list.filter(g => g.estado === this.filtroEstado);
        }
        if (this.filtroMunicipio) {
            list = list.filter(g => g.municipio === this.filtroMunicipio);
        }
        return list;
    }

    getEstadoLabel(estado: string): string {
        return this.estadoLabels[estado] || estado;
    }

    getEstadoSeverity(estado: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
        return this.estadoSeverities[estado] || 'info';
    }

    onRowExpand(event: any) {}

    onRowCollapse(event: any) {}

    openNuevaGuia() {
        this.editingGuia = {} as GuiaDespacho;
        this.guiaDialogVisible = true;
    }

    openNuevaRuta() {
        this.rutaDialogVisible = true;
    }

    editGuia(guia: GuiaDespacho) {
        this.editingGuia = { ...guia };
        this.guiaDialogVisible = true;
    }

    onSaveGuia(guia: GuiaDespacho) {
        const idx = this.guias().findIndex(g => g.id === guia.id);
        if (idx >= 0) {
            const updated = [...this.guias()];
            updated[idx] = { ...guia };
            this.guias.set(updated);
            this.messageService.add({ severity: 'success', summary: 'Guía actualizada', detail: `${guia.numeroGuia} modificada exitosamente.` });
        } else {
            guia.id = `g-${Date.now()}`;
            this.guias.set([guia, ...this.guias()]);
            this.messageService.add({ severity: 'success', summary: 'Guía creada', detail: `${guia.numeroGuia} registrada exitosamente.` });
        }
    }

    onSaveRuta(ruta: Ruta) {
        ruta.id = `r-${Date.now()}`;
        ruta.estado = 'PENDIENTE';
        this.rutas.set([ruta, ...this.rutas()]);
        this.messageService.add({ severity: 'success', summary: 'Ruta creada', detail: `Ruta ${ruta.codigo} asignada exitosamente.` });
    }

    deleteGuia(guia: GuiaDespacho) {
        this.confirmationService.confirm({
            message: `¿Eliminar la guía <strong>${guia.numeroGuia}</strong> de ${guia.nombreCliente}?`,
            header: 'Confirmar Eliminación',
            icon: 'pi pi-exclamation-triangle',
            accept: () => {
                this.guias.set(this.guias().filter(g => g.id !== guia.id));
                this.messageService.add({ severity: 'success', summary: 'Eliminada', detail: `Guía ${guia.numeroGuia} eliminada.` });
            },
        });
    }
}
