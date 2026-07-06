import {
    Component,
    OnInit,
    OnDestroy,
    signal,
    inject,
    viewChild,
    ElementRef,
    afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { DividerModule } from 'primeng/divider';
import * as mapboxgl from 'mapbox-gl';
import { environment } from '@/environments/environment';
import {
    GuiaDespacho,
    Ruta,
    GUIAS_MOCK,
    RUTAS_MOCK,
    MUNICIPIOS_NUEVA_ESPARTA,
} from '../data/rutas-mock';
import { CHOFERES_MOCK } from '../../choferes/data/choferes-mock';
import { MapboxOptimizationService, Waypoint } from '../../map/map/mapbox-optimization.service';

interface DiaCronograma {
    dia: string;
    label: string;
    municipios: string[];
}

interface MunicipioConteo {
    label: string;
    value: string;
    cantidad: number;
    alta: number;
    media: number;
    baja: number;
    esHoy: boolean;
    ordenHoy: number;
    tieneAlta: boolean;
}

interface ChoferOption {
    label: string;
    value: string;
}

const DIAS_LABEL: Record<string, string> = {
    LUNES: 'Lunes',
    MARTES: 'Martes',
    MIERCOLES: 'Miércoles',
    JUEVES: 'Jueves',
    VIERNES: 'Viernes',
    SABADO: 'Sábado',
    DOMINGO: 'Domingo',
};

const CRONOGRAMA_DEFAULT: DiaCronograma[] = [
    {
        dia: 'LUNES',
        label: 'Lunes',
        municipios: ['MANEIRO', 'GARCIA', 'MARINO', 'MARCANO', 'TUBORES'],
    },
    {
        dia: 'MARTES',
        label: 'Martes',
        municipios: ['MARCANO', 'GOMEZ', 'DIAZ', 'MARINO', 'ARISMENDI', 'ANTOLIN_DEL_CAMPO'],
    },
    {
        dia: 'MIERCOLES',
        label: 'Miércoles',
        municipios: ['MANEIRO', 'GOMEZ', 'DIAZ', 'MARINO', 'ARISMENDI', 'ANTOLIN_DEL_CAMPO'],
    },
    {
        dia: 'JUEVES',
        label: 'Jueves',
        municipios: ['MARCANO', 'GOMEZ', 'DIAZ', 'MARINO', 'ANTOLIN_DEL_CAMPO', 'ARISMENDI'],
    },
    {
        dia: 'VIERNES',
        label: 'Viernes',
        municipios: ['MANEIRO', 'GARCIA', 'MARINO'],
    },
    {
        dia: 'SABADO',
        label: 'Sábado',
        municipios: [],
    },
];

const MAPA_DIA: Record<number, string> = {
    0: 'DOMINGO',
    1: 'LUNES',
    2: 'MARTES',
    3: 'MIERCOLES',
    4: 'JUEVES',
    5: 'VIERNES',
    6: 'SABADO',
};

const MUNICIPIOS_RESTANTES = (actual: string[]): { label: string; value: string }[] =>
    MUNICIPIOS_NUEVA_ESPARTA.filter((m) => !actual.includes(m.value)).map((m) => ({
        label: m.label,
        value: m.value,
    }));

@Component({
    selector: 'app-optimizacion-rutas',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        ToastModule,
        SelectModule,
        CheckboxModule,
        TagModule,
        TooltipModule,
        DividerModule,
    ],
    providers: [MessageService],
    templateUrl: './optimizacion-rutas.component.html',
    styleUrl: './optimizacion-rutas.component.css',
})
export class OptimizacionRutasComponent implements OnInit, OnDestroy {
    private messageService = inject(MessageService);
    private optimizationService = inject(MapboxOptimizationService);

    private mapaEl = viewChild.required<ElementRef<HTMLDivElement>>('mapaElement');

    mapa!: mapboxgl.Map;
    private markers: mapboxgl.Marker[] = [];
    private routeSourceId = 'opt-route';
    private routeLayerId = 'opt-route-layer';

    readonly municipios = MUNICIPIOS_NUEVA_ESPARTA;
    readonly cronograma = signal<DiaCronograma[]>(
        JSON.parse(JSON.stringify(CRONOGRAMA_DEFAULT)),
    );
    readonly DIAS_LABEL = DIAS_LABEL;
    readonly esDomingo = new Date().getDay() === 0;

    get hoy(): string {
        const raw = MAPA_DIA[new Date().getDay()];
        return raw === 'DOMINGO' ? 'LUNES' : raw;
    }

    guias = signal<GuiaDespacho[]>([]);
    rutasDisponibles = signal<Ruta[]>([]);

    selectedMunicipio = signal<string | null>(null);
    selectedGuias = signal<Set<string>>(new Set());
    filtroChofer = signal<string | null>(null);
    optimizando = signal(false);

    diaEditando = signal<string | null>(null);
    municipioAgregar = signal<string>('');
    dragIndex = signal<{ dia: string; idx: number } | null>(null);

    constructor() {
        afterNextRender(() => this.initMap());
    }

    ngOnInit() {
        this.guias.set([...GUIAS_MOCK]);
        this.rutasDisponibles.set([...RUTAS_MOCK]);
    }

    ngOnDestroy() {
        this.limpiarMapa();
        if (this.mapa) this.mapa.remove();
    }

    get municipiosConteo(): MunicipioConteo[] {
        const hoyArr = this.cronograma().find((d) => d.dia === this.hoy)?.municipios || [];
        const guiasNuevas = this.guias().filter((g) => !g.eventos?.length);

        const conteos = MUNICIPIOS_NUEVA_ESPARTA.map((m) => {
            const gDelMunicipio = guiasNuevas.filter((g) => g.municipio === m.value);
            const alta = gDelMunicipio.filter((g) =>
                g.facturas?.some((f) => f.prioridad === 'Alta'),
            ).length;
            const media = gDelMunicipio.filter((g) =>
                g.facturas?.some((f) => f.prioridad === 'Media'),
            ).length;
            const baja = gDelMunicipio.filter((g) =>
                g.facturas?.some((f) => f.prioridad === 'Baja'),
            ).length;
            const pos = hoyArr.indexOf(m.value);
            return {
                label: m.label,
                value: m.value,
                cantidad: gDelMunicipio.length,
                alta,
                media,
                baja,
                esHoy: pos >= 0,
                ordenHoy: pos >= 0 ? pos : 999,
                tieneAlta: alta > 0 && pos >= 0,
            };
        }).filter((m) => m.cantidad > 0);

        conteos.sort((a, b) => {
            if (a.tieneAlta !== b.tieneAlta) return a.tieneAlta ? -1 : 1;
            if (a.esHoy !== b.esHoy) return a.esHoy ? -1 : 1;
            if (a.esHoy && b.esHoy) return a.ordenHoy - b.ordenHoy;
            return a.label.localeCompare(b.label);
        });

        return conteos;
    }

    get choferesOptions(): ChoferOption[] {
        const choferesEnMunicipio = this.guiasDelMunicipio.reduce(
            (acc: ChoferOption[], g: GuiaDespacho) => {
                const ch = CHOFERES_MOCK.find((c) => c.id === g.idChofer);
                if (ch && !acc.some((a: ChoferOption) => a.value === ch.id)) {
                    acc.push({
                        label: `${ch.nombreCompleto} — ${ch.documentoIdentidad?.prefijo}-${ch.documentoIdentidad?.numero}`,
                        value: ch.id!,
                    });
                }
                return acc;
            },
            [],
        );
        return [
            { label: 'Todos los Choferes', value: null as any },
            ...choferesEnMunicipio,
        ];
    }

    get guiasDelMunicipio(): GuiaDespacho[] {
        const municipio = this.selectedMunicipio();
        if (!municipio) return [];
        let list = this.guias().filter(
            (g) => g.municipio === municipio && !g.eventos?.length,
        );
        const chofer = this.filtroChofer();
        if (chofer) {
            list = list.filter((g) => g.idChofer === chofer);
        }
        return list;
    }

    get todasSeleccionadas(): boolean {
        const gias = this.guiasDelMunicipio;
        return gias.length > 0 && gias.every((g) => this.selectedGuias().has(g.id));
    }

    get haySeleccionadas(): boolean {
        return this.selectedGuias().size > 0;
    }

    municipiosDisponiblesPara(dia: DiaCronograma): { label: string; value: string }[] {
        return MUNICIPIOS_RESTANTES(dia.municipios);
    }

    seleccionarMunicipio(value: string) {
        this.selectedMunicipio.set(value);
        this.selectedGuias.set(new Set());
        this.filtroChofer.set(null);
    }

    toggleGuia(id: string) {
        this.selectedGuias.update((set) => {
            const nuevo = new Set(set);
            if (nuevo.has(id)) {
                nuevo.delete(id);
            } else {
                nuevo.add(id);
            }
            return nuevo;
        });
    }

    toggleTodas() {
        const guias = this.guiasDelMunicipio;
        if (this.todasSeleccionadas) {
            this.selectedGuias.set(new Set());
        } else {
            this.selectedGuias.set(new Set(guias.map((g) => g.id)));
        }
    }

    cambiarACargaMercancia() {
        const ids = Array.from(this.selectedGuias());
        if (!ids.length) return;

        this.guias.update((list) =>
            list.map((g) => {
                if (ids.includes(g.id)) {
                    return {
                        ...g,
                        eventos: [
                            ...(g.eventos || []),
                            {
                                id: `evt-${Date.now()}-${g.id}`,
                                idGuia: g.id,
                                tipo: 'SALIDA' as const,
                                fecha: new Date().toISOString(),
                                descripcion: 'Carga de mercancía asignada',
                            },
                        ],
                    };
                }
                return g;
            }),
        );

        const guiasActualizadas = this.guias().filter((g) => ids.includes(g.id));
        for (const guia of guiasActualizadas) {
            this.notificarChofer(guia);
        }

        this.messageService.add({
            severity: 'success',
            summary: 'Guías actualizadas',
            detail: `${ids.length} guía(s) cambiada(s) a carga de mercancía.`,
        });

        this.selectedGuias.set(new Set());
    }

    private notificarChofer(guia: GuiaDespacho) {
        console.log(`[NOTIFICACIÓN] Guía ${guia.numeroGuia} asignada a ${guia.nombreChofer}`);
    }

    async optimizarRuta() {
        const ids = Array.from(this.selectedGuias());
        if (ids.length < 2) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Selecciona al menos 2 guías',
                detail: 'Para optimizar la ruta necesitas seleccionar al menos 2 guías.',
            });
            return;
        }

        this.optimizando.set(true);

        const guiasSel = this.guias().filter((g) => ids.includes(g.id));

        const waypoints: Waypoint[] = guiasSel.map((g) => {
            const cliente = g.facturas?.[0];
            return {
                lat: 10.96 + Math.random() * 0.1,
                lng: -63.85 + Math.random() * 0.1,
                name: cliente?.nombreCliente || g.numeroGuia,
            };
        });

        try {
            const result = await this.optimizationService.optimize(
                waypoints,
                environment.mapboxKey,
            );

            this.limpiarMapa();

            if (result && result.trips?.length) {
                const trip = result.trips[0];
                const coordinates: [number, number][] = trip.geometry.coordinates as any;

                this.mapa.addSource(this.routeSourceId, {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        properties: {},
                        geometry: { type: 'LineString', coordinates },
                    },
                });

                this.mapa.addLayer({
                    id: this.routeLayerId,
                    type: 'line',
                    source: this.routeSourceId,
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: {
                        'line-color': '#22c55e',
                        'line-width': 5,
                        'line-opacity': 0.85,
                    },
                });

                const bounds = new mapboxgl.LngLatBounds();
                coordinates.forEach((c) => bounds.extend(c));
                this.mapa.fitBounds(bounds, { padding: 80, duration: 800 });

                waypoints.forEach((wp, i) =>
                    this.agregarMarcador(i, wp, waypoints.length),
                );

                const distKm = (trip.distance / 1000).toFixed(1);
                const durMin = Math.round(trip.duration / 60);
                this.messageService.add({
                    severity: 'success',
                    summary: 'Ruta optimizada',
                    detail: `Distancia: ${distKm} km — Duración: ~${durMin} min`,
                });
            } else {
                this.mostrarRutaEstimada(waypoints);
            }
        } catch {
            this.mostrarRutaEstimada(waypoints);
        } finally {
            this.optimizando.set(false);
        }
    }

    private mostrarRutaEstimada(waypoints: Waypoint[]) {
        this.messageService.add({
            severity: 'info',
            summary: 'Ruta estimada',
            detail: 'Mostrando ruta en orden de municipios.',
        });

        const coordsOrdenadas = waypoints.map(
            (wp) => [wp.lng, wp.lat] as [number, number],
        );

        this.mapa.addSource(this.routeSourceId, {
            type: 'geojson',
            data: {
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: coordsOrdenadas },
            },
        });

        this.mapa.addLayer({
            id: this.routeLayerId,
            type: 'line',
            source: this.routeSourceId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
                'line-color': '#3b82f6',
                'line-width': 4,
                'line-opacity': 0.7,
                'line-dasharray': [2, 2],
            },
        });

        const bounds = new mapboxgl.LngLatBounds();
        coordsOrdenadas.forEach((c) => bounds.extend(c));
        this.mapa.fitBounds(bounds, { padding: 80, duration: 800 });
        waypoints.forEach((wp, i) => this.agregarMarcador(i, wp, waypoints.length));
    }

    // ─── Cronograma editing ───

    toggleEditarDia(dia: string) {
        if (this.diaEditando() === dia) {
            this.diaEditando.set(null);
        } else {
            this.diaEditando.set(dia);
        }
        this.municipioAgregar.set('');
    }

    agregarMunicipioADia(dia: DiaCronograma) {
        if (!this.municipioAgregar()) return;
        this.cronograma.update((lista) =>
            lista.map((d) => {
                if (d.dia === dia.dia) {
                    return {
                        ...d,
                        municipios: [...d.municipios, this.municipioAgregar()],
                    };
                }
                return d;
            }),
        );
        this.municipioAgregar.set('');
    }

    quitarMunicipioDeDia(dia: string, municipio: string) {
        this.cronograma.update((lista) =>
            lista.map((d) => {
                if (d.dia === dia) {
                    return {
                        ...d,
                        municipios: d.municipios.filter((m) => m !== municipio),
                    };
                }
                return d;
            }),
        );
    }

    onDragStart(dia: string, idx: number) {
        this.dragIndex.set({ dia, idx });
    }

    onDragOver(event: DragEvent) {
        event.preventDefault();
    }

    onDrop(event: DragEvent, dia: string, targetIdx: number) {
        event.preventDefault();
        const source = this.dragIndex();
        if (!source || source.dia !== dia || source.idx === targetIdx) {
            this.dragIndex.set(null);
            return;
        }

        this.cronograma.update((lista) =>
            lista.map((d) => {
                if (d.dia === dia) {
                    const arr = [...d.municipios];
                    const [removed] = arr.splice(source.idx, 1);
                    arr.splice(targetIdx, 0, removed);
                    return { ...d, municipios: arr };
                }
                return d;
            }),
        );
        this.dragIndex.set(null);
    }

    onDragEnd() {
        this.dragIndex.set(null);
    }

    // ─── Map helpers ───

    private initMap() {
        this.mapa = new mapboxgl.Map({
            container: this.mapaEl().nativeElement,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [-63.85, 10.96],
            zoom: 10,
            accessToken: environment.mapboxKey,
        });

        this.mapa.addControl(new mapboxgl.NavigationControl(), 'top-right');
        this.mapa.on('load', () => {
            setTimeout(() => this.mapa.resize(), 100);
            this.dibujarRutasExistentes();
        });
    }

    private dibujarRutasExistentes() {
        const rutas = this.rutasDisponibles().filter((r) => r.estado === 'ACTIVA');
        for (const ruta of rutas) {
            const guias = this.guias().filter((g) => ruta.idsGuias.includes(g.id));
            if (guias.length < 2) continue;

            const coords: [number, number][] = guias.map(() => [
                -63.85 + Math.random() * 0.1,
                10.96 + Math.random() * 0.1,
            ]);

            const srcId = `ruta-${ruta.id}`;
            const lyrId = `ruta-layer-${ruta.id}`;

            this.mapa.addSource(srcId, {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    properties: {},
                    geometry: { type: 'LineString', coordinates: coords },
                },
            });

            this.mapa.addLayer({
                id: lyrId,
                type: 'line',
                source: srcId,
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#a78bfa',
                    'line-width': 3,
                    'line-opacity': 0.5,
                    'line-dasharray': [4, 4],
                },
            });
        }
    }

    private agregarMarcador(index: number, wp: Waypoint, total: number) {
        const el = document.createElement('div');
        const isStart = index === 0;
        const isEnd = index === total - 1;

        el.textContent = isStart ? 'S' : isEnd ? 'L' : String(index + 1);
        el.style.cssText = isStart
            ? 'width:28px;height:28px;border-radius:50%;background:#22c55e;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;border:2px solid #16a34a;'
            : isEnd
              ? 'width:28px;height:28px;border-radius:50%;background:#ef4444;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;border:2px solid #dc2626;'
              : 'width:26px;height:26px;border-radius:50%;background:#f59e0b;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:pointer;';

        const popup = new mapboxgl.Popup({ offset: 20 }).setText(wp.name);
        const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([wp.lng, wp.lat])
            .setPopup(popup)
            .addTo(this.mapa);

        this.markers.push(marker);
    }

    private limpiarMapa() {
        this.markers.forEach((m) => m.remove());
        this.markers = [];
        if (this.mapa.getLayer(this.routeLayerId)) {
            this.mapa.removeLayer(this.routeLayerId);
        }
        if (this.mapa.getSource(this.routeSourceId)) {
            this.mapa.removeSource(this.routeSourceId);
        }
    }

    // ─── Navigation ───

    volverMunicipios() {
        this.selectedMunicipio.set(null);
        this.selectedGuias.set(new Set());
        this.filtroChofer.set(null);
    }

    getMunicipioLabel(value: string | null): string {
        return this.municipios.find((m) => m.value === value)?.label || value || '';
    }

    getSeverity(cantidad: number): 'info' | 'success' | 'warn' | 'danger' {
        if (cantidad > 10) return 'danger';
        if (cantidad > 5) return 'warn';
        return 'info';
    }

    tieneAltaPrioridad(guia: GuiaDespacho): boolean {
        return guia.facturas?.some((f) => f.prioridad === 'Alta') ?? false;
    }

    getMunicipioLabelFrom(value: string): string {
        return this.municipios.find((m) => m.value === value)?.label || value;
    }
}
