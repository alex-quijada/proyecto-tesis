import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';

import { DriverStoreService } from '../../services/driver-store.service';
import { AuthService } from '@/app/auth/service/auth.service';
import { ViajeService } from '@/app/services/viaje.service';
import { ViajeAdmin } from '@/app/services/viaje.types';
import {
    IncidenciaDialogComponent,
    IncidenciaGuia,
    IncidenciaDatos,
} from '../../components/incidencia-dialog/incidencia-dialog.component';

const TIPOS_INCIDENCIA_RECUPERABLES = ['FUERA_HORARIO', 'CERRADO', 'FALTANTE', 'DANADO'];

@Component({
    selector: 'app-historial',
    standalone: true,
    imports: [
        CommonModule,
        ButtonModule,
        TooltipModule,
        TagModule,
        SkeletonModule,
        TableModule,
        IncidenciaDialogComponent,
    ],
    templateUrl: './historial.component.html',
})
export class HistorialComponent implements OnInit {
    store = inject(DriverStoreService);
    private authService = inject(AuthService);
    private viajeService = inject(ViajeService);

    cargando = signal(true);
    private viajes = signal<ViajeAdmin[]>([]);
    soloIncidencias = signal(false);

    /** Viaje actual primero, luego los finalizados. */
    readonly viajesHistorial = computed<ViajeAdmin[]>(() => {
        const actuales = this.viajes().filter(
            (v) => v.estado === 'proceso' || v.estado === 'programado',
        );
        const finalizados = this.viajes().filter((v) => v.estado === 'finalizado');
        const lista = [...actuales, ...finalizados];
        if (!this.soloIncidencias()) return lista;
        return lista.filter(
            (v) => v.estado !== 'finalizado' || v.paradas?.some((p) => p.incidencia_tipo),
        );
    });

    esViajeActual(v: ViajeAdmin): boolean {
        return v.estado === 'proceso' || v.estado === 'programado';
    }

    /** Solo se puede reportar incidencia en facturas del viaje en curso ('proceso'). */
    esReportable(v: ViajeAdmin, p: ViajeAdmin['paradas'][number]): boolean {
        return v.estado === 'proceso' && p.estado_factura !== 'finalizado';
    }

    incidenciaGuia = signal<ViajeAdmin['paradas'][number] | null>(null);

    constructor() {}

    async ngOnInit() {
        await this.cargar();
    }

    async cargar() {
        this.cargando.set(true);
        try {
            const uid = this.authService.getCurrentUser()?.id;
            if (uid) {
                this.viajes.set(await this.viajeService.obtenerViajesChofer(uid));
            }
        } catch (err) {
            console.error('Error cargando historial de entregas:', err);
        } finally {
            this.cargando.set(false);
        }
    }

    toggleSoloIncidencias() {
        this.soloIncidencias.update((v) => !v);
    }

    esRecuperable(tipo?: string): boolean {
        return !!tipo && TIPOS_INCIDENCIA_RECUPERABLES.includes(tipo);
    }

    estadoSeverity(estado: string): 'success' | 'danger' | 'warn' | 'info' | 'secondary' {
        switch (estado) {
            case 'finalizado':
                return 'success';
            case 'incidencia':
                return 'danger';
            case 'entrega':
            case 'espera':
                return 'warn';
            case 'proceso':
                return 'info';
            default:
                return 'secondary';
        }
    }

    estadoLabel(estado: string): string {
        switch (estado) {
            case 'finalizado':
                return 'Entregado';
            case 'incidencia':
                return 'Incidencia';
            case 'entrega':
                return 'Entregando';
            case 'espera':
                return 'En espera';
            case 'proceso':
                return 'En camino';
            case 'embarque':
                return 'En carga';
            default:
                return estado || '—';
        }
    }

    formatFecha(fecha?: string | null): string {
        if (!fecha) return '—';
        return new Date(fecha).toLocaleString('es-VE', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    abrirIncidencia(p: ViajeAdmin['paradas'][number]) {
        this.incidenciaGuia.set(p);
    }

    get incidenciaGuiaData(): IncidenciaGuia | null {
        const p = this.incidenciaGuia();
        return p
            ? {
                  cliente: p.nombre_cliente || '',
                  numeroGuia: p.codigo_guia || '',
                  numeroFactura: p.numero_factura || '',
              }
            : null;
    }

    cerrarIncidencia() {
        this.incidenciaGuia.set(null);
    }

    async onIncidenciaConfirmada(datos: IncidenciaDatos) {
        // En el historial solo se reporta incidencia sobre entregas previas;
        // se deja el flujo por si se quiere re-reportar.
        const p = this.incidenciaGuia();
        if (!p) return;
        try {
            await this.store.reportarIncidencia(
                p.id_factura,
                datos.descripcion,
                datos.tipo,
                datos.foto || undefined,
            );
            await this.cargar();
        } finally {
            this.cerrarIncidencia();
        }
    }
}
