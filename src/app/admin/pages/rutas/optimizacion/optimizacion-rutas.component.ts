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
import { SkeletonModule } from 'primeng/skeleton';
import { OrderListModule } from 'primeng/orderlist';
import { DialogModule } from 'primeng/dialog';
import { DatePickerModule } from 'primeng/datepicker';
import { environment } from '@/environments/environment';
import { GuiaDespacho, Ruta, RUTAS_MOCK } from '../data/rutas-mock';
import { RutaService } from '../services/ruta.service';
import { MunicipioService } from '@/app/admin/services/municipio.service';
import { CHOFERES_MOCK } from '../../choferes/data/choferes-mock';
import {
    GoogleMapsOptimizationService,
    Waypoint,
} from '../../map/map/google-maps-optimization.service';
import { ViajeService } from '@/app/services/viaje.service';
import { ViajeGroup, CrearViajeResult } from '@/app/services/viaje.types';

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

const DIAS_SEMANA = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'] as const;

const MAPA_DIA: Record<number, string> = {
    0: 'DOMINGO',
    1: 'LUNES',
    2: 'MARTES',
    3: 'MIERCOLES',
    4: 'JUEVES',
    5: 'VIERNES',
    6: 'SABADO',
};

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
        SkeletonModule,
        OrderListModule,
        DialogModule,
        DatePickerModule,
    ],
    providers: [MessageService],
    templateUrl: './optimizacion-rutas.component.html',
    styleUrl: './optimizacion-rutas.component.css',
})
export class OptimizacionRutasComponent implements OnInit, OnDestroy {
    private messageService = inject(MessageService);
    private googleOptimization = inject(GoogleMapsOptimizationService);
    private rutaService = inject(RutaService);
    private municipioService = inject(MunicipioService);
    protected viajeService = inject(ViajeService);

    private mapaEl = viewChild.required<ElementRef<HTMLDivElement>>('mapaElement');

    mapa!: google.maps.Map;
    private markers: google.maps.marker.AdvancedMarkerElement[] = [];
    private routePolyline: google.maps.Polyline | null = null;
    private routePolylines: google.maps.Polyline[] = [];
    private sedeMarkers: google.maps.marker.AdvancedMarkerElement[] = [];

    readonly municipios = this.municipioService.items;
    readonly cronograma = signal<DiaCronograma[]>([]);
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
    loadingGuias = signal(true);
    loadingCronograma = signal(true);
    guardandoCronograma = signal(false);
    mapaCargado = signal(false);

    diaEditando = signal<string | null>(null);
    diaEditandoLista = signal<string[]>([]);
    municipioAgregar = signal<string>('');

    showConfirmDialog = signal(false);
    viajeGroups = signal<ViajeGroup[]>([]);
    creandoViaje = signal(false);
    viajesResultados = signal<CrearViajeResult[]>([]);
    ultimoOrdenFacturas = signal<string[]>([]);
    fechaViaje = signal<Date>(new Date());

    constructor() {
        afterNextRender(() => this.initMap());
    }

    async ngOnInit() {
        await this.municipioService.obtenerTodos();

        try {
            const guias = await this.rutaService.obtenerGuias();
            this.guias.set(guias);
        } catch (err) {
            console.error('Error al cargar guías', err);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudieron cargar las guías desde la base de datos.',
            });
        }
        this.loadingGuias.set(false);
        this.rutasDisponibles.set([...RUTAS_MOCK]);

        this.loadingCronograma.set(true);
        try {
            const cronograma = await this.rutaService.obtenerCronograma();
            this.cronograma.set(
                cronograma ??
                    DIAS_SEMANA.map((dia) => ({
                        dia,
                        label: DIAS_LABEL[dia],
                        municipios: [],
                    })),
            );
        } catch (err) {
            console.error('Error al cargar cronograma', err);
            this.cronograma.set(
                DIAS_SEMANA.map((dia) => ({
                    dia,
                    label: DIAS_LABEL[dia],
                    municipios: [],
                })),
            );
        }
        this.loadingCronograma.set(false);
    }

    ngOnDestroy() {
        this.limpiarMapa();
        if (this.mapa) {
            google.maps.event.clearInstanceListeners(this.mapa);
            this.mapa = undefined!;
        }
    }

    get municipiosConteo(): MunicipioConteo[] {
        const hoyArr = this.cronograma().find((d) => d.dia === this.hoy)?.municipios || [];
        const guiasNuevas = this.guias().filter((g) =>
            g.facturas?.some((f) => f.idEstado === 'nuevo'),
        );

        const conteos = this.municipios()
            .map((m) => {
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
            })
            .filter((m) => m.cantidad > 0);

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
        return [{ label: 'Todos los Choferes', value: null as any }, ...choferesEnMunicipio];
    }

    get guiasDelMunicipio(): GuiaDespacho[] {
        const municipio = this.selectedMunicipio();
        if (!municipio) return [];
        let list = this.guias().filter(
            (g) => g.municipio === municipio && g.facturas?.some((f) => f.idEstado === 'nuevo'),
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

    seleccionarMunicipio(value: string) {
        this.selectedMunicipio.set(value);
        this.selectedGuias.set(new Set());
        this.filtroChofer.set(null);
        this.limpiarRutaOptimizada();
        this.actualizarSedeMarkers();
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
        this.limpiarRutaOptimizada();
        this.actualizarSedeMarkers();
    }

    toggleTodas() {
        const guias = this.guiasDelMunicipio;
        if (this.todasSeleccionadas) {
            this.selectedGuias.set(new Set());
        } else {
            this.selectedGuias.set(new Set(guias.map((g) => g.id)));
        }
        this.limpiarRutaOptimizada();
        this.actualizarSedeMarkers();
    }

    iniciarViaje() {
        const ids = Array.from(this.selectedGuias());
        if (!ids.length) return;
        console.log('[iniciarViaje] creandoViaje before:', this.creandoViaje());

        const gruposMap = new Map<string, GuiaDespacho[]>();
        for (const id of ids) {
            const guia = this.guias().find((g) => g.id === id);
            if (!guia) continue;
            const arr = gruposMap.get(guia.idChofer) || [];
            arr.push(guia);
            gruposMap.set(guia.idChofer, arr);
        }

        const groups: ViajeGroup[] = [];
        for (const [choferId, guias] of gruposMap) {
            const vehiculos = new Set(guias.map((g) => g.idVehiculo));
            if (vehiculos.size > 1) {
                this.messageService.add({
                    severity: 'error',
                    summary: 'Vehículo inconsistente',
                    detail: `El chofer ${guias[0].nombreChofer} tiene guías con diferentes vehículos. Corrige antes de iniciar viaje.`,
                });
                return;
            }
            groups.push({
                idChofer: choferId,
                nombreChofer: guias[0].nombreChofer,
                idVehiculo: guias[0].idVehiculo,
                placaVehiculo: guias[0].placaVehiculo,
                guias: guias.map((g) => ({
                    id: g.id,
                    numeroGuia: g.numeroGuia,
                    facturaIds: g.facturas.filter((f) => f.idEstado === 'nuevo').map((f) => f.id),
                })),
            });
        }

        this.viajeGroups.set(groups);
        this.showConfirmDialog.set(true);
    }

    async confirmarCrearViajes() {
        this.creandoViaje.set(true);
        const groups = this.viajeGroups();
        const results: CrearViajeResult[] = [];
        const ordenOptimoFacturas = this.ultimoOrdenFacturas();

        for (const group of groups) {
            const allFacturaIds = group.guias.flatMap((g) => g.facturaIds);
            const ordered = [...allFacturaIds].sort((a, b) => {
                const ia = ordenOptimoFacturas.indexOf(a);
                const ib = ordenOptimoFacturas.indexOf(b);
                if (ia >= 0 && ib >= 0) return ia - ib;
                if (ia >= 0) return -1;
                if (ib >= 0) return 1;
                return 0;
            });

            const fechaStr = this.fechaViaje().toISOString().split('T')[0];

            try {
                const result = await this.viajeService.crearViaje({
                    idChofer: group.idChofer,
                    idVehiculo: group.idVehiculo,
                    municipio: this.selectedMunicipio()!,
                    fechaViaje: fechaStr,
                    idsFacturas: ordered,
                    distanciaTotalKm: this.viajeService.rutaDistanciaKm() || undefined,
                    duracionTotalMin: this.viajeService.rutaDuracionMin() || undefined,
                });
                results.push(result);
            } catch (err) {
                console.error('Error al crear viaje', err);
                this.messageService.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: `No se pudo crear el viaje para ${group.nombreChofer}.`,
                });
                this.creandoViaje.set(false);
                return;
            }
        }

        this.viajesResultados.set(results);
        this.creandoViaje.set(false);
        this.showConfirmDialog.set(false);

        this.limpiarMapa();
        this.selectedGuias.set(new Set());
        this.actualizarSedeMarkers();

        await this.recargarGuias();

        const n = results.length;
        this.messageService.add({
            severity: 'success',
            summary: 'Viaje(s) creado(s)',
            detail: `${n} ${n === 1 ? 'viaje creado' : 'viajes creados'} exitosamente.`,
        });
    }

    private async recargarGuias() {
        try {
            const guias = await this.rutaService.obtenerGuias();
            this.guias.set(guias);
        } catch (err) {
            console.error('Error al recargar guías', err);
        }
    }

    private get warehouseWp(): Waypoint {
        return {
            lat: environment.warehouseLat,
            lng: environment.warehouseLng,
            name: 'Almacén',
        };
    }

    private notificarChofer(guia: GuiaDespacho) {
        console.log(`[NOTIFICACIÓN] Guía ${guia.numeroGuia} asignada a ${guia.nombreChofer}`);
    }

    async optimizarRuta() {
        const ids = Array.from(this.selectedGuias());
        if (ids.length < 1) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Selecciona al menos 1 guía',
                detail: 'Para optimizar la ruta necesitas seleccionar al menos 1 guía.',
            });
            return;
        }

        this.optimizando.set(true);

        const guiasSel = this.guias().filter((g) => ids.includes(g.id));

        const waypointMetas: { guiaId: string; facturaId: string }[] = [];
        const waypoints: Waypoint[] = [];
        for (const g of guiasSel) {
            for (const f of g.facturas) {
                if (f.sucursalLat != null && f.sucursalLng != null && f.idEstado === 'nuevo') {
                    waypointMetas.push({ guiaId: g.id, facturaId: f.id });
                    waypoints.push({
                        lat: f.sucursalLat!,
                        lng: f.sucursalLng!,
                        name: `${f.nombreCliente} - Fact. ${f.numeroFactura}`,
                    });
                }
            }
        }

        if (waypoints.length < 1) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Coordenadas insuficientes',
                detail: 'Se necesita al menos 1 factura con ubicación para optimizar.',
            });
            this.optimizando.set(false);
            return;
        }

        const warehouse = this.warehouseWp;

        try {
            const result = await this.googleOptimization.optimize(waypoints, warehouse, warehouse);

            this.limpiarMapa();

            if (result) {
                const orderedFacturaIds: string[] = result.order.map(
                    (idx) => waypointMetas[idx].facturaId,
                );
                this.ultimoOrdenFacturas.set(orderedFacturaIds);

                this.routePolyline = new google.maps.Polyline({
                    path: result.path,
                    geodesic: true,
                    strokeColor: '#22c55e',
                    strokeOpacity: 0.85,
                    strokeWeight: 5,
                    map: this.mapa,
                });

                const bounds = new google.maps.LatLngBounds();
                result.path.forEach((p) => bounds.extend(p));
                this.mapa.fitBounds(bounds, 80);

                this.agregarMarcadorAlmacen(warehouse);
                result.order.forEach((origIdx, i) =>
                    this.agregarMarcadorEntrega(i, waypoints[origIdx]),
                );

                this.viajeService.rutaPath.set(result.path);
                this.viajeService.rutaDistanciaKm.set(result.distance / 1000);
                this.viajeService.rutaDuracionMin.set(Math.round(result.duration / 60));

                const distKm = (result.distance / 1000).toFixed(1);
                const durMin = Math.round(result.duration / 60);
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

        const warehouse = this.warehouseWp;
        const fullPath: google.maps.LatLngLiteral[] = [
            warehouse,
            ...waypoints.map((wp) => ({ lat: wp.lat, lng: wp.lng })),
            warehouse,
        ];

        this.routePolyline = new google.maps.Polyline({
            path: fullPath,
            geodesic: true,
            strokeColor: '#3b82f6',
            strokeOpacity: 0.7,
            strokeWeight: 4,
            icons: [
                {
                    icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW },
                    offset: '50%',
                },
            ],
            map: this.mapa,
        });

        const bounds = new google.maps.LatLngBounds();
        fullPath.forEach((p) => bounds.extend(p));
        this.mapa.fitBounds(bounds, 80);

        this.agregarMarcadorAlmacen(warehouse);
        waypoints.forEach((wp, i) => this.agregarMarcadorEntrega(i, wp));
    }

    // ─── Cronograma editing ───

    get municipiosDisponiblesParaAgregar(): { label: string; value: string }[] {
        const ocupados = this.diaEditandoLista();
        return this.municipios().filter((m) => !ocupados.includes(m.value));
    }

    toggleEditarDia(dia: string) {
        if (this.diaEditando() === dia) {
            this.diaEditando.set(null);
        } else {
            const diaData = this.cronograma().find((d) => d.dia === dia);
            this.diaEditandoLista.set(diaData ? [...diaData.municipios] : []);
            this.diaEditando.set(dia);
        }
        this.municipioAgregar.set('');
    }

    async guardarEdicion() {
        const dia = this.diaEditando();
        if (!dia) return;
        this.cronograma.update((lista) =>
            lista.map((d) => {
                if (d.dia === dia) {
                    return { ...d, municipios: [...this.diaEditandoLista()] };
                }
                return d;
            }),
        );
        this.diaEditando.set(null);
        this.diaEditandoLista.set([]);
        this.municipioAgregar.set('');
        await this.guardarCronograma();
    }

    cancelarEdicion() {
        this.diaEditando.set(null);
        this.diaEditandoLista.set([]);
        this.municipioAgregar.set('');
    }

    agregarMunicipioADia() {
        const valor = this.municipioAgregar();
        if (!valor) return;
        this.diaEditandoLista.update((lista) => [...lista, valor]);
        this.municipioAgregar.set('');
    }

    quitarMunicipioDeDia(municipio: string) {
        this.diaEditandoLista.update((lista) => lista.filter((m) => m !== municipio));
    }

    onReorderDiaEditando(event: any) {
        // Verificamos que el evento traiga la lista ordenada en 'value'
        if (event && event.value) {
            this.diaEditandoLista.set([...event.value]);
        }
    }

    async guardarCronograma() {
        this.guardandoCronograma.set(true);
        try {
            await this.rutaService.guardarCronograma(
                this.cronograma().map((d) => ({ dia: d.dia, municipios: d.municipios })),
            );
            this.messageService.add({
                severity: 'success',
                summary: 'Cronograma guardado',
                detail: 'La programación semanal se guardó correctamente.',
            });
        } catch (err) {
            console.error('Error al guardar cronograma', err);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudo guardar el cronograma.',
            });
        }
        this.guardandoCronograma.set(false);
    }

    // ─── Map helpers ───

    private initMap() {
        this.mapa = new google.maps.Map(this.mapaEl().nativeElement, {
            center: { lat: 10.96, lng: -63.85 },
            zoom: 10,
            mapId: 'optimizacion-rutas',
        });
        google.maps.event.addListenerOnce(this.mapa, 'idle', () => {
            this.mapaCargado.set(true);
            this.dibujarRutasExistentes();
        });
    }

    private dibujarRutasExistentes() {
        const rutas = this.rutasDisponibles().filter((r) => r.estado === 'ACTIVA');
        for (const ruta of rutas) {
            const guias = this.guias().filter((g) => ruta.idsGuias.includes(g.id));
            if (guias.length < 2) continue;

            const path = guias.map(() => ({
                lat: 10.96 + Math.random() * 0.1,
                lng: -63.85 + Math.random() * 0.1,
            }));

            const polyline = new google.maps.Polyline({
                path,
                geodesic: true,
                strokeColor: '#a78bfa',
                strokeOpacity: 0.5,
                strokeWeight: 3,
                icons: [
                    {
                        icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW },
                        offset: '50%',
                    },
                ],
                map: this.mapa,
            });

            this.routePolylines.push(polyline);
        }
    }

    private agregarMarcadorAlmacen(wp: Waypoint) {
        const content = document.createElement('div');
        content.innerHTML =
            '<div style="width:28px;height:28px;background:#8b5cf6;border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></div>';
        const marker = new google.maps.marker.AdvancedMarkerElement({
            position: { lat: wp.lat, lng: wp.lng },
            map: this.mapa,
            content: content.firstElementChild as HTMLElement,
            title: wp.name,
        });
        const infoWindow = new google.maps.InfoWindow({
            content: `<strong>${wp.name}</strong><br><em>Salida y regreso</em>`,
        });
        marker.addListener('gmp-click', () => infoWindow.open(this.mapa, marker));
        this.markers.push(marker);
    }

    private agregarMarcadorEntrega(index: number, wp: Waypoint) {
        const content = document.createElement('div');
        content.innerHTML = `<div style="width:24px;height:24px;background:#f59e0b;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;color:#fff;">${index + 1}</div>`;
        const marker = new google.maps.marker.AdvancedMarkerElement({
            position: { lat: wp.lat, lng: wp.lng },
            map: this.mapa,
            content: content.firstElementChild as HTMLElement,
            title: wp.name,
        });
        const infoWindow = new google.maps.InfoWindow({ content: wp.name });
        marker.addListener('gmp-click', () => infoWindow.open(this.mapa, marker));
        this.markers.push(marker);
    }

    private limpiarRutaOptimizada() {
        this.markers.forEach((m) => (m.map = null));
        this.markers = [];
        if (this.routePolyline) {
            this.routePolyline.setMap(null);
            this.routePolyline = null;
        }
        this.routePolylines.forEach((p) => p.setMap(null));
        this.routePolylines = [];
        this.viajeService.rutaPath.set([]);
        this.viajeService.rutaDistanciaKm.set(0);
        this.viajeService.rutaDuracionMin.set(0);
        this.ultimoOrdenFacturas.set([]);
    }

    private limpiarMapa() {
        this.limpiarRutaOptimizada();
        this.limpiarSedeMarkers();
    }

    private limpiarSedeMarkers() {
        this.sedeMarkers.forEach((m) => (m.map = null));
        this.sedeMarkers = [];
    }

    private actualizarSedeMarkers() {
        this.limpiarSedeMarkers();

        for (const id of this.selectedGuias()) {
            const guia = this.guias().find((g) => g.id === id);
            if (!guia) continue;

            for (const f of guia.facturas) {
                if (f.sucursalLat == null || f.sucursalLng == null) continue;

                const div = document.createElement('div');
                div.innerHTML =
                    '<div style="width:16px;height:16px;background:#3b82f6;border-radius:50%;border:2px solid #fff;"></div>';
                const marker = new google.maps.marker.AdvancedMarkerElement({
                    position: { lat: f.sucursalLat, lng: f.sucursalLng },
                    map: this.mapa,
                    content: div.firstElementChild as HTMLElement,
                });

                const infoWindow = new google.maps.InfoWindow({
                    content: `
                        <div class="text-sm">
                            <strong>${f.nombreCliente}</strong><br>
                            ${f.direccionSucursal || ''}<br>
                            Factura: ${f.numeroFactura}
                        </div>
                    `,
                });
                marker.addListener('gmp-click', () => infoWindow.open(this.mapa, marker));
                this.sedeMarkers.push(marker);
            }
        }
    }

    // ─── Navigation ───

    volverMunicipios() {
        this.selectedMunicipio.set(null);
        this.selectedGuias.set(new Set());
        this.filtroChofer.set(null);
        this.limpiarMapa();
    }

    getMunicipioLabel(value: string | null): string {
        return this.municipios().find((m) => m.value === value)?.label || value || '';
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
        return this.municipios().find((m) => m.value === value)?.label || value;
    }
}
