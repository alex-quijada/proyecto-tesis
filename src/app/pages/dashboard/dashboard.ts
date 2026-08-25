import {
    Component,
    OnInit,
    OnDestroy,
    computed,
    signal,
    inject,
    viewChild,
    ElementRef,
    afterNextRender,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ChartModule } from 'primeng/chart';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { TabsModule } from 'primeng/tabs';
import { BadgeModule } from 'primeng/badge';
import { RealtimeChannel } from '@supabase/supabase-js';
import { environment } from '@/environments/environment';
import { AuthService } from '@/app/auth/service/auth.service';
import {
    DashboardService,
    ViajeActivo,
    PosicionChoferLite,
    ActividadItem,
} from '@/app/services/dashboard.service';

interface KpiCard {
    label: string;
    value: number;
    valueVES?: number;
    icon: string;
    subtitle: string;
    ruta: string;
}

const OFFLINE_MS = 2 * 60 * 1000;
const TICK_MS = 30_000;

interface PayloadPosicion {
    new?: PosicionChoferLite | null;
}

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [
        CommonModule,
        ChartModule,
        TagModule,
        SkeletonModule,
        ButtonModule,
        TooltipModule,
        TabsModule,
        BadgeModule,
    ],
    templateUrl: './dashboard.html',
})
export class Dashboard implements OnInit, OnDestroy {
    private dashboardService = inject(DashboardService);
    private authService = inject(AuthService);
    router = inject(Router);
    private mapaEl = viewChild.required<ElementRef<HTMLDivElement>>('mapaElement');

    loading = signal(true);
    kpis = signal<KpiCard[]>([]);
    viajesActivos = signal<ViajeActivo[]>([]);
    facturasPendientes = signal<
        {
            lat: number;
            lng: number;
            titulo: string;
            numeroFactura: string;
            direccion: string;
            totalUSD: number;
            totalVES: number;
        }[]
    >([]);
    posiciones = signal<Record<string, PosicionChoferLite>>({});
    entregasRecientes = signal<ActividadItem[]>([]);
    incidencias = signal<ActividadItem[]>([]);
    municipioData = signal<any>(null);
    municipioOptions = signal<any>(null);
    conectado = signal(false);
    ultimaActualizacion = signal<Date | null>(null);
    tick = signal(0);

    private mapa!: google.maps.Map;
    private markers: google.maps.marker.AdvancedMarkerElement[] = [];
    private infoWindows: google.maps.InfoWindow[] = [];
    mapaListo = false;

    private canal: RealtimeChannel | null = null;
    private alReconectar: (() => void) | null = null;
    private pendienteRefrescar = false;
    private debounceViaje: ReturnType<typeof setTimeout> | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;

    readonly choferesEnLinea = computed(() => {
        this.tick();
        const limite = Date.now() - OFFLINE_MS;
        return Object.values(this.posiciones()).filter(
            (p) => p.actualizado_en && new Date(p.actualizado_en).getTime() >= limite,
        ).length;
    });

    readonly viajesEnProceso = computed(
        () => this.viajesActivos().filter((v) => v.estado === 'proceso').length,
    );

    constructor() {
        this.timer = setInterval(() => this.tick.update((t) => t + 1), TICK_MS);
        afterNextRender(() => this.initMap());
    }

    async ngOnInit() {
        try {
            const [kpis, viajes, facturas, porMunicipio, posiciones, actividad] = await Promise.all(
                [
                    this.dashboardService.obtenerKpis(),
                    this.dashboardService.obtenerViajesActivos(),
                    this.dashboardService.obtenerFacturasPendientes(),
                    this.dashboardService.obtenerFacturasPorMunicipio(),
                    this.dashboardService.obtenerPosicionesChoferes(),
                    this.dashboardService.obtenerActividadReciente(),
                ],
            );

            this.facturasPendientes.set(
                facturas.map((f) => ({
                    lat: f.lat!,
                    lng: f.lng!,
                    titulo: f.nombreCliente,
                    numeroFactura: f.numeroFactura,
                    direccion: f.direccion,
                    totalUSD: f.totalUSD,
                    totalVES: f.totalVES,
                })),
            );

            if (this.mapaListo) this.dibujarFacturasPendientes();

            this.kpis.set([
                {
                    label: 'Guías Pendientes',
                    value: kpis.guiasPendientes,
                    icon: 'pi pi-file',
                    subtitle: 'Por planificar viajes',
                    ruta: '/app/rutas/optimizacion',
                },
                {
                    label: 'Choferes Activos',
                    value: kpis.choferesActivos,
                    icon: 'pi pi-users',
                    subtitle: 'Disponibles en el sistema',
                    ruta: '/app/choferes',
                },
                {
                    label: 'Vehículos Operativos',
                    value: kpis.vehiculosOperativos,
                    icon: 'pi pi-truck',
                    subtitle: 'En condiciones de rodar',
                    ruta: '/app/vehiculos',
                },
                {
                    label: 'Monto Pendiente',
                    value: kpis.montoPendienteUSD,
                    valueVES: kpis.montoPendienteVES,
                    icon: 'pi pi-dollar',
                    subtitle: 'Mercancía sin entregar',
                    ruta: '/app/rutas/optimizacion',
                },
            ]);

            this.viajesActivos.set(viajes);
            this.aplicarPosiciones(posiciones);
            this.entregasRecientes.set(actividad.entregas);
            this.incidencias.set(actividad.incidencias);
            this.ultimaActualizacion.set(new Date());

            this.initChart(porMunicipio);
        } catch (err) {
            console.error('Error al cargar dashboard', err);
        } finally {
            this.loading.set(false);
        }

        this.initRealtime();
    }

    ngOnDestroy() {
        if (this.timer) clearInterval(this.timer);
        if (this.debounceViaje) clearTimeout(this.debounceViaje);
        if (this.alReconectar) {
            window.removeEventListener('online', this.alReconectar);
            this.alReconectar = null;
        }
        if (this.canal) {
            void this.authService.client.removeChannel(this.canal);
            this.canal = null;
        }
        this.markers.forEach((m) => (m.map = null));
        this.markers = [];
        this.infoWindows = [];
        if (this.mapa) {
            google.maps.event.clearInstanceListeners(this.mapa);
            this.mapa = undefined!;
        }
    }

    async refrescar(): Promise<void> {
        try {
            const [viajes, posiciones, actividad] = await Promise.all([
                this.dashboardService.obtenerViajesActivos(),
                this.dashboardService.obtenerPosicionesChoferes(),
                this.dashboardService.obtenerActividadReciente(),
            ]);
            this.viajesActivos.set(viajes);
            this.aplicarPosiciones(posiciones);
            this.entregasRecientes.set(actividad.entregas);
            this.incidencias.set(actividad.incidencias);
            this.ultimaActualizacion.set(new Date());
        } catch (err) {
            console.error('Error al refrescar dashboard', err);
        }
    }

    private aplicarPosiciones(lista: PosicionChoferLite[]): void {
        const mapa: Record<string, PosicionChoferLite> = {};
        for (const p of lista) mapa[p.id_chofer] = p;
        this.posiciones.set(mapa);
    }

    private initRealtime(): void {
        if (this.canal) return;
        const user = this.authService.getCurrentUser();
        if (!user) return;

        this.crearCanal(user.id);

        if (!this.alReconectar) {
            this.alReconectar = () => {
                if (this.conectado()) return;
                const id = this.authService.getCurrentUser()?.id;
                if (!id) return;
                if (this.canal) void this.authService.client.removeChannel(this.canal);
                this.canal = null;
                this.pendienteRefrescar = true;
                this.crearCanal(id);
            };
            window.addEventListener('online', this.alReconectar);
        }
    }

    private crearCanal(userId: string): void {
        this.canal = this.authService.client
            .channel(`dashboard-admin-${userId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'posiciones_chofer' },
                (payload) => this.onPosicion(payload as unknown as PayloadPosicion),
            )
            .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, () =>
                this.onCambioViaje(),
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'itinerario_viaje' },
                () => this.onCambioViaje(),
            )
            .subscribe((status) => {
                this.conectado.set(status === 'SUBSCRIBED');
                if (status === 'SUBSCRIBED' && this.pendienteRefrescar) {
                    this.pendienteRefrescar = false;
                    void this.refrescar();
                }
            });
    }

    private onPosicion(payload: PayloadPosicion): void {
        const nueva = payload.new;
        if (!nueva?.id_chofer || nueva.latitud == null || nueva.longitud == null) return;
        this.posiciones.update((mapa) => ({ ...mapa, [nueva.id_chofer!]: nueva }));
        this.ultimaActualizacion.set(new Date());
    }

    private onCambioViaje(): void {
        if (this.debounceViaje) clearTimeout(this.debounceViaje);
        this.debounceViaje = setTimeout(() => {
            void this.refrescar();
        }, 500);
    }

    private initMap() {
        const el = this.mapaEl()?.nativeElement;
        if (!el || typeof google === 'undefined' || !google.maps) {
            setTimeout(() => this.initMap(), 200);
            return;
        }
        this.mapa = new google.maps.Map(el, {
            center: { lat: environment.warehouseLat, lng: environment.warehouseLng },
            zoom: 10,
            mapId: 'map',
        });
        google.maps.event.addListenerOnce(this.mapa, 'idle', () => {
            this.mapaListo = true;
            this.agregarMarcadorAlmacen();
            if (this.facturasPendientes().length) this.dibujarFacturasPendientes();
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
        });
        const info = new google.maps.InfoWindow({ content: '<strong>Almacén central</strong>' });
        marker.addListener('gmp-click', () => info.open(this.mapa, marker));
        this.markers.push(marker);
        this.infoWindows.push(info);
    }

    private dibujarFacturasPendientes() {
        const facturas = this.facturasPendientes();
        for (let i = 0; i < facturas.length; i++) {
            const f = facturas[i];
            const div = document.createElement('div');
            div.innerHTML = `<div style="width:24px;height:24px;background:#3b82f6;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;color:#fff;">${i + 1}</div>`;
            const marker = new google.maps.marker.AdvancedMarkerElement({
                position: { lat: f.lat, lng: f.lng },
                map: this.mapa,
                content: div.firstElementChild as HTMLElement,
                title: f.titulo,
            });
            const info = new google.maps.InfoWindow({
                content: this.infoWindowHtml(f),
                maxWidth: 260,
            });
            marker.addListener('gmp-click', () => info.open({ map: this.mapa, anchor: marker }));
            this.markers.push(marker);
            this.infoWindows.push(info);
        }
    }

    /** HTML del InfoWindow con estilos inline (los estilos de la app no se
     *  aplican dentro del contexto aislado de Google Maps). El `margin-top`
     *  negativo sube el contenido para cubrir el header nativo de Google
     *  (donde está la X) y así no queda espacio en blanco a su izquierda. */
    private infoWindowHtml(f: {
        titulo: string;
        numeroFactura: string;
        totalUSD: number;
        totalVES: number;
    }): string {
        return `
            <div style="font-family:'Segoe UI',system-ui,sans-serif;margin-top:-18px;width:248px;">
                <div style="display:flex;align-items:center;gap:7px;background:#eff6ff;border-bottom:1px solid #bfdbfe;padding:11px 12px 9px;">
                    <span style="width:20px;height:20px;border-radius:50%;background:#3b82f6;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">${this.indiceMarcador(f)}</span>
                    <span style="font-size:13px;font-weight:600;color:#0f172a;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.escapar(f.titulo)}</span>
                </div>
                <div style="padding:7px 12px 9px;font-size:12px;color:#475569;">
                    <span style="color:#0f172a;font-weight:600;">Factura:</span> ${this.escapar(f.numeroFactura)}
                    <div style="margin-top:5px;border-top:1px solid #f1f5f9;padding-top:5px;">
                        <strong style="color:#0f172a;">$${f.totalUSD.toLocaleString('es-VE', { maximumFractionDigits: 2 })}</strong>
                        <span style="color:#94a3b8;margin:0 3px;">|</span>
                        <strong style="color:#0f172a;">Bs ${f.totalVES.toLocaleString('es-VE', { maximumFractionDigits: 0 })}</strong>
                    </div>
                </div>
            </div>`;
    }

    private indiceMarcador(f: { numeroFactura: string }): string {
        const idx = this.facturasPendientes().findIndex((x) => x.numeroFactura === f.numeroFactura);
        return idx >= 0 ? String(idx + 1) : '';
    }

    private escapar(texto: string): string {
        return String(texto || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    private initChart(porMunicipio: { label: string; cantidad: number }[]) {
        const documentStyle = getComputedStyle(document.documentElement);
        const textColorSecondary = documentStyle.getPropertyValue('--text-color-secondary');
        const surfaceBorder = documentStyle.getPropertyValue('--surface-border');

        const colores = [
            '#3b82f6',
            '#8b5cf6',
            '#06b6d4',
            '#10b981',
            '#f59e0b',
            '#ec4899',
            '#6366f1',
            '#14b8a6',
            '#f97316',
            '#84cc16',
            '#a855f7',
            '#ef4444',
        ];

        this.municipioData.set({
            labels: porMunicipio.map((m) => m.label),
            datasets: [
                {
                    label: 'Guías pendientes',
                    data: porMunicipio.map((m) => m.cantidad),
                    backgroundColor: porMunicipio.map((_, i) => colores[i % colores.length]),
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 22,
                },
            ],
        });
        this.municipioOptions.set({
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: surfaceBorder,
                    titleColor: textColorSecondary,
                    callbacks: {
                        label: (ctx: any) => ` ${ctx.parsed.x} guías`,
                    },
                },
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { color: textColorSecondary, precision: 0 },
                    grid: { color: surfaceBorder },
                },
                y: {
                    ticks: { color: textColorSecondary },
                    grid: { display: false },
                },
            },
        });
    }

    irAViajes() {
        this.router.navigate(['/app/rutas/optimizacion']);
    }

    irASeccion(kpi: KpiCard) {
        this.router.navigate([kpi.ruta]);
    }

    irARuta(ruta: string) {
        this.router.navigate([ruta]);
    }

    datoExtra(kpi: KpiCard): { strong: string; rest: string } {
        const pendientes = this.facturasPendientes().length;
        switch (kpi.icon) {
            case 'pi pi-file':
                return {
                    strong: `${pendientes} factura${pendientes === 1 ? '' : 's'}`,
                    rest: 'sin asignar',
                };
            case 'pi pi-users':
                return { strong: `${this.choferesEnLinea()}`, rest: 'en línea ahora' };
            case 'pi pi-truck':
                return {
                    strong: `${this.viajesEnProceso()} viaje${
                        this.viajesEnProceso() === 1 ? '' : 's'
                    }`,
                    rest: 'en proceso',
                };
            case 'pi pi-dollar':
                return {
                    strong: `${pendientes} factura${pendientes === 1 ? '' : 's'}`,
                    rest: 'por cobrar',
                };
            default:
                return { strong: '', rest: '' };
        }
    }

    tileClasses(kpi: KpiCard): string {
        switch (kpi.icon) {
            case 'pi pi-file':
                return 'bg-blue-100 dark:bg-blue-400/10 text-blue-500';
            case 'pi pi-users':
                return 'bg-orange-100 dark:bg-orange-400/10 text-orange-500';
            case 'pi pi-truck':
                return 'bg-cyan-100 dark:bg-cyan-400/10 text-cyan-500';
            case 'pi pi-dollar':
                return 'bg-purple-100 dark:bg-purple-400/10 text-purple-500';
            default:
                return 'bg-surface-100 dark:bg-surface-700 text-surface-500';
        }
    }

    estadoSeverity(
        estado: string,
    ): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' | undefined {
        if (estado === 'proceso') return 'info';
        if (estado === 'programado') return 'warn';
        return 'secondary';
    }

    estadoLabel(estado: string): string {
        return estado === 'proceso'
            ? 'En Proceso'
            : estado === 'programado'
              ? 'Programado'
              : estado;
    }

    progresoViaje(viaje: ViajeActivo): number {
        if (!viaje.totalFacturas) return 0;
        return Math.round((viaje.facturasProceso / viaje.totalFacturas) * 100);
    }

    colorViaje(estado: string): string {
        if (estado === 'proceso') return '#3b82f6';
        if (estado === 'programado') return '#f59e0b';
        return '#64748b';
    }
}
