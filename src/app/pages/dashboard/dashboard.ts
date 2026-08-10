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
import { Router } from '@angular/router';
import { ChartModule } from 'primeng/chart';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { ButtonModule } from 'primeng/button';
import { environment } from '@/environments/environment';
import { DashboardService, ViajeActivo } from '@/app/services/dashboard.service';

interface KpiCard {
    label: string;
    value: number;
    icon: string;
    color: string;
}

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [CommonModule, ChartModule, TableModule, TagModule, SkeletonModule, ButtonModule],
    templateUrl: './dashboard.html',
})
export class Dashboard implements OnInit, OnDestroy {
    private dashboardService = inject(DashboardService);
    router = inject(Router);
    private mapaEl = viewChild.required<ElementRef<HTMLDivElement>>('mapaElement');

    loading = signal(true);
    kpis = signal<KpiCard[]>([]);
    viajesActivos = signal<ViajeActivo[]>([]);
    facturasPendientes = signal<{ lat: number; lng: number; titulo: string; detalle: string }[]>(
        [],
    );
    municipioData = signal<any>(null);
    municipioOptions = signal<any>(null);

    private mapa!: google.maps.Map;
    private markers: google.maps.marker.AdvancedMarkerElement[] = [];
    private infoWindows: google.maps.InfoWindow[] = [];
    private mapaListo = false;

    constructor() {
        afterNextRender(() => this.initMap());
    }

    async ngOnInit() {
        try {
            const [kpis, viajes, facturas, porMunicipio] = await Promise.all([
                this.dashboardService.obtenerKpis(),
                this.dashboardService.obtenerViajesActivos(),
                this.dashboardService.obtenerFacturasPendientes(),
                this.dashboardService.obtenerFacturasPorMunicipio(),
            ]);

            this.facturasPendientes.set(
                facturas.map((f) => ({
                    lat: f.lat!,
                    lng: f.lng!,
                    titulo: f.nombreCliente,
                    detalle: `Factura ${f.numeroFactura} — $${f.totalUSD.toFixed(2)}`,
                })),
            );

            if (this.mapaListo) this.dibujarFacturasPendientes();

            this.kpis.set([
                {
                    label: 'Guías Pendientes',
                    value: kpis.guiasPendientes,
                    icon: 'pi pi-file',
                    color: '#3b82f6',
                },
                {
                    label: 'Choferes Activos',
                    value: kpis.choferesActivos,
                    icon: 'pi pi-users',
                    color: '#f59e0b',
                },
                {
                    label: 'Vehículos Operativos',
                    value: kpis.vehiculosOperativos,
                    icon: 'pi pi-truck',
                    color: '#10b981',
                },
                {
                    label: 'Monto Pendiente (USD)',
                    value: kpis.montoPendienteUSD,
                    icon: 'pi pi-dollar',
                    color: '#8b5cf6',
                },
            ]);

            this.viajesActivos.set(viajes);

            this.initChart(porMunicipio);
        } catch (err) {
            console.error('Error al cargar dashboard', err);
        } finally {
            this.loading.set(false);
        }
    }

    ngOnDestroy() {
        this.markers.forEach((m) => (m.map = null));
        this.markers = [];
        this.infoWindows = [];
        if (this.mapa) {
            google.maps.event.clearInstanceListeners(this.mapa);
            this.mapa = undefined!;
        }
    }

    private initMap() {
        const el = this.mapaEl()?.nativeElement;
        if (!el) return;
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
                content: `<div class="text-sm"><strong>${f.titulo}</strong><br>${f.detalle}</div>`,
            });
            marker.addListener('gmp-click', () => info.open(this.mapa, marker));
            this.markers.push(marker);
            this.infoWindows.push(info);
        }
    }

    private initChart(porMunicipio: { label: string; cantidad: number }[]) {
        const documentStyle = getComputedStyle(document.documentElement);
        const textColor = documentStyle.getPropertyValue('--text-color');
        const textColorSecondary = documentStyle.getPropertyValue('--text-color-secondary');
        const surfaceBorder = documentStyle.getPropertyValue('--surface-border');

        this.municipioData.set({
            labels: porMunicipio.map((m) => m.label),
            datasets: [
                {
                    label: 'Guías pendientes',
                    backgroundColor: '#3b82f6',
                    borderColor: '#3b82f6',
                    data: porMunicipio.map((m) => m.cantidad),
                },
            ],
        });
        this.municipioOptions.set({
            plugins: {
                legend: { labels: { color: textColor } },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: textColorSecondary },
                    grid: { color: surfaceBorder },
                },
                x: {
                    ticks: { color: textColorSecondary },
                    grid: { color: surfaceBorder },
                },
            },
        });
    }

    irAViajes() {
        this.router.navigate(['/app/rutas/optimizacion']);
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
}
