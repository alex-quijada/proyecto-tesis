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

import { ViajeService, TrazaViajePunto } from '@/app/services/viaje.service';
import { AuthService } from '@/app/auth/service/auth.service';
import { ViajeAdmin, IncidenciaParada } from '@/app/services/viaje.types';
import { TipoIncidenciaPipe } from '@/app/shared/pipes/tipo-incidencia.pipe';
import { MetricasDesvio, calcularMetricasDesvio } from './devios.util';
import { environment } from '@/environments/environment';

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

    // ---------------- Análisis de ruta (planificada vs real) ----------------

    /** Viajes con el acordeón de análisis abierto. */
    readonly analisisAbierto = signal<Record<string, boolean>>({});

    toggleAnalisis(idViaje: string) {
        const abierto = !this.analisisAbierto()[idViaje];
        this.analisisAbierto.update((mapa) => ({ ...mapa, [idViaje]: abierto }));
        if (abierto) void this.cargarAnalisis(idViaje);
        else this.limpiarMapaAnalisis(idViaje);
    }

    private trazas = new Map<string, TrazaViajePunto[]>();
    private metricas = new Map<string, MetricasDesvio | null>();
    private analisisCargando = new Map<string, boolean>();
    private analisisError = new Map<string, string>();

    cargandoAnalisis(idViaje: string): boolean {
        return this.analisisCargando.get(idViaje) ?? false;
    }

    errorAnalisis(idViaje: string): string {
        return this.analisisError.get(idViaje) ?? '';
    }

    metricasAnalisis(idViaje: string): MetricasDesvio | null {
        return this.metricas.get(idViaje) ?? null;
    }

    trazaAnalisis(idViaje: string): TrazaViajePunto[] {
        return this.trazas.get(idViaje) ?? [];
    }

    private async cargarAnalisis(idViaje: string) {
        if (this.trazas.has(idViaje)) return;
        this.analisisCargando.set(idViaje, true);
        this.analisisError.set(idViaje, '');
        try {
            const traza = await this.viajeService.obtenerTrazaViaje(idViaje);
            this.trazas.set(idViaje, traza);
            const viaje = this.viajesFinalizados().find((v) => v.id_viaje === idViaje);
            const planeada = viaje?.ruta_detallada?.path ?? [];
            this.metricas.set(idViaje, calcularMetricasDesvio(traza, planeada));
            // Inicializar el mapa comparativo una vez que el div esté en el DOM.
            setTimeout(() => this.initMapaPorId(idViaje), 150);
        } catch (err: any) {
            this.analisisError.set(idViaje, err?.message || 'No se pudo cargar la traza.');
        } finally {
            this.analisisCargando.set(idViaje, false);
        }
    }

    private initMapaPorId(idViaje: string) {
        const el = document.getElementById(`mapa-analisis-${idViaje}`);
        if (el) this.initMapaAnalisis(idViaje, el);
    }

    // ---------------- Mapa comparativo ----------------

    private mapas = new Map<string, google.maps.Map>();
    private polylinesMapas = new Map<string, { planeada: google.maps.Polyline; real: google.maps.Polyline }>();

    initMapaAnalisis(idViaje: string, el: HTMLElement) {
        if (this.mapas.has(idViaje)) return;
        if (!el) return;
        if (el.clientHeight === 0) {
            // Aún no renderizado: reintentar en el siguiente frame.
            setTimeout(() => {
                const actual = document.getElementById(`mapa-analisis-${idViaje}`);
                if (actual) this.initMapaAnalisis(idViaje, actual);
            }, 200);
            return;
        }
        const mapa = new google.maps.Map(el, {
            center: { lat: environment.warehouseLat, lng: environment.warehouseLng },
            zoom: 11,
            mapId: 'seguimiento',
            disableDefaultUI: true,
        });
        this.mapas.set(idViaje, mapa);
        google.maps.event.addListenerOnce(mapa, 'idle', () => {
            const traza = this.trazas.get(idViaje) ?? [];
            const viaje = this.viajesFinalizados().find((v) => v.id_viaje === idViaje);
            const planeada = viaje?.ruta_detallada?.path ?? [];

            const realPath = traza
                .filter((t) => t.latitud != null && t.longitud != null)
                .map((t) => ({ lat: t.latitud, lng: t.longitud }));
            const planeadaPath = planeada.map((p) => ({ lat: p.lat, lng: p.lng }));

            const polylineReal = new google.maps.Polyline({
                path: realPath,
                strokeColor: '#ef4444',
                strokeWeight: 4,
                strokeOpacity: 0.9,
                map: mapa,
            });
            const polylinePlaneada = new google.maps.Polyline({
                path: planeadaPath,
                strokeColor: '#3b82f6',
                strokeWeight: 3,
                strokeOpacity: 0.9,
                map: mapa,
            });
            this.polylinesMapas.set(idViaje, {
                planeada: polylinePlaneada,
                real: polylineReal,
            });

            // Almacén (morado) + paradas (números).
            this.agregarMarcadorAlmacen(mapa);
            this.agregarMarcadoresParadas(mapa, viaje);

            // Encuadre que abarque ambas rutas.
            const bounds = new google.maps.LatLngBounds();
            for (const p of planeadaPath) bounds.extend(p);
            for (const p of realPath) bounds.extend(p);
            bounds.extend({ lat: environment.warehouseLat, lng: environment.warehouseLng });
            if (!bounds.isEmpty()) mapa.fitBounds(bounds, 60);
        });
    }

    private agregarMarcadorAlmacen(mapa: google.maps.Map) {
        const div = document.createElement('div');
        div.innerHTML =
            '<div style="width:26px;height:26px;background:#8b5cf6;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;"><svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></div>';
        new google.maps.marker.AdvancedMarkerElement({
            position: { lat: environment.warehouseLat, lng: environment.warehouseLng },
            map: mapa,
            content: div.firstElementChild as HTMLElement,
            title: 'Almacén central',
            zIndex: 1,
        });
    }

    private agregarMarcadoresParadas(mapa: google.maps.Map, viaje?: ViajeAdmin) {
        if (!viaje) return;
        const paradas = [...(viaje.paradas || [])].sort(
            (a, b) => a.orden_visita - b.orden_visita,
        );
        for (const [idx, p] of paradas.entries()) {
            if (p.latitud == null || p.longitud == null) continue;
            const div = document.createElement('div');
            div.innerHTML = `<div style="width:24px;height:24px;background:#f59e0b;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700">${idx + 1}</div>`;
            new google.maps.marker.AdvancedMarkerElement({
                position: { lat: p.latitud, lng: p.longitud },
                map: mapa,
                content: div.firstElementChild as HTMLElement,
                title: `${idx + 1} · ${p.nombre_cliente || ''}`,
                zIndex: 2,
            });
        }
    }

    /** Limpia el mapa comparativo de un viaje (al cerrar el análisis o destruir). */
    limpiarMapaAnalisis(idViaje: string) {
        const polylines = this.polylinesMapas.get(idViaje);
        if (polylines) {
            polylines.planeada.setMap(null);
            polylines.real.setMap(null);
            this.polylinesMapas.delete(idViaje);
        }
        const mapa = this.mapas.get(idViaje);
        if (mapa) {
            google.maps.event.clearInstanceListeners(mapa);
            this.mapas.delete(idViaje);
        }
    }
}
