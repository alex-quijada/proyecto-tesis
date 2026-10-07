import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfirmationService } from 'primeng/api';
import { NotificationService } from '@/app/services/notification.service';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ToolbarModule } from 'primeng/toolbar';
import { InputTextModule } from 'primeng/inputtext';
import { InputIconModule } from 'primeng/inputicon';
import { IconFieldModule } from 'primeng/iconfield';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { ChipModule } from 'primeng/chip';

import { GuiaDialogComponent } from './components/guia-dialog.component';
import { GuiaDespacho, Ruta, ESTADOS_FACTURA, ESTADOS_GUIA } from './data/rutas-mock';
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
        SkeletonModule,
        ConfirmDialogModule,
        TooltipModule,
        ChipModule,
        GuiaDialogComponent,
    ],
    providers: [ConfirmationService],
    templateUrl: './rutas.component.html',
})
export class RutasComponent implements OnInit {
    private notif = inject(NotificationService);
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
    busqueda = signal('');

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
            this.notif.add({
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
        const texto = this.busqueda().trim().toLowerCase();
        if (texto) {
            list = list.filter((g) => {
                const facturasMatch = (g.facturas || []).some(
                    (f) =>
                        (f.numeroFactura || '').toLowerCase().includes(texto) ||
                        (f.nombreCliente || '').toLowerCase().includes(texto) ||
                        (f.rifCliente || '').toLowerCase().includes(texto),
                );
                if (facturasMatch) return true;
                return [g.numeroGuia, g.empresa, g.nombreChofer, g.municipio, g.placaVehiculo].some(
                    (v) => (v || '').toLowerCase().includes(texto),
                );
            });
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

        if (estados.every((e) => e === 'cancelada')) return 'CANCELADO';
        if (estados.some((e) => e === 'incidencia')) return 'INCIDENCIAS';
        if (estados.some((e) => e === 'entrega')) return 'ENTREGANDO';
        if (estados.some((e) => e === 'proceso')) return 'EN_PROCESO';
        if (estados.some((e) => e === 'espera')) return 'EN_ESPERA';
        if (estados.some((e) => e === 'embarque')) return 'EN_CARGA_MERCANCIA';
        if (estados.every((e) => e === 'finalizado')) return 'FINALIZADO';

        return 'NUEVO';
    }

    /** Una guía es cancelable solo si TODAS sus facturas están en nuevo/embarque. */
    puedeCancelar(guia: GuiaDespacho): boolean {
        if (!guia.facturas?.length) return false;
        return guia.facturas.every((f) => f.idEstado === 'nuevo' || f.idEstado === 'embarque');
    }

    /**
     * Una guía se puede editar si:
     * 1) Todas sus facturas están en 'nuevo' o 'embarque' (el viaje aún no ha iniciado).
     * 2) O si ninguna factura está en tránsito activo ('proceso', 'espera', 'entrega') y tiene al menos una factura con 'incidencia' (disponible para re-despacho).
     *
     * Se bloquea si:
     * - Tiene facturas en tránsito activo ('proceso', 'espera', 'entrega').
     * - O todas sus facturas ya están 'finalizado' o 'cancelada'.
     */
    puedeEditar(guia: GuiaDespacho): boolean {
        if (!guia.facturas?.length) return true;
        const estados = guia.facturas.map((f) => f.idEstado?.toLowerCase() || 'nuevo');

        // Si tiene alguna factura en tránsito activo, no se puede editar
        const enTransito = estados.some(
            (e) => e === 'proceso' || e === 'espera' || e === 'entrega',
        );
        if (enTransito) return false;

        // Si todas están en nuevo o embarque, sí se puede editar
        const todasIniciales = estados.every((e) => e === 'nuevo' || e === 'embarque');
        if (todasIniciales) return true;

        // Si tiene alguna factura con incidencia y ninguna en tránsito activo, se permite editar para reasignar/re-despachar
        const tieneIncidencia = estados.some((e) => e === 'incidencia');
        if (tieneIncidencia) return true;

        // Si todas están finalizadas o canceladas, no se puede editar
        return false;
    }

    tooltipEditar(guia: GuiaDespacho): string {
        if (this.puedeEditar(guia)) {
            const tieneInc = guia.facturas?.some((f) => f.idEstado?.toLowerCase() === 'incidencia');
            return tieneInc ? 'Editar guía (Re-despachar incidencias)' : 'Editar guía';
        }
        const estados = (guia.facturas || []).map((f) => f.idEstado?.toLowerCase() || '');
        if (estados.some((e) => e === 'proceso' || e === 'espera' || e === 'entrega')) {
            return 'No se puede editar: el viaje está en curso';
        }
        if (estados.length > 0 && estados.every((e) => e === 'finalizado')) {
            return 'No se puede editar: todas las entregas fueron finalizadas';
        }
        if (estados.length > 0 && estados.every((e) => e === 'cancelada' || e === 'cancelado')) {
            return 'No se puede editar: la guía está cancelada';
        }
        return 'No se puede editar en su estado actual';
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
        if (!this.puedeEditar(guia)) {
            this.notif.add({
                severity: 'warn',
                summary: 'Edición no permitida',
                detail: this.tooltipEditar(guia),
            });
            return;
        }
        const original = this.guias().find((g) => g.id === guia.id);
        this.editingGuia = original ? { ...original } : { ...guia };
        this.guiaDialogVisible = true;
    }

    async onSaveGuia(guia: GuiaDespacho) {
        if (!guia.facturas?.length) {
            this.notif.add({
                severity: 'error',
                summary: 'Factura requerida',
                detail: 'La guía debe tener al menos una factura para ser registrada.',
            });
            return;
        }

        try {
            const guias = await this.rutaService.obtenerGuias();
            this.guias.set(guias);
            this.notif.add({
                severity: 'success',
                summary: 'Guía guardada',
                detail: `${guia.numeroGuia} procesada exitosamente.`,
            });
        } catch (err: any) {
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'Error al recargar las guías.',
            });
        }
    }

    cancelarGuia(guia: GuiaDespacho) {
        this.confirmationService.confirm({
            message: `¿Cancelar la guía <strong>${guia.numeroGuia}</strong>? Sus ${
                guia.facturas?.length || 0
            } factura(s) quedarán canceladas y se retirarán del viaje si estaba asignada.`,
            header: 'Cancelar Guía',
            icon: 'pi pi-ban',
            rejectButtonProps: { label: 'No', severity: 'secondary', outlined: true },
            acceptButtonProps: { label: 'Cancelar guía', icon: 'pi pi-ban', severity: 'danger' },
            accept: () => void this.confirmarCancelacion(guia),
        });
    }

    private async confirmarCancelacion(guia: GuiaDespacho) {
        try {
            const res = await this.rutaService.cancelarGuia(guia.id);
            const guias = await this.rutaService.obtenerGuias();
            this.guias.set(guias);
            this.notif.add({
                severity: 'success',
                summary: 'Guía cancelada',
                detail: `${res.total_facturas} factura(s) canceladas y retiradas del viaje.`,
            });
        } catch (err: any) {
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo cancelar la guía.',
            });
        }
    }
}
