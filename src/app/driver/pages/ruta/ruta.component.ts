import { Component, OnInit, inject, signal, computed, ViewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '@/app/services/notification.service';
import { ActivatedRoute, Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { SkeletonModule } from 'primeng/skeleton';

import { DriverStoreService } from '../../services/driver-store.service';
import { Entrega } from '../../services/driver-store.service';
import { FirmaDialogComponent } from '../../components/firma-dialog/firma-dialog.component';
import { ViajeService } from '@/app/services/viaje.service';
import {
    GoogleMapsOptimizationService,
    Waypoint,
} from '../../../admin/pages/map/map/google-maps-optimization.service';
import { environment } from '@/environments/environment';
import {
    esHoraDeVolver,
    duracionLegMin,
    tiempoViajeDistanciaMin,
    distanciaHasta,
} from '../../services/fuera-horario.util';

interface ParadaDisplay {
    id: string;
    ordenVisita: number;
    numeroGuia: string;
    numeroFactura: string;
    cliente: string;
    ruta: string;
    direccion: string;
    rif: string;
    precioCarga: number;
    estado: string;
    observaciones?: string;
    eventos: any[];
    latitud?: number;
    longitud?: number;
    empresaSuministro?: string;
}

@Component({
    selector: 'app-ruta',
    standalone: true,
    imports: [
        CommonModule,
        ButtonModule,
        TagModule,
        TooltipModule,
        SkeletonModule,
        FirmaDialogComponent,
    ],
    templateUrl: './ruta.component.html',
})
export class RutaComponent implements OnInit {
    store = inject(DriverStoreService);
    private notif = inject(NotificationService);
    private viajeService = inject(ViajeService);
    private googleOptimization = inject(GoogleMapsOptimizationService);
    private route = inject(ActivatedRoute);
    private router = inject(Router);

    paradas = signal<ParadaDisplay[]>([]);
    selectedGuia = signal<ParadaDisplay | null>(null);
    firmaGuia = signal<ParadaDisplay | null>(null);
    reordering = signal(false);
    optimizando = signal(false);
    cargando = signal(true);
    avisoIrMapa = signal(false);

    @ViewChild(FirmaDialogComponent) private firmaDialog!: FirmaDialogComponent;

    readonly activeViaje = computed(() => this.store.viajesChofer()[0] || null);

    readonly guiasPendientes = computed(() =>
        this.paradas().filter(
            (p) =>
                p.estado !== 'finalizado' && p.estado !== 'cancelado' && p.estado !== 'incidencia',
        ),
    );

    readonly guiasCompletadas = computed(() =>
        this.paradas().filter(
            (p) =>
                p.estado === 'finalizado' || p.estado === 'cancelado' || p.estado === 'incidencia',
        ),
    );

    readonly completedCount = computed(() => this.guiasCompletadas().length);

    /** Paradas pendientes con coordenadas (para estimar el viaje a la siguiente). */
    readonly pendientesConCoords = computed(() =>
        this.guiasPendientes().filter((p) => p.latitud != null && p.longitud != null),
    );

    /** Minutos estimados de viaje hasta la siguiente parada pendiente. Usa la
     *  duración del leg de la ruta detallada si existe; si no, desde el almacén
     *  (no hay posición del chofer en esta página). */
    readonly tiempoViajeSiguienteMin = computed(() => {
        const viaje = this.activeViaje();
        const pendientes = this.pendientesConCoords();
        if (pendientes.length < 1) return 0;
        const siguiente = pendientes[0];

        const legs = viaje?.ruta_detallada?.legs || [];
        if (legs.length > 0) {
            const idxLeg = Math.max(0, Math.min((siguiente.ordenVisita || 0) - 1, legs.length - 1));
            const dur = duracionLegMin(legs[idxLeg]);
            if (dur !== null) return Math.max(1, Math.round(dur));
        }

        const desde = { lat: environment.warehouseLat, lng: environment.warehouseLng };
        const dist = distanciaHasta(desde, {
            lat: siguiente.latitud!,
            lng: siguiente.longitud!,
        });
        return Math.max(1, Math.round(tiempoViajeDistanciaMin(dist)));
    });

    /** ¿Es hora de volver al almacén? horaActual + viaje + 12 (servicio) + 15 (gracia) > ventana_fin. */
    readonly esHoraDeVolver = computed(() => {
        const viaje = this.activeViaje();
        if (!viaje || viaje.estado !== 'proceso') return false;
        if (this.guiasPendientes().length < 1) return false;
        return esHoraDeVolver({
            ventanaFin: viaje.ventana_fin,
            horaActual: this.store.now(),
            tiempoViajeSiguienteMin: this.tiempoViajeSiguienteMin(),
        });
    });

    /** "Hora de volver al almacén": marca pendientes como FUERA_HORARIO y
     *  redirige al mapa para que navegue directo al almacén (allí se finaliza). */
    async volverAlAlmacen() {
        const viaje = this.activeViaje();
        if (!viaje || this.reordering()) return;
        try {
            const res = await this.viajeService.marcarFueraHorario(viaje.id_viaje);
            await this.store.recargarViajes();
            this.sincronizarParadas();
            this.store.volviendoAlAlmacen.set(true);
            this.notif.add({
                severity: 'warn',
                summary: 'Volviendo al almacén',
                detail:
                    res.total_marcadas > 0
                        ? `${res.total_marcadas} entrega(s) marcadas fuera de horario. Avanza al mapa para volver al almacén.`
                        : 'Las entregas pendientes ya estaban marcadas. Avanza al mapa para volver.',
            });
            this.router.navigate(['/driver/mapa']);
        } catch (err: any) {
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo marcar el viaje como fuera de horario.',
            });
        }
    }

    constructor() {
        // Re-sincroniza las paradas cuando el store recibe el viaje o las
        // guías (carga inicial, realtime, firma): así las tarjetas quedan
        // siempre con el mismo formato aunque una fuente llegue después.
        effect(() => {
            this.store.viajesChofer();
            this.store.guiasAsignadas();
            this.sincronizarParadas();
        });
    }

    async ngOnInit() {
        await this.store.verificarDatosAlEntrar();
        this.sincronizarParadas();
        this.cargando.set(false);

        const modo = this.route.snapshot.queryParams['modo'];
        if (modo === 'auto') {
            await this.optimizarRuta();
        } else if (modo === 'manual') {
            await this.store.refrescarTodo();
            this.sincronizarParadas();
            this.reordering.set(true);
        }
        if (modo) {
            // Limpiar el query param para que re-entrar no re-dispare la acción.
            await this.router.navigate([], { replaceUrl: true, queryParams: {} });
        }
    }

    private sincronizarParadas() {
        const viaje = this.store.viajesChofer()[0] || null;
        if (viaje) {
            const entregas = this.store.guiasAsignadas();
            this.paradas.set(
                (viaje.paradas || [])
                    .slice()
                    .sort((a, b) => a.orden_visita - b.orden_visita)
                    .map((p) => {
                        const entrega = entregas.find((e) => e.id === p.id_factura);
                        return {
                            id: p.id_factura,
                            ordenVisita: p.orden_visita,
                            numeroGuia: p.codigo_guia || entrega?.numeroGuia || p.id_guia || '',
                            numeroFactura: p.numero_factura || entrega?.numeroFactura || '',
                            cliente: p.nombre_cliente || entrega?.cliente || 'Sin cliente',
                            ruta: p.municipio || entrega?.ruta || '',
                            direccion: p.direccion || entrega?.direccion || '',
                            rif: entrega?.rif || '',
                            precioCarga: Number(p.monto_dolares) || entrega?.precioCarga || 0,
                            estado: p.estado_factura || entrega?.estado || 'embarque',
                            observaciones: entrega?.observaciones,
                            eventos: entrega?.eventos || [],
                            latitud: p.latitud ?? entrega?.latitud,
                            longitud: p.longitud ?? entrega?.longitud,
                            empresaSuministro: entrega?.empresaSuministro,
                        };
                    }),
            );
        } else {
            this.paradas.set([]);
        }
    }

    async optimizarRuta() {
        // Refrescar primero para trabajar con datos frescos de la BD.
        await this.store.refrescarTodo();
        this.sincronizarParadas();

        const conCoords = this.guiasPendientes().filter(
            (p) => p.latitud != null && p.longitud != null,
        );
        if (conCoords.length < 1) {
            this.notif.add({
                severity: 'warn',
                summary: 'Sin coordenadas',
                detail: 'Las paradas pendientes no tienen ubicación para calcular la ruta.',
            });
            return;
        }

        this.optimizando.set(true);
        try {
            const viaje = this.activeViaje();
            if (!viaje) {
                this.notif.add({
                    severity: 'warn',
                    summary: 'Sin viaje',
                    detail: 'No hay un viaje activo para guardar la ruta.',
                });
                return;
            }

            const waypoints: Waypoint[] = conCoords.map((p) => ({
                lat: p.latitud!,
                lng: p.longitud!,
                name: `${p.cliente} - ${p.numeroGuia || p.numeroFactura}`,
            }));
            const warehouse: Waypoint = {
                lat: environment.warehouseLat,
                lng: environment.warehouseLng,
                name: 'Almacén',
            };

            const result = await this.googleOptimization.optimize(waypoints, warehouse, warehouse);
            if (!result) {
                this.notif.add({
                    severity: 'info',
                    summary: 'Sin optimización',
                    detail: 'No se pudo calcular la ruta optimizada. Se mantiene el orden actual.',
                });
                return;
            }

            const pendientes = this.guiasPendientes();
            const ordenados = result.order.map((idx) => conCoords[idx]);
            const idsOrdenados = new Set(ordenados.map((p) => p.id));
            const sinCoords = pendientes.filter((p) => !idsOrdenados.has(p.id));

            this.paradas.set([...ordenados, ...sinCoords, ...this.guiasCompletadas()]);
            await this.persistirOrden();

            const detallada = await this.googleOptimization.getRutaDetallada(
                result.order.map((idx) => waypoints[idx]),
                warehouse,
                warehouse,
            );
            if (detallada) {
                await this.viajeService.guardarRutaViaje(viaje.id_viaje, detallada);
            }

            this.notif.add({
                severity: 'success',
                summary: 'Ruta optimizada',
                detail: `Nuevo orden guardado (${(result.distance / 1000).toFixed(1)} km, ${Math.round(
                    result.duration / 60,
                )} min aprox.).`,
            });
            this.avisoIrMapa.set(true);
        } catch (err) {
            console.error('Error al optimizar ruta', err);
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudo optimizar la ruta. Intenta nuevamente.',
            });
        } finally {
            this.optimizando.set(false);
        }
    }

    moverParada(index: number, direction: number) {
        const pendientes = [...this.guiasPendientes()];
        const completadas = this.guiasCompletadas();
        const target = index + direction;
        if (target < 0 || target >= pendientes.length) return;
        [pendientes[index], pendientes[target]] = [pendientes[target], pendientes[index]];
        this.paradas.set([...pendientes, ...completadas]);
        // Reorden manual: al iniciar el viaje se respeta este orden (no VRPTW).
        this.store.marcarOrdenManual();
        this.persistirOrden();
    }

    private async persistirOrden() {
        const viaje = this.activeViaje();
        if (!viaje) return;
        const ids = this.guiasPendientes().map((p) => p.id);
        if (ids.length < 1) return;
        try {
            await this.viajeService.actualizarOrdenViaje(viaje.id_viaje, ids);
        } catch (err) {
            console.error('Error al persistir el orden de la ruta', err);
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudo guardar el orden de la ruta.',
            });
        }
    }

    toggleReordering() {
        const acabando = this.reordering();
        this.reordering.update((v) => !v);
        if (acabando) this.avisoIrMapa.set(true);
    }

    refrescar() {
        void this.store.refrescarTodo().then(() => this.sincronizarParadas());
    }

    /** Texto relativo "actualizado hace X" basado en ultimaActualizacion. */
    actualizadoHace(): string {
        const ultima = this.store.ultimaActualizacion();
        if (!ultima) return '';
        const diff = Math.max(0, this.store.now().getTime() - ultima.getTime());
        const seg = Math.floor(diff / 1000);
        if (seg < 60) return 'Actualizado hace segundos';
        const min = Math.floor(seg / 60);
        if (min < 60) return `Actualizado hace ${min} min`;
        const hrs = Math.floor(min / 60);
        return `Actualizado hace ${hrs} h`;
    }

    irAlMapa() {
        this.avisoIrMapa.set(false);
        this.router.navigate(['/driver/mapa']);
    }

    cerrarAvisoMapa() {
        this.avisoIrMapa.set(false);
    }

    toggleSelectedGuia(g: ParadaDisplay) {
        this.selectedGuia.set(this.selectedGuia()?.id === g.id ? null : g);
    }

    abrirFirma(entrega: ParadaDisplay) {
        this.firmaGuia.set(entrega);
        if (this.firmaDialog) {
            this.firmaDialog.guia = entrega;
            this.firmaDialog.open();
        }
    }

    onFirmaCancelada() {
        this.firmaGuia.set(null);
    }

    async onFirmaConfirmada(event: { firma: string; observaciones: string }) {
        const entrega = this.firmaGuia();
        if (!entrega) return;

        const entregaStore: Entrega = {
            id: entrega.id,
            idGuia: '',
            numeroGuia: entrega.numeroGuia,
            numeroFactura: entrega.numeroFactura,
            empresaSuministro: entrega.empresaSuministro || '',
            cliente: entrega.cliente,
            ruta: entrega.ruta,
            direccion: entrega.direccion,
            rif: entrega.rif,
            precioCarga: entrega.precioCarga,
            estado: entrega.estado,
            observaciones: entrega.observaciones,
            tuvoDevolucion: false,
            eventos: entrega.eventos,
            latitud: entrega.latitud,
            longitud: entrega.longitud,
        };

        try {
            await this.store.finalizarEntrega(entregaStore, event.firma, event.observaciones);
            this.selectedGuia.set(null);
            await this.store.recargarViajes();
            this.sincronizarParadas();
            this.notif.add({
                severity: 'success',
                summary: 'Entrega completada',
                detail: `${entrega.cliente} — ${entrega.numeroFactura || entrega.numeroGuia}`,
            });
        } catch (err: any) {
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo guardar la entrega.',
            });
        } finally {
            this.firmaGuia.set(null);
        }
    }
}
