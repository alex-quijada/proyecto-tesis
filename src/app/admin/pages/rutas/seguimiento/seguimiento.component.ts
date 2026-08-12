import {
    Component,
    OnDestroy,
    OnInit,
    computed,
    effect,
    inject,
    signal,
    viewChild,
    ElementRef,
    afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TooltipModule } from 'primeng/tooltip';

import { environment } from '@/environments/environment';
import { ViajeAdmin } from '@/app/services/viaje.types';
import { SeguimientoService, PosicionChofer } from './services/seguimiento.service';

interface ChoferMonitoreo {
    idChofer: string;
    nombre: string;
    placa: string | null;
    color: string;
    estadoViaje: 'proceso' | 'programado' | 'sin-viaje';
    idViaje: string | null;
    municipios: string[];
    entregasHechas: number;
    entregasPendientes: number;
    totalEntregas: number;
    latitud: number;
    longitud: number;
    actualizadoEn: Date;
    online: boolean;
}

const PALETA = [
    '#3b82f6',
    '#10b981',
    '#8b5cf6',
    '#f59e0b',
    '#ef4444',
    '#06b6d4',
    '#ec4899',
    '#f97316',
    '#84cc16',
    '#14b8a6',
];

const OFFLINE_MS = 2 * 60 * 1000;
const TICK_MS = 30_000;

function colorDeChofer(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return PALETA[h % PALETA.length];
}

@Component({
    selector: 'app-seguimiento',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        TagModule,
        SkeletonModule,
        SelectButtonModule,
        TooltipModule,
    ],
    providers: [SeguimientoService],
    templateUrl: './seguimiento.component.html',
})
export class SeguimientoComponent implements OnInit, OnDestroy {
    protected readonly service = inject(SeguimientoService);
    private mapaEl = viewChild.required<ElementRef<HTMLDivElement>>('mapaElement');

    readonly cargando = this.service.cargando;
    readonly conectado = this.service.conectado;
    readonly ultimaActualizacion = this.service.ultimaActualizacion;

    readonly filtro = signal<'en-ruta' | 'en-linea' | 'todos'>('en-ruta');
    readonly filtroOpciones = [
        { label: 'En ruta', value: 'en-ruta' },
        { label: 'En línea', value: 'en-linea' },
        { label: 'Todos', value: 'todos' },
    ];

    readonly choferSeleccionado = signal<string | null>(null);
    readonly tick = signal(Date.now());
    readonly mapaListo = signal(false);

    private mapa!: google.maps.Map;
    private markers = new Map<string, google.maps.marker.AdvancedMarkerElement>();
    private polylines = new Map<string, google.maps.Polyline>();
    private ajustado = false;
    private tickTimer: ReturnType<typeof setInterval> | null = null;

    readonly monitoreo = computed<ChoferMonitoreo[]>(() => {
        const ahora = this.tick();
        const posiciones = this.service.posiciones();
        const viajes = this.service.viajes();
        const lista: ChoferMonitoreo[] = [];

        for (const pos of Object.values(posiciones)) {
            const viaje = viajes.find(
                (v) =>
                    v.id_chofer === pos.id_chofer &&
                    (v.estado === 'proceso' || v.estado === 'programado'),
            );
            const municipios = viaje
                ? Array.from(
                      new Set(
                          viaje.paradas.map((p) => p.municipio).filter((m): m is string => !!m),
                      ),
                  )
                : [];

            const total = viaje?.total_facturas ?? viaje?.paradas?.length ?? 0;
            const pendientes =
                (viaje?.facturas_proceso ?? 0) +
                (viaje?.facturas_embarque ?? 0) +
                (viaje?.facturas_espera ?? 0) +
                (viaje?.facturas_entrega ?? 0);
            const hechas = Math.max(0, total - pendientes);

            const actualizado = new Date(pos.actualizado_en);
            lista.push({
                idChofer: pos.id_chofer,
                nombre: pos.nombre_chofer || 'Chofer',
                placa: pos.placa_vehiculo ?? viaje?.placa_vehiculo ?? null,
                color: colorDeChofer(pos.id_chofer),
                estadoViaje: viaje ? (viaje.estado as 'proceso' | 'programado') : 'sin-viaje',
                idViaje: viaje?.id_viaje ?? null,
                municipios,
                entregasHechas: hechas,
                entregasPendientes: pendientes,
                totalEntregas: total,
                latitud: pos.latitud,
                longitud: pos.longitud,
                actualizadoEn: actualizado,
                online: ahora - actualizado.getTime() < OFFLINE_MS,
            });
        }

        return lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
    });

    readonly monitoreoFiltrado = computed<ChoferMonitoreo[]>(() => {
        const lista = this.monitoreo();
        switch (this.filtro()) {
            case 'en-ruta':
                return lista.filter((c) => c.estadoViaje !== 'sin-viaje');
            case 'en-linea':
                return lista.filter((c) => c.online);
            default:
                return lista;
        }
    });

    readonly totales = computed(() => {
        const lista = this.monitoreo();
        return {
            enRuta: lista.filter((c) => c.estadoViaje === 'proceso').length,
            enEspera: lista.filter((c) => c.estadoViaje === 'programado').length,
            online: lista.filter((c) => c.online).length,
            offline: lista.filter((c) => !c.online).length,
        };
    });

    constructor() {
        afterNextRender(() => this.initMap());

        effect(() => {
            if (!this.mapaListo()) return;
            this.monitoreoFiltrado();
            this.choferSeleccionado();
            this.actualizarMarcadores();
            this.dibujarRutas();
        });

        effect(() => {
            if (!this.mapaListo()) return;
            const id = this.choferSeleccionado();
            if (id) this.encuadrarChofer(id);
        });
    }

    async ngOnInit() {
        this.service.initRealtime();
        await this.service.cargar();
        this.tickTimer = setInterval(() => this.tick.set(Date.now()), TICK_MS);
    }

    ngOnDestroy() {
        if (this.tickTimer) clearInterval(this.tickTimer);
        for (const m of this.markers.values()) m.map = null;
        this.markers.clear();
        for (const p of this.polylines.values()) p.setMap(null);
        this.polylines.clear();
        if (this.mapa) {
            google.maps.event.clearInstanceListeners(this.mapa);
            this.mapa = undefined!;
        }
    }

    seleccionarChofer(id: string | null) {
        this.choferSeleccionado.set(this.choferSeleccionado() === id ? null : id);
    }

    refrescar() {
        void this.service.refrescar();
    }

    // ---------------- Mapa ----------------

    private initMap() {
        const el = this.mapaEl()?.nativeElement;
        if (!el) return;
        this.mapa = new google.maps.Map(el, {
            center: { lat: environment.warehouseLat, lng: environment.warehouseLng },
            zoom: 10,
            mapId: 'seguimiento',
            disableDefaultUI: true,
        });
        google.maps.event.addListenerOnce(this.mapa, 'idle', () => {
            this.mapaListo.set(true);
            this.agregarMarcadorAlmacen();
        });
    }

    private agregarMarcadorAlmacen() {
        const div = document.createElement('div');
        div.innerHTML =
            '<div style="width:28px;height:28px;background:#8b5cf6;border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></div>';
        const marker = new google.maps.marker.AdvancedMarkerElement({
            position: { lat: environment.warehouseLat, lng: environment.warehouseLng },
            map: this.mapa,
            content: div.firstElementChild as HTMLElement,
            title: 'Almacén central',
            zIndex: 1,
        });
    }

    private actualizarMarcadores() {
        if (!this.mapa) return;
        const lista = this.monitoreoFiltrado();

        if (!this.ajustado && lista.length > 0) {
            this.ajustado = true;
            this.encuadrarTodos();
        }

        const vistos = new Set<string>();
        for (const c of lista) {
            vistos.add(c.idChofer);
            const pos = { lat: c.latitud, lng: c.longitud };
            const marcador = this.markers.get(c.idChofer);
            if (marcador) {
                marcador.position = pos;
            } else {
                const nuevo = new google.maps.marker.AdvancedMarkerElement({
                    position: pos,
                    map: this.mapa,
                    content: this.crearContenidoMarcador(c),
                    title: c.nombre,
                    zIndex: c.idChofer === this.choferSeleccionado() ? 3 : 2,
                });
                nuevo.addListener('gmp-click', () => this.seleccionarChofer(c.idChofer));
                this.markers.set(c.idChofer, nuevo);
            }
        }

        for (const [id, m] of this.markers) {
            if (!vistos.has(id)) {
                m.map = null;
                this.markers.delete(id);
            }
        }
    }

    private crearContenidoMarcador(c: ChoferMonitoreo): HTMLElement {
        const base = c.online ? c.color : '#9ca3af';
        const div = document.createElement('div');
        div.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;gap:2px;transform:translateY(-14px)">
                <div style="width:34px;height:34px;background:${base};border-radius:50%;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;">
                    <i class="pi pi-truck"></i>
                </div>
                <span style="background:#fff;color:#111827;font-size:11px;font-weight:600;padding:1px 7px;border-radius:999px;box-shadow:0 1px 3px rgba(0,0,0,.25);white-space:nowrap">${c.nombre}</span>
            </div>`;
        return div.firstElementChild as HTMLElement;
    }

    private dibujarRutas() {
        if (!this.mapa) return;
        const activos = this.viajes().filter(
            (v) => v.estado === 'proceso' || v.estado === 'programado',
        );
        const seleccion = this.choferSeleccionado();
        const idsActivos = new Set(activos.map((v) => v.id_viaje));

        for (const [id, pl] of this.polylines) {
            if (!idsActivos.has(id)) {
                pl.setMap(null);
                this.polylines.delete(id);
            }
        }

        for (const v of activos) {
            const path = this.obtenerPathViaje(v);
            if (!path || path.length < 2) continue;
            const color = colorDeChofer(v.id_chofer);
            const esSeleccion = v.id_chofer === seleccion;
            const pl = this.polylines.get(v.id_viaje);
            if (pl) {
                pl.setPath(path);
                pl.setOptions({
                    strokeColor: color,
                    strokeWeight: esSeleccion ? 5 : 3,
                    strokeOpacity: esSeleccion ? 1 : 0.55,
                    zIndex: esSeleccion ? 2 : 1,
                });
            } else {
                const nueva = new google.maps.Polyline({
                    path,
                    map: this.mapa,
                    strokeColor: color,
                    strokeWeight: esSeleccion ? 5 : 3,
                    strokeOpacity: esSeleccion ? 1 : 0.55,
                    zIndex: esSeleccion ? 2 : 1,
                });
                this.polylines.set(v.id_viaje, nueva);
            }
        }
    }

    private obtenerPathViaje(v: ViajeAdmin): { lat: number; lng: number }[] | null {
        if (v.ruta_detallada?.path && v.ruta_detallada.path.length > 1) {
            return v.ruta_detallada.path;
        }
        const puntos = v.paradas
            .filter((p) => p.latitud != null && p.longitud != null)
            .sort((a, b) => a.orden_visita - b.orden_visita)
            .map((p) => ({ lat: p.latitud as number, lng: p.longitud as number }));
        return puntos.length > 1 ? puntos : null;
    }

    private encuadrarTodos() {
        const lista = this.monitoreoFiltrado();
        if (lista.length < 1) return;
        const bounds = new google.maps.LatLngBounds();
        bounds.extend({ lat: environment.warehouseLat, lng: environment.warehouseLng });
        for (const c of lista) bounds.extend({ lat: c.latitud, lng: c.longitud });
        this.mapa.fitBounds(bounds, 60);
    }

    private encuadrarChofer(id: string) {
        if (!this.mapa) return;
        const c = this.monitoreo().find((m) => m.idChofer === id);
        if (!c) return;
        const viaje = this.viajes().find((v) => v.id_viaje === c.idViaje);
        const path = viaje ? this.obtenerPathViaje(viaje) : null;
        if (path && path.length > 1) {
            const bounds = new google.maps.LatLngBounds();
            for (const p of path) bounds.extend(p);
            this.mapa.fitBounds(bounds, 60);
        } else {
            this.mapa.panTo({ lat: c.latitud, lng: c.longitud });
            this.mapa.setZoom(12);
        }
    }

    private viajes() {
        return this.service.viajes();
    }

    // ---------------- Helpers de plantilla ----------------

    estadoSeverity(
        estado: string,
    ): 'success' | 'info' | 'warn' | 'secondary' | 'danger' | 'contrast' | undefined {
        switch (estado) {
            case 'proceso':
                return 'info';
            case 'programado':
                return 'warn';
            default:
                return 'secondary';
        }
    }

    estadoLabel(estado: string): string {
        switch (estado) {
            case 'proceso':
                return 'En ruta';
            case 'programado':
                return 'Por iniciar';
            default:
                return 'Sin viaje';
        }
    }

    rutaLabel(c: ChoferMonitoreo): string {
        if (c.municipios.length < 1) return 'Sin ruta asignada';
        return `Ruta ${c.municipios.join(' / ')}`;
    }

    progreso(c: ChoferMonitoreo): number {
        return c.totalEntregas > 0 ? Math.round((c.entregasHechas / c.totalEntregas) * 100) : 0;
    }

    relativo(fecha: Date): string {
        const diff = Math.max(0, Date.now() - fecha.getTime());
        const seg = Math.floor(diff / 1000);
        if (seg < 60) return `hace ${seg}s`;
        const min = Math.floor(seg / 60);
        if (min < 60) return `hace ${min}min`;
        const hrs = Math.floor(min / 60);
        if (hrs < 24) return `hace ${hrs}h`;
        return fecha.toLocaleDateString();
    }

    formatoActualizacion(): string {
        const f = this.ultimaActualizacion();
        if (!f) return '—';
        return f.toLocaleTimeString();
    }
}
