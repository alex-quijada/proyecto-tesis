import {
    Component,
    OnDestroy,
    OnInit,
    computed,
    effect,
    inject,
    signal,
    ViewChild,
    afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { SelectButtonModule } from 'primeng/selectbutton';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';

import { DriverStoreService } from '../../services/driver-store.service';
import { NavigationSdkService, RutaTramo } from '../../services/navigation-sdk.service';
import { FirmaDialogComponent } from '../../components/firma-dialog/firma-dialog.component';
import {
    IncidenciaDialogComponent,
    IncidenciaGuia,
    IncidenciaDatos,
} from '../../components/incidencia-dialog/incidencia-dialog.component';
import { ViajeService } from '@/app/services/viaje.service';
import { NotificationService } from '@/app/services/notification.service';
import { environment } from '@/environments/environment';
import { haversine, calcularBearing } from '../viajes/navegacion.util';

interface ParadaMapa {
    id: string;
    ordenVisita: number;
    numeroGuia: string;
    numeroFactura: string;
    nombreCliente: string;
    direccion: string;
    estado: string;
    latitud?: number | null;
    longitud?: number | null;
    montoDolares?: number;
    rif?: string;
    observaciones?: string;
}

interface PuntoEntrega {
    key: string;
    ordenVisita: number;
    nombreCliente: string;
    direccion: string;
    latitud: number;
    longitud: number;
    facturaIds: string[];
    facturas: ParadaMapa[];
}

/**
 * Ventana "Navegación" con el Google Maps Navigation SDK (Fase 2).
 * Reutiliza el flujo de entregas (espera → entrega → firma/incidencia) y el
 * "Finalizar viaje" al volver al almacén, sobre el mapa nativo del SDK.
 */
@Component({
    selector: 'app-navigation',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        TagModule,
        TooltipModule,
        SelectButtonModule,
        DialogModule,
        TextareaModule,
        FirmaDialogComponent,
        IncidenciaDialogComponent,
    ],
    templateUrl: './navigation.component.html',
})
export class NavigationComponent implements OnInit, OnDestroy {
    store = inject(DriverStoreService);
    sdk = inject(NavigationSdkService);
    private viajeService = inject(ViajeService);
    private router = inject(Router);
    private notif = inject(NotificationService);

    @ViewChild(FirmaDialogComponent) private firmaDialog!: FirmaDialogComponent;
    @ViewChild(IncidenciaDialogComponent) private incidenciaDialog!: IncidenciaDialogComponent;

    readonly cargando = signal(true);
    readonly error = signal('');
    readonly stopIndex = signal(0);
    readonly puntoEntrega = signal<number | null>(null);
    readonly entregando = signal(false);
    readonly finalizando = signal(false);
    readonly simulando = signal(true);
    readonly pausado = signal(false);
    readonly puntosAbiertos = signal(true);
    readonly firmaGuia = signal<ParadaMapa | null>(null);
    readonly incidenciaGuia = signal<ParadaMapa | null>(null);
    readonly incidenciaGuiaData = computed<IncidenciaGuia | null>(() => {
        const g = this.incidenciaGuia();
        return g
            ? {
                  cliente: g.nombreCliente,
                  numeroGuia: g.numeroGuia,
                  numeroFactura: g.numeroFactura,
              }
            : null;
    });
    readonly llegadas = signal(0);
    readonly finalDestino = signal(false);
    readonly restanteDist = signal(0);

    readonly topOffset = signal(0);
    readonly bottomOffset = signal(68);

    // Interpolador propio (patrón de mi-ruta): avanza sobre el path exacto que
    // devuelve el SDK, moviendo nuestro marcador. El SDK nunca recibe la
    // ubicación → imposible que detecte off-route y recalcule.
    private static readonly SIM_M_POR_TICK = 15;
    private static readonly SIM_INTERVALO_MS = 50;
    private tramos: RutaTramo[] = [];
    private tramoIdx = 0;
    private simDist = 0;
    private enParada = false;
    private ultimaPosSim: { lat: number; lng: number } | null = null;
    private ultimoRumbo = 0;
    private simInterval: ReturnType<typeof setInterval> | null = null;

    readonly activeViaje = computed(() => this.store.viajesChofer()[0] || null);

    readonly paradas = computed<ParadaMapa[]>(() => {
        const viaje = this.activeViaje();
        if (!viaje) return [];
        const entregas = this.store.guiasAsignadas();
        return (viaje.paradas || [])
            .slice()
            .sort((a, b) => a.orden_visita - b.orden_visita)
            .map((p) => {
                const entrega = entregas.find((e) => e.id === p.id_factura);
                return {
                    id: p.id_factura,
                    ordenVisita: p.orden_visita,
                    numeroGuia: p.codigo_guia || entrega?.numeroGuia || p.id_guia || '',
                    numeroFactura: p.numero_factura || entrega?.numeroFactura || '',
                    nombreCliente: p.nombre_cliente || entrega?.cliente || 'Sin cliente',
                    direccion: p.direccion || entrega?.direccion || '',
                    estado: p.estado_factura || entrega?.estado || 'embarque',
                    latitud: p.latitud,
                    longitud: p.longitud,
                    montoDolares: Number(p.monto_dolares) || entrega?.precioCarga || 0,
                    rif: entrega?.rif,
                    observaciones: entrega?.observaciones,
                };
            });
    });

    /** Puntos de entrega agrupados por coordenadas + almacén al final. */
    readonly puntos = computed<PuntoEntrega[]>(() => {
        const mapa = new Map<string, PuntoEntrega>();
        for (const p of this.paradas()) {
            if (p.latitud == null || p.longitud == null) continue;
            const key = `${p.latitud},${p.longitud}`;
            let punto = mapa.get(key);
            if (!punto) {
                punto = {
                    key,
                    ordenVisita: p.ordenVisita,
                    nombreCliente: p.nombreCliente,
                    direccion: p.direccion,
                    latitud: p.latitud,
                    longitud: p.longitud,
                    facturaIds: [],
                    facturas: [],
                };
                mapa.set(key, punto);
            }
            punto.ordenVisita = Math.min(punto.ordenVisita, p.ordenVisita);
            punto.facturaIds.push(p.id);
            punto.facturas.push(p);
        }
        const lista = Array.from(mapa.values()).sort((a, b) => a.ordenVisita - b.ordenVisita);
        lista.push({
            key: 'almacen',
            ordenVisita: 9999,
            nombreCliente: 'Almacén',
            direccion: '',
            latitud: environment.warehouseLat,
            longitud: environment.warehouseLng,
            facturaIds: [],
            facturas: [],
        });
        return lista;
    });

    readonly puntoActual = computed<PuntoEntrega | null>(() => {
        const idx = this.puntoEntrega();
        if (idx === null || idx < 0) return null;
        return this.puntos()[idx] ?? null;
    });

    readonly facturasEnEspera = computed(() =>
        (this.puntoActual()?.facturas || []).filter((f) => f.estado === 'espera'),
    );
    readonly facturasEnEntrega = computed(() =>
        (this.puntoActual()?.facturas || []).filter((f) => f.estado === 'entrega'),
    );

    readonly viajeCompletado = computed(() => {
        const pts = this.puntos();
        const entregas = pts.filter((p) => p.key !== 'almacen');
        return (
            entregas.length > 0 &&
            entregas.every((p) =>
                p.facturas.every((f) => f.estado === 'finalizado' || f.estado === 'incidencia'),
            )
        );
    });

    readonly paradaActual = computed(() => {
        const p = this.puntos()[this.stopIndex()];
        return p ? p.nombreCliente : '—';
    });

    readonly restanteTiempo = computed(() => this.restanteDist() / 12.5);

    readonly firmaGuiaData = computed(() => {
        const g = this.firmaGuia();
        if (!g) return null;
        return {
            numeroGuia: g.numeroGuia,
            cliente: g.nombreCliente,
            precioCarga: g.montoDolares || 0,
        };
    });

    readonly formatearDistancia = (m: number) =>
        m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
    readonly formatearTiempo = (s: number) =>
        s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`;

    constructor() {
        afterNextRender(() => {
            document.documentElement.classList.add('mapa-nativo');
            this.medirOffsets();
        });
        window.addEventListener('resize', this.medirOffsets);

        // Llegada a una parada (no final): marcar espera + abrir sheet de entrega.
        effect(() => {
            const n = this.llegadas();
            if (n <= 0 || this.cargando()) return;
            const p = this.puntos()[this.stopIndex()];
            if (p && p.key !== 'almacen') {
                this.puntoEntrega.set(this.stopIndex());
                void this.store.marcarParadaEnEspera(p.facturaIds);
            }
        });

        // Al completarse las facturas del punto, cerrar el sheet.
        effect(() => {
            const punto = this.puntoActual();
            if (!punto) return;
            const pendientes = punto.facturas.filter(
                (f) => f.estado !== 'finalizado' && f.estado !== 'incidencia',
            );
            if (pendientes.length === 0) this.puntoEntrega.set(null);
        });
    }

    private readonly medirOffsets = () => {
        const topbar = document.querySelector('app-driver-topbar') as HTMLElement | null;
        const nav = document.querySelector('app-driver-bottom-nav') as HTMLElement | null;
        const topbarDiv = topbar?.firstElementChild as HTMLElement | null;
        const navDiv = nav?.firstElementChild as HTMLElement | null;
        if (topbarDiv) this.topOffset.set(topbarDiv.getBoundingClientRect().bottom);
        else this.topOffset.set(0);
        if (navDiv) this.bottomOffset.set(window.innerHeight - navDiv.getBoundingClientRect().top);
        else this.bottomOffset.set(68);
    };

    async ngOnInit() {
        await this.store.cargarViajes();
        const ok = await this.sdk.init();
        if (!ok) {
            this.error.set('No se pudo inicializar el Navigation SDK.');
            this.cargando.set(false);
            return;
        }
        const pts = this.puntos().filter((p) => p.key !== 'almacen');
        const destinos = this.puntos().map((p) => ({ lat: p.latitud, lng: p.longitud }));
        if (destinos.length < 2) {
            this.error.set('El viaje no tiene paradas con coordenadas.');
            this.cargando.set(false);
            return;
        }

        const destinoOk = await this.sdk.setDestinations(destinos);
        if (!destinoOk) {
            this.error.set('No se pudo calcular la ruta.');
            this.cargando.set(false);
            return;
        }

        await this.sdk.startGuidance();

        // Leer todas las piernas de la ruta del SDK y construir el path continuo
        // para el interpolador propio (el SDK ya no recibe ubicación → no re-rutea).
        this.tramos = await this.cargarTramos();
        if (this.tramos.length === 0) {
            this.error.set('No se pudo leer la ruta calculada.');
            this.cargando.set(false);
            return;
        }

        // Anclar el SDK una vez al inicio de la ruta (evita que use el GPS del
        // dispositivo y que pueda considerarse fuera de ruta).
        const inicio = this.tramos[0].points[0];
        await this.sdk.anclarEn(inicio.lat, inicio.lng);

        // Dibujar el vehículo en el inicio y arrancar el interpolador.
        this.simDist = 0;
        this.tramoIdx = 0;
        this.enParada = false;
        await this.sdk.moveVehicle(inicio.lat, inicio.lng, 0);
        this.iniciarInterpolador();
        this.cargando.set(false);
    }

    ngOnDestroy() {
        window.removeEventListener('resize', this.medirOffsets);
        document.documentElement.classList.remove('mapa-nativo');
        this.detenerInterpolador();
        void this.sdk.cleanup();
    }

    private async cargarTramos(): Promise<RutaTramo[]> {
        for (let intento = 0; intento < 15; intento++) {
            try {
                const route = await this.sdk.getRouteSegments();
                const tramos = (route.legs || [])
                    .filter((l) => l.points && l.points.length > 1)
                    .map((l) => this.construirTramo(l.points));
                if (tramos.length > 0) return tramos;
            } catch {
                // la ruta puede tardar unos instantes en estar lista
            }
            await new Promise((r) => setTimeout(r, 300));
        }
        return [];
    }

    private construirTramo(points: { lat: number; lng: number }[]): RutaTramo {
        const distAcum = [0];
        for (let i = 1; i < points.length; i++) {
            distAcum.push(distAcum[i - 1] + haversine(points[i - 1], points[i]));
        }
        return { points, distAcum, total: distAcum[distAcum.length - 1] };
    }

    private iniciarInterpolador() {
        this.detenerInterpolador();
        this.simInterval = setInterval(() => this.moverSim(), NavigationComponent.SIM_INTERVALO_MS);
    }

    private detenerInterpolador() {
        if (this.simInterval) {
            clearInterval(this.simInterval);
            this.simInterval = null;
        }
    }

    private posicionEnTramo(tramo: RutaTramo, d: number): { lat: number; lng: number } {
        const { points, distAcum } = tramo;
        let i = 1;
        while (i < distAcum.length && distAcum[i] < d) i++;
        if (i >= points.length) return points[points.length - 1];
        const prev = points[i - 1];
        const next = points[i];
        const segLen = distAcum[i] - distAcum[i - 1];
        const t = segLen > 0 ? (d - distAcum[i - 1]) / segLen : 0;
        return {
            lat: prev.lat + (next.lat - prev.lat) * t,
            lng: prev.lng + (next.lng - prev.lng) * t,
        };
    }

    private calcularRestante(): number {
        const tramo = this.tramos[this.tramoIdx];
        if (!tramo) return 0;
        let restante = tramo.total - this.simDist;
        for (let i = this.tramoIdx + 1; i < this.tramos.length; i++) {
            restante += this.tramos[i].total;
        }
        return Math.max(0, restante);
    }

    private async moverSim() {
        if (this.enParada || this.pausado()) return;
        const tramo = this.tramos[this.tramoIdx];
        if (!tramo) return;

        this.simDist += NavigationComponent.SIM_M_POR_TICK;
        if (this.simDist >= tramo.total) {
            // Llegada al final del tramo (parada o almacén).
            this.simDist = tramo.total;
            this.enParada = true;
            const fin = tramo.points[tramo.points.length - 1];
            this.moverVehiculo(fin);
            this.restanteDist.set(this.calcularRestante());
            if (this.tramoIdx < this.tramos.length - 1) {
                this.llegadas.update((n) => n + 1);
            } else {
                this.finalDestino.set(true);
            }
            return;
        }

        const pos = this.posicionEnTramo(tramo, this.simDist);
        this.moverVehiculo(pos);
        this.restanteDist.set(this.calcularRestante());
    }

    private async moverVehiculo(pos: { lat: number; lng: number }) {
        if (this.ultimaPosSim) {
            const dist = haversine(this.ultimaPosSim, pos);
            if (dist > 0.5) {
                this.ultimoRumbo = calcularBearing(this.ultimaPosSim, pos);
            }
        }
        this.ultimaPosSim = pos;
        try {
            await this.sdk.moveVehicle(pos.lat, pos.lng, this.ultimoRumbo);
        } catch {
            // si la llamada falla (ej. mientras se destruye), se ignora
        }
    }

    async siguienteParada() {
        if (this.tramoIdx < this.tramos.length - 1) {
            this.tramoIdx++;
            this.simDist = 0;
            this.enParada = false;
        }
        this.stopIndex.update((i) => Math.min(i + 1, this.puntos().length - 1));
        void this.sdk.continueToNextDestination().catch(() => undefined);
    }

    togglePuntos() {
        this.puntosAbiertos.update((v) => !v);
    }

    async togglePausaSim() {
        this.pausado.update((v) => !v);
    }

    async detenerNavegacion() {
        this.detenerInterpolador();
        await this.sdk.stopGuidance();
        await this.sdk.cleanup();
        document.documentElement.classList.remove('mapa-nativo');
        this.router.navigate(['/driver/home']);
    }

    async iniciarEntregaPunto() {
        const punto = this.puntoActual();
        if (!punto) return;
        this.entregando.set(true);
        try {
            await this.store.iniciarEntrega(punto.facturaIds);
            this.notif.add({
                severity: 'success',
                summary: 'Entrega iniciada',
                detail: 'Marca cada factura como finalizada o reporta una incidencia.',
            });
        } catch (err: any) {
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo iniciar la entrega.',
            });
        } finally {
            this.entregando.set(false);
        }
    }

    abrirFirma(factura: ParadaMapa) {
        this.firmaGuia.set(factura);
        if (this.firmaDialog) {
            this.firmaDialog.guia = this.firmaGuiaData();
            this.firmaDialog.open();
        }
    }

    onFirmaCancelada() {
        this.firmaGuia.set(null);
    }

    async onFirmaConfirmada(event: { firma: string; observaciones: string }) {
        const factura = this.firmaGuia();
        if (!factura) return;
        try {
            await this.store.finalizarEntrega(
                this.crearEntregaStore(factura),
                event.firma,
                event.observaciones,
            );
            this.notif.add({
                severity: 'success',
                summary: 'Entrega completada',
                detail: `${factura.nombreCliente} — ${factura.numeroFactura || factura.numeroGuia}`,
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

    abrirIncidencia(factura: ParadaMapa) {
        this.incidenciaGuia.set(factura);
        this.incidenciaDialog.guia = this.incidenciaGuiaData();
        this.incidenciaDialog.open();
    }

    cerrarIncidencia() {
        this.incidenciaGuia.set(null);
    }

    async onIncidenciaConfirmada(datos: IncidenciaDatos) {
        const factura = this.incidenciaGuia();
        if (!factura) return;
        try {
            await this.store.reportarIncidencia(factura.id, datos.incidencias);
            this.notif.add({
                severity: 'warn',
                summary: 'Incidencia reportada',
                detail: `${factura.nombreCliente} — ${factura.numeroFactura || factura.numeroGuia}`,
            });
        } catch (err: any) {
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo reportar la incidencia.',
            });
        } finally {
            this.cerrarIncidencia();
        }
    }

    async finalizarViaje() {
        const viaje = this.activeViaje();
        if (!viaje || this.finalizando()) return;
        this.finalizando.set(true);
        try {
            await this.viajeService.finalizarViaje(viaje.id_viaje);
            await this.store.recargarViajes();
            await this.sdk.cleanup();
            document.documentElement.classList.remove('mapa-nativo');
            this.notif.add({
                severity: 'success',
                summary: 'Viaje finalizado',
                detail: 'Regresaste al almacén con todas las entregas completadas.',
            });
            this.router.navigate(['/driver/home']);
        } catch (err: any) {
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo finalizar el viaje.',
            });
        } finally {
            this.finalizando.set(false);
        }
    }

    private crearEntregaStore(factura: ParadaMapa) {
        return {
            id: factura.id,
            idGuia: '',
            numeroGuia: factura.numeroGuia,
            numeroFactura: factura.numeroFactura,
            empresaSuministro: '',
            cliente: factura.nombreCliente,
            ruta: '',
            direccion: factura.direccion,
            rif: factura.rif || '',
            precioCarga: factura.montoDolares || 0,
            estado: factura.estado,
            observaciones: factura.observaciones,
            tuvoDevolucion: false,
            eventos: [],
            latitud: factura.latitud ?? undefined,
            longitud: factura.longitud ?? undefined,
        };
    }
}
