import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService } from 'primeng/api';
import { NotificationService } from '@/app/services/notification.service';

import { ViajeService } from '@/app/services/viaje.service';
import { AuthService } from '@/app/auth/service/auth.service';
import { ViajeAdmin, IncidenciaParada } from '@/app/services/viaje.types';
import { TipoIncidenciaPipe } from '@/app/shared/pipes/tipo-incidencia.pipe';

interface HistorialParada {
    idFactura: string;
    numeroFactura: string;
    numeroGuia: string;
    cliente: string;
    municipio: string;
    estado: string;
    incidenciaTipo?: string;
    incidenciaDescripcion?: string;
    incidenciaFoto?: string;
    incidenciaFecha?: string;
    incidenciaRecuperable?: boolean;
    incidencias?: IncidenciaParada[];
    telefono?: string;
    direccion?: string;
    montoDolares?: number | null;
    referencia?: string | null;
    contacto?: string | null;
    notaSucursal?: string | null;
    horaDesde?: string | null;
    horaHasta?: string | null;
}

interface HistorialViaje {
    viaje: ViajeAdmin;
    paradas: HistorialParada[];
}

@Component({
    selector: 'app-historial-entregas',
    standalone: true,
    imports: [
        CommonModule,
        TagModule,
        ButtonModule,
        SkeletonModule,
        TableModule,
        ConfirmDialogModule,
        ToastModule,
        TooltipModule,
        TipoIncidenciaPipe,
    ],
    providers: [ConfirmationService],
    templateUrl: './historial-entregas.component.html',
})
export class HistorialEntregasComponent implements OnInit {
    private viajeService = inject(ViajeService);
    private authService = inject(AuthService);
    private confirmationService = inject(ConfirmationService);
    private notif = inject(NotificationService);

    cargando = signal(true);
    private viajesFinalizados = signal<ViajeAdmin[]>([]);
    private incidenciasMap = new Map<string, any>();
    eliminandoId = signal<string | null>(null);

    historial = computed<HistorialViaje[]>(() =>
        this.viajesFinalizados()
            .map((v) => ({ viaje: v, paradas: this.mapearParadas(v) }))
            .filter((h) => h.paradas.length > 0),
    );

    constructor() {}

    async ngOnInit() {
        try {
            const [viajes, incidencias] = await Promise.all([
                this.viajeService.obtenerViajes(),
                this.authService.client
                    .from('incidencias')
                    .select(
                        'id_detalle_fact, tipo_incidencia, descripcion, foto_evidencia_url, hora_reporte',
                    )
                    .order('hora_reporte', { ascending: false }),
            ]);
            for (const inc of (incidencias.data || []) as any[]) {
                if (!this.incidenciasMap.has(inc.id_detalle_fact)) {
                    this.incidenciasMap.set(inc.id_detalle_fact, inc);
                }
            }
            this.viajesFinalizados.set(
                (viajes || []).filter((v) => v.estado === 'finalizado'),
            );
        } catch (err) {
            console.error('Error cargando historial de entregas:', err);
        } finally {
            this.cargando.set(false);
        }
    }

    private mapearParadas(v: ViajeAdmin): HistorialParada[] {
        return (v.paradas || []).map((p) => {
            const inc = this.incidenciasMap.get(p.id_factura);
            return {
                idFactura: p.id_factura,
                numeroFactura: p.numero_factura || '',
                numeroGuia: p.codigo_guia || '',
                cliente: p.nombre_cliente || '—',
                municipio: p.municipio || '',
                estado: p.estado_factura || '',
                incidenciaTipo: inc?.tipo_incidencia,
                incidenciaDescripcion: inc?.descripcion,
                incidenciaFoto: inc?.foto_evidencia_url,
                incidenciaFecha: inc?.hora_reporte,
                incidenciaRecuperable: p.incidencia_recuperable,
                incidencias: p.incidencias,
                telefono: p.telefono ?? undefined,
                direccion: p.direccion,
                montoDolares: p.monto_dolares,
                referencia: p.referencia,
                contacto: p.contacto,
                notaSucursal: p.nota_sucursal,
                horaDesde: p.hora_desde,
                horaHasta: p.hora_hasta,
            };
        });
    }

    /** Filas (facturas) expandidas en el historial. Una a la vez. */
    readonly filaExpandida = signal<Record<string, boolean>>({});

    toggleFila(id: string) {
        this.filaExpandida.update((mapa) =>
            mapa[id] ? {} : { [id]: true },
        );
    }

    esRecuperable(p: HistorialParada): boolean {
        return p.incidenciaRecuperable === true;
    }

    readonly togglingRecuperableId = signal<string | null>(null);

    async toggleRecuperable(inc: IncidenciaParada) {
        if (!inc.id_incidencia || this.togglingRecuperableId()) return;
        this.togglingRecuperableId.set(inc.id_incidencia);
        const objetivo = inc.recuperable === true ? false : true;
        try {
            await this.viajeService.setIncidenciaRecuperable(inc.id_incidencia, objetivo);
            this.notif.add({
                severity: 'success',
                summary: objetivo ? 'Re-despachable' : 'Terminal',
                detail: `Incidencia marcada como ${
                    objetivo ? 'recuperable' : 'no recuperable'
                }.`,
            });
            await this.ngOnInit();
        } catch (err: any) {
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo cambiar la incidencia.',
            });
        } finally {
            this.togglingRecuperableId.set(null);
        }
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

    /** Pide confirmación y borra el viaje (para pruebas). */
    borrarViaje(v: ViajeAdmin) {
        this.confirmationService.confirm({
            message: `¿Borrar el viaje de ${v.chofer || 'Chofer'}? Se eliminarán el viaje, el historial de estados, las incidencias y sus fotos. Esto es irreversible (para pruebas).`,
            header: 'Borrar viaje',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'Borrar',
            acceptIcon: 'pi pi-trash',
            rejectLabel: 'Cancelar',
            acceptButtonStyleClass: 'p-button-danger',
            accept: () => void this.confirmarBorrar(v),
        });
    }

    private async confirmarBorrar(v: ViajeAdmin) {
        if (this.eliminandoId()) return;
        this.eliminandoId.set(v.id_viaje);
        try {
            const res = await this.viajeService.eliminarViaje(v.id_viaje);
            if (res.fotos_eliminadas?.length) {
                await this.viajeService
                    .borrarFotosIncidencia(res.fotos_eliminadas)
                    .catch((err) =>
                        console.warn('No se pudieron borrar fotos de incidencia del storage', err),
                    );
            }
            this.viajesFinalizados.update((lista) =>
                lista.filter((x) => x.id_viaje !== v.id_viaje),
            );
            this.notif.add({
                severity: 'success',
                summary: 'Viaje borrado',
                detail: 'El viaje y sus datos asociados se eliminaron.',
            });
        } catch (err: any) {
            console.error('Error al borrar viaje', err);
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo borrar el viaje.',
            });
        } finally {
            this.eliminandoId.set(null);
        }
    }
}
