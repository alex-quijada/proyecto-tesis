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
    ESTADOS_FACTURA,
    ESTADOS_GUIA,
} from './data/rutas-mock';
import { AuthService } from '../../../auth/service/auth.service';
import { RutaService } from './services/ruta.service';
import { MunicipioService } from '../../services/municipio.service';

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
    private rutaService = inject(RutaService);
    private municipioService = inject(MunicipioService);

    guias = signal<GuiaDespacho[]>([]);
    rutas = signal<Ruta[]>([]);
    estadosFacturaMap = signal<Record<string, string>>({});
    loading = signal(false);

    guiaDialogVisible = false;
    editingGuia: GuiaDespacho = {} as GuiaDespacho;
    userRole: string = 'ADMIN';

    filtroMunicipio: string | null = null;

    get municipioFiltros() {
        return [
            { label: 'Todos los Municipios', value: null },
            ...this.municipioService.items().map((m) => ({ label: m.label, value: m.value })),
        ];
    }

    get municipioMap(): Record<string, string> {
        const map: Record<string, string> = {};
        for (const m of this.municipioService.items()) {
            map[m.value] = m.label;
        }
        return map;
    }

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

    async ngOnInit() {
        this.loading.set(true);
        await this.municipioService.obtenerTodos();
        try {
            const [guias, estados] = await Promise.all([
                this.rutaService.obtenerGuias(),
                this.rutaService.obtenerEstados(),
            ]);
            this.guias.set(guias);

            const estadosMap: Record<string, string> = {};
            for (const e of estados) {
                estadosMap[e.nombre_estado] = e.nombre_estado;
            }
            this.estadosFacturaMap.set(estadosMap);
        } catch (err) {
            console.error('Error cargando guías:', err);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudieron cargar las guías de despacho.',
            });
        } finally {
            this.loading.set(false);
        }
    }

    get guiasFiltradas(): GuiaDespacho[] {
        let list = this.guias();
        if (this.filtroMunicipio) {
            list = list.filter((g) => g.municipio === this.filtroMunicipio);
        }
        return list;
    }

    getMunicipioLabel(id: string): string {
        return this.municipioMap[id] || id;
    }

    onRowExpand(event: any) {}

    onRowCollapse(event: any) {}

    getEstadoFacturaLabel(estado: string): string {
        const label = this.estadosFacturaMap()[estado];
        if (label) return label.charAt(0).toUpperCase() + label.slice(1);
        const e = ESTADOS_FACTURA.find((ef) => ef.value === estado);
        return e?.label || estado;
    }

    getEstadoFacturaSeverity(
        estado: string,
    ): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
        const dbValue = this.estadosFacturaMap()[estado];
        if (dbValue) {
            const e = ESTADOS_FACTURA.find((ef) => ef.value === dbValue);
            if (e) return e.severity as any;
        }
        const ef = ESTADOS_FACTURA.find((ef) => ef.value === estado);
        return (ef?.severity as any) || 'info';
    }

    getEstadoGuia(guia: GuiaDespacho): string {
        const facturas = guia.facturas;
        if (!facturas?.length) return 'NUEVO';

        const estados = facturas.map((f) => f.idEstado);

        if (estados.some((e) => e === 'incidencia')) return 'INCIDENCIAS';
        if (estados.some((e) => e === 'proceso')) return 'EN_PROCESO';
        if (estados.some((e) => e === 'espera')) return 'EN_ESPERA';
        if (estados.some((e) => e === 'embarque')) return 'EN_CARGA_MERCANCIA';
        if (estados.every((e) => e === 'finalizado')) return 'FINALIZADO';

        return 'NUEVO';
    }

    getEstadoGuiaSeverity(
        estado: string,
    ): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
        const e = ESTADOS_GUIA.find((eg) => eg.value === estado);
        return (e?.severity as any) || 'info';
    }

    getEstadoGuiaLabel(estado: string): string {
        const e = ESTADOS_GUIA.find((eg) => eg.value === estado);
        return e?.label || estado;
    }

    openCrearGuia() {
        this.editingGuia = {} as GuiaDespacho;
        this.guiaDialogVisible = true;
    }

    editGuia(guia: GuiaDespacho) {
        const original = this.guias().find((g) => g.id === guia.id);
        this.editingGuia = original ? { ...original } : { ...guia };
        this.guiaDialogVisible = true;
    }

    async onSaveGuia(guia: GuiaDespacho) {
        if (!guia.facturas?.length) {
            this.messageService.add({
                severity: 'error',
                summary: 'Factura requerida',
                detail: 'La guía debe tener al menos una factura para ser registrada.',
            });
            return;
        }

        try {
            const guias = await this.rutaService.obtenerGuias();
            this.guias.set(guias);
            this.messageService.add({
                severity: 'success',
                summary: 'Guía guardada',
                detail: `${guia.numeroGuia} procesada exitosamente.`,
            });
        } catch (err: any) {
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'Error al recargar las guías.',
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
