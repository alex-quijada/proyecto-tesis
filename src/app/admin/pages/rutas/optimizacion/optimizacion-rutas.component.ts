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
import { ConfirmationService } from 'primeng/api';
import { NotificationService } from '@/app/services/notification.service';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
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
import { GuiaDespacho, FacturaGuia, Ruta, RUTAS_MOCK } from '../data/rutas-mock';
import { RutaService } from '../services/ruta.service';
import { MunicipioService } from '@/app/admin/services/municipio.service';
import {
    GoogleMapsOptimizationService,
    Waypoint,
} from '../../map/map/google-maps-optimization.service';
import { ViajeService } from '@/app/services/viaje.service';
import { ViajeAdmin, ViajeGroup, CrearViajeResult } from '@/app/services/viaje.types';
import { ordenarPorVentana } from '@/app/driver/services/time-window.router';

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

const PLURAL_FACTURAS: Record<string, string> = {
    '=0': 'sin facturas',
    '=1': '1 factura',
    other: '# facturas',
};

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
        ConfirmDialogModule,
        DatePickerModule,
    ],
    providers: [ConfirmationService],
    templateUrl: './optimizacion-rutas.component.html',
    styleUrl: './optimizacion-rutas.component.css',
})
export class OptimizacionRutasComponent implements OnInit, OnDestroy {
    private notif = inject(NotificationService);
    private confirmationService = inject(ConfirmationService);
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

    get municipiosHoy(): number {
        return this.cronograma().find((d) => d.dia === this.hoy)?.municipios.length ?? 0;
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
    cronogramaAbierto = signal(false);

    diaEditando = signal<string | null>(null);
    diaEditandoLista = signal<string[]>([]);
    municipioAgregar = signal<string>('');

    showConfirmDialog = signal(false);
    viajeGroups = signal<ViajeGroup[]>([]);
    creandoViaje = signal(false);
    viajesResultados = signal<CrearViajeResult[]>([]);
    ultimoOrdenFacturas = signal<string[]>([]);
    fechaViaje = signal<Date>(new Date());
    /** Guías excluidas por vehículo distinto al del viaje del chofer. */
    guiasExcluidasVehiculo = signal<{ chofer: string; guias: string[] }[]>([]);
    editandoFecha = signal(false);
    /** Guía actualmente expandida en el diálogo de confirmar. */
    guiaExpandida = signal<string | null>(null);

    /** Guía actualmente expandida en la lista de selección del municipio. */
    guiaListaExpandida = signal<string | null>(null);

    readonly pluralFacturas = PLURAL_FACTURAS;

    toggleGuiaExpandida(id: string) {
        this.guiaExpandida.set(this.guiaExpandida() === id ? null : id);
    }

    toggleGuiaListaExpandida(id: string) {
        this.guiaListaExpandida.set(this.guiaListaExpandida() === id ? null : id);
    }

    viajesAdmin = signal<ViajeAdmin[]>([]);
    viajesAbierto = signal(false);
    loadingViajes = signal(false);

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
            this.notif.add({
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
        void this.cargarViajesAdmin();
    }

    async cargarViajesAdmin() {
        this.loadingViajes.set(true);
        try {
            const data = await this.viajeService.obtenerViajes();
            this.viajesAdmin.set(data);
        } catch (err) {
            console.error('Error al cargar viajes', err);
        } finally {
            this.loadingViajes.set(false);
        }
    }

    reiniciarViaje(viaje: ViajeAdmin) {
        this.confirmationService.confirm({
            message: `¿Reiniciar el viaje de ${viaje.chofer || 'este chofer'}? El viaje volverá a "programado" y sus ${viaje.total_facturas ?? 0} facturas a "embarque" (se borra la firma).`,
            header: 'Reiniciar viaje',
            icon: 'pi pi-refresh',
            acceptLabel: 'Reiniciar',
            acceptIcon: 'pi pi-check',
            rejectLabel: 'Cancelar',
            accept: () => void this.confirmarReinicio(viaje),
        });
    }

    private async confirmarReinicio(viaje: ViajeAdmin) {
        try {
            await this.viajeService.reiniciarViaje(viaje.id_viaje);
            this.notif.add({
                severity: 'success',
                summary: 'Viaje reiniciado',
                detail: `El viaje de ${viaje.chofer || ''} volvió a programado.`,
            });
            await this.cargarViajesAdmin();
        } catch (err: any) {
            console.error('Error al reiniciar viaje', err);
            this.notif.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo reiniciar el viaje.',
            });
        }
    }

    estadoViajeSeverity(
        estado: string,
    ): 'info' | 'warn' | 'success' | 'secondary' | 'danger' | 'contrast' {
        switch (estado) {
            case 'proceso':
                return 'info';
            case 'programado':
                return 'warn';
            case 'finalizado':
                return 'success';
            case 'cancelado':
                return 'danger';
            default:
                return 'secondary';
        }
    }

    estadoViajeLabel(estado: string): string {
        switch (estado) {
            case 'proceso':
                return 'En Proceso';
            case 'programado':
                return 'Programado';
            case 'finalizado':
                return 'Finalizado';
            case 'cancelado':
                return 'Cancelado';
            default:
                return estado;
        }
    }

    ngOnDestroy() {
        this.limpiarMapa();
        if (this.mapa) {
            google.maps.event.clearInstanceListeners(this.mapa);
            this.mapa = undefined!;
        }
    }

    /** Una factura es re-despachable si está 'nuevo' o tiene al menos una
     *  incidencia pendiente recuperable en BD. */
    private esFacturaReespachable(f: FacturaGuia): boolean {
        if (f.idEstado === 'nuevo') return true;
        if (f.idEstado !== 'incidencia') return false;
        return (
            f.incidencias?.some((i) => i.recuperable && !i.resuelta) ??
            f.incidenciaRecuperable === true
        );
    }

    /** Facturas pendientes de despacho de una guía (nuevas o con incidencia
     *  recuperable). */
    facturasPendientes(guia: GuiaDespacho): FacturaGuia[] {
        return guia.facturas?.filter((f) => this.esFacturaReespachable(f)) ?? [];
    }

    private prioridadRank(prioridad: string): number {
        switch (prioridad) {
            case 'Alta':
                return 0;
            case 'Media':
                return 1;
            default:
                return 2;
        }
    }

    /** Mejor prioridad entre las facturas pendientes de la guía. */
    private prioridadMaxima(guia: GuiaDespacho): number {
        const ranks = this.facturasPendientes(guia).map((f) => this.prioridadRank(f.prioridad));
        return ranks.length ? Math.min(...ranks) : 3;
    }

    get municipiosConteo(): MunicipioConteo[] {
        const hoyArr = this.cronograma().find((d) => d.dia === this.hoy)?.municipios || [];
        const guiasNuevas = this.guias().filter((g) =>
            g.facturas?.some((f) => this.esFacturaReespachable(f)),
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
                const id = g.idChofer;
                if (id && !acc.some((a: ChoferOption) => a.value === id)) {
                    acc.push({
                        label: `${g.nombreChofer || 'Chofer'} — ${g.cedulaChofer || '—'}`,
                        value: id,
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
            (g) =>
                g.municipio === municipio && g.facturas?.some((f) => this.esFacturaReespachable(f)),
        );
        const chofer = this.filtroChofer();
        if (chofer) {
            list = list.filter((g) => g.idChofer === chofer);
        }
        // Prioridad Alta primero, luego Media y al final Baja.
        return [...list].sort((a, b) => this.prioridadMaxima(a) - this.prioridadMaxima(b));
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

        const gruposMap = new Map<string, GuiaDespacho[]>();
        for (const id of ids) {
            const guia = this.guias().find((g) => g.id === id);
            if (!guia) continue;
            const arr = gruposMap.get(guia.idChofer) || [];
            arr.push(guia);
            gruposMap.set(guia.idChofer, arr);
        }

        const groups: ViajeGroup[] = [];
        const excluidas: { chofer: string; guias: string[] }[] = [];

        for (const [choferId, guias] of gruposMap) {
            // Vehículo objetivo: el del viaje 'programado' abierto del chofer,
            // si no, el de la primera guía seleccionada.
            const viajeProgramado = this.viajesAdmin().find(
                (v) => v.id_chofer === choferId && v.estado === 'programado',
            );
            const vehiculoObjetivo = viajeProgramado?.id_vehiculo || guias[0].idVehiculo;

            // Separar guías que coinciden con el vehículo objetivo.
            const compatibles = guias.filter((g) => g.idVehiculo === vehiculoObjetivo);
            const noCompatibles = guias.filter((g) => g.idVehiculo !== vehiculoObjetivo);

            if (noCompatibles.length > 0) {
                excluidas.push({
                    chofer: guias[0].nombreChofer,
                    guias: noCompatibles.map((g) => g.numeroGuia || g.id),
                });
            }

            if (compatibles.length === 0) continue;

            const nombreChofer = guias[0].nombreChofer;
            const vehiculo = compatibles[0];

            groups.push({
                idChofer: choferId,
                nombreChofer,
                idVehiculo: vehiculo.idVehiculo,
                placaVehiculo: vehiculo.placaVehiculo,
                guias: compatibles.map((g) => {
                    const facturasReespachables = g.facturas.filter((f) =>
                        this.esFacturaReespachable(f),
                    );
                    return {
                        id: g.id,
                        numeroGuia: g.numeroGuia,
                        facturaIds: facturasReespachables.map((f) => f.id),
                        facturasIncluidas: facturasReespachables.map((f) => ({
                            numero: f.numeroFactura,
                            cliente: f.nombreCliente || '',
                        })),
                    };
                }),
            });
        }

        if (excluidas.length > 0) {
            this.guiasExcluidasVehiculo.set(excluidas);
            for (const e of excluidas) {
                this.notif.add({
                    severity: 'error',
                    summary: 'Vehículo distinto',
                    detail: `El chofer ${e.chofer} tiene guías con otro vehículo que no se incluirán: ${e.guias.join(', ')}`,
                    life: 6000,
                });
            }
        } else {
            this.guiasExcluidasVehiculo.set([]);
        }

        this.viajeGroups.set(groups);
        this.editandoFecha.set(false);

        // Fecha por defecto: la del viaje 'programado' abierto del primer
        // chofer del grupo; si no hay, la de hoy.
        const primerChofer = groups[0]?.idChofer;
        const viajeAbierto = primerChofer
            ? this.viajesAdmin().find(
                  (v) => v.id_chofer === primerChofer && v.estado === 'programado',
              )
            : undefined;
        this.fechaViaje.set(
            viajeAbierto?.fecha_viaje
                ? new Date(viajeAbierto.fecha_viaje + 'T00:00:00')
                : new Date(),
        );

        this.showConfirmDialog.set(true);
    }

    async confirmarCrearViajes() {
        this.creandoViaje.set(true);
        const groups = this.viajeGroups();
        const results: CrearViajeResult[] = [];
        const ordenOptimoFacturas = this.ultimoOrdenFacturas();

        for (const group of groups) {
            // Índice de la última optimización (orden de Google), para desempatar.
            const ordenOptimoFacturas = this.ultimoOrdenFacturas();

            const facturaPorId = new Map<string, FacturaGuia>();
            for (const g of this.guias()) {
                for (const f of g.facturas || []) facturaPorId.set(f.id, f);
            }

            const allFacturaIds = group.guias.flatMap((g) => g.facturaIds);
            const facturasRuteables = allFacturaIds
                .map((id) => facturaPorId.get(id))
                .filter(
                    (f): f is FacturaGuia => !!f && f.sucursalLat != null && f.sucursalLng != null,
                );

            // Orden VRPTW desde el almacén: las empresas que cierran pronto se
            // priorizan y las aún-cerradas van al final.
            let ordered: string[];
            if (facturasRuteables.length > 0) {
                const res = ordenarPorVentana(
                    facturasRuteables.map((f) => ({
                        id: f.id,
                        latitud: f.sucursalLat!,
                        longitud: f.sucursalLng!,
                        horaDesde: f.horaDesde,
                        horaHasta: f.horaHasta,
                    })),
                    { lat: environment.warehouseLat, lng: environment.warehouseLng },
                );
                const porId = new Map(facturasRuteables.map((f) => [f.id, f]));
                ordered = res.orden.map((r) => porId.get(r.id)!.id);
            } else {
                ordered = [...allFacturaIds].sort((a, b) => {
                    const ia = ordenOptimoFacturas.indexOf(a);
                    const ib = ordenOptimoFacturas.indexOf(b);
                    if (ia >= 0 && ib >= 0) return ia - ib;
                    if (ia >= 0) return -1;
                    if (ib >= 0) return 1;
                    return 0;
                });
            }

            const fechaStr = this.fechaViaje().toISOString().split('T')[0];

            try {
                const result = await this.viajeService.crearViaje({
                    idChofer: group.idChofer,
                    idVehiculo: group.idVehiculo,
                    fechaViaje: fechaStr,
                    idsFacturas: ordered,
                });
                results.push(result);
            } catch (err) {
                console.error('Error al crear viaje', err);
                this.notif.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: `No se pudo agregar el viaje para ${group.nombreChofer}.`,
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
        if (this.guiasDelMunicipio.length === 0) {
            this.volverMunicipios();
        }

        const creados = results.filter((r) => r.nuevo).length;
        const agregados = results.length - creados;
        const partes: string[] = [];
        if (creados > 0)
            partes.push(`${creados} ${creados === 1 ? 'viaje creado' : 'viajes creados'}`);
        if (agregados > 0)
            partes.push(
                `${agregados} ${agregados === 1 ? 'viaje actualizado' : 'viajes actualizados'}`,
            );
        this.notif.add({
            severity: 'success',
            summary: 'Guías agregadas al viaje',
            detail: `${partes.join(' · ')}. Las facturas quedaron en estado embarque.`,
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
            this.notif.add({
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
                if (
                    f.sucursalLat != null &&
                    f.sucursalLng != null &&
                    this.esFacturaReespachable(f)
                ) {
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
            this.notif.add({
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
                this.notif.add({
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
        this.notif.add({
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
            this.notif.add({
                severity: 'success',
                summary: 'Cronograma guardado',
                detail: 'La programación semanal se guardó correctamente.',
            });
        } catch (err) {
            console.error('Error al guardar cronograma', err);
            this.notif.add({
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
            center: { lat: 10.96, lng: -64.1 },
            zoom: 10.5,
            mapId: 'optimizacion-rutas',
            disableDefaultUI: true,
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

            for (const f of this.facturasPendientes(guia)) {
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
        return this.facturasPendientes(guia).some((f) => f.prioridad === 'Alta');
    }

    getMunicipioLabelFrom(value: string): string {
        return this.municipios().find((m) => m.value === value)?.label || value;
    }
}
