import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { ChipModule } from 'primeng/chip';
import { DividerModule } from 'primeng/divider';
import { BadgeModule } from 'primeng/badge';
import { CardModule } from 'primeng/card';
import { SkeletonModule } from 'primeng/skeleton';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';

import { NotificationService } from '@/app/services/notification.service';

import { CargaCombustible, TIPOS_COMBUSTIBLE } from './data/combustible-mock';
import { CombustibleDialogComponent } from './components/combustible-dialog.component';
import { TanqueGaugeComponent } from './components/tanque-gauge.component';
import { CargaCombustibleService } from './service/carga-combustible.service';
import { VehiculoService } from '../service/vehiculo.service';

interface VehiculoConsolidado {
    id: string;
    placa: string;
    desc: string;
    totalCargas: number;
    totalLitros: number;
    totalGastado: number;
    ultimaCarga: CargaCombustible | null;
}

@Component({
    selector: 'app-combustible',
    standalone: true,
    imports: [
        CommonModule,
        TableModule,
        ButtonModule,
        TooltipModule,
        TagModule,
        ChipModule,
        DividerModule,
        BadgeModule,
        CardModule,
        SkeletonModule,
        ConfirmDialogModule,
        ToastModule,
        CombustibleDialogComponent,
        TanqueGaugeComponent,
    ],
    providers: [ConfirmationService],
    templateUrl: './combustible.component.html',
})
export class CombustibleComponent {
    private cargaService = inject(CargaCombustibleService);
    private vehiculoService = inject(VehiculoService);
    private notif = inject(NotificationService);
    private confirmationService = inject(ConfirmationService);

    cargando = signal(true);
    registros = signal<CargaCombustible[]>([]);
    vehiculos = signal<{ id: string; placa: string; desc: string }[]>([]);
    dialogVisible = signal(false);
    editingRecord = signal<CargaCombustible>({} as CargaCombustible);
    eliminandoId = signal<string | null>(null);

    tipos = TIPOS_COMBUSTIBLE;

    get tipoLabels(): Record<string, string> {
        const map: Record<string, string> = {};
        this.tipos.forEach((t) => (map[t.value] = t.label));
        return map;
    }

    readonly consolidado = computed<VehiculoConsolidado[]>(() => {
        const cargas = this.registros();
        const mapa = new Map<string, VehiculoConsolidado>();
        for (const v of this.vehiculos()) {
            const propias = cargas.filter((r) => r.idVehiculo === v.id);
            mapa.set(v.id, {
                id: v.id,
                placa: v.placa,
                desc: v.desc,
                totalCargas: propias.length,
                totalLitros: propias.reduce((s, r) => s + r.litrosCargados, 0),
                totalGastado: propias.reduce((s, r) => s + r.costoTotal, 0),
                ultimaCarga: propias.length
                    ? [...propias].sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
                    : null,
            });
        }
        return Array.from(mapa.values());
    });

    get consumoTanque(): number {
        return this.registros().reduce((s, r) => s + r.litrosCargados, 0);
    }

    get costoTotalGlobal(): number {
        return this.registros().reduce((s, r) => s + r.costoTotal, 0);
    }

    constructor() {
        void this.cargarDatos();
    }

    private async cargarDatos() {
        this.cargando.set(true);
        try {
            const [cargas, vehiculos] = await Promise.all([
                this.cargaService.obtenerCargas(),
                this.vehiculoService.obtenerVehiculos(),
            ]);
            this.registros.set([...cargas].sort((a, b) => b.fecha.localeCompare(a.fecha)));
            this.vehiculos.set(
                vehiculos.map((v) => ({
                    id: v.id_vehiculo || v.id || '',
                    placa: v.placa || '',
                    desc: `${v.marca || ''} ${v.modelo || ''} (${v.anio || ''})`.trim(),
                })),
            );
        } catch (err: any) {
            console.error('Error cargando combustible:', err);
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudieron cargar las cargas de combustible.',
            });
        } finally {
            this.cargando.set(false);
        }
    }

    openNew() {
        this.editingRecord.set({} as CargaCombustible);
        this.dialogVisible.set(true);
    }

    openEdit(record: CargaCombustible) {
        this.editingRecord.set({ ...record });
        this.dialogVisible.set(true);
    }

    async onSave(carga: CargaCombustible) {
        try {
            if (carga.id) {
                await this.cargaService.actualizarCarga(carga);
                this.notif.add({
                    severity: 'success',
                    summary: 'Actualizado',
                    detail: 'Carga de combustible actualizada.',
                });
            } else {
                const id = await this.cargaService.crearCarga(carga);
                this.notif.add({
                    severity: 'success',
                    summary: 'Registrada',
                    detail: 'Carga de combustible registrada.',
                });
                void id;
            }
            await this.cargarDatos();
        } catch (err: any) {
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo guardar la carga.',
            });
        }
    }

    deleteRecord(record: CargaCombustible) {
        this.confirmationService.confirm({
            message: `¿Eliminar la carga del ${record.fecha} de la unidad ${record.placaVehiculo}?`,
            header: 'Confirmar eliminación',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Eliminar',
            acceptIcon: 'pi pi-trash',
            acceptButtonStyleClass: 'p-button-danger',
            rejectLabel: 'Cancelar',
            accept: () => void this.confirmarEliminar(record),
        });
    }

    private async confirmarEliminar(record: CargaCombustible) {
        if (!record.id || this.eliminandoId()) return;
        this.eliminandoId.set(record.id);
        try {
            await this.cargaService.eliminarCarga(record.id);
            this.notif.add({
                severity: 'success',
                summary: 'Eliminada',
                detail: 'Carga de combustible eliminada.',
            });
            await this.cargarDatos();
        } catch (err: any) {
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo eliminar la carga.',
            });
        } finally {
            this.eliminandoId.set(null);
        }
    }
}
