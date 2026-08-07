import { Component, OnInit, signal, computed, inject, ElementRef, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { AvatarModule } from 'primeng/avatar';
import { TagModule } from 'primeng/tag';
import { BadgeModule } from 'primeng/badge';
import { DividerModule } from 'primeng/divider';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { SelectModule } from 'primeng/select';

import { FirmaDialogComponent } from './components/firma-dialog/firma-dialog.component';
import { AuthService } from '../../../auth/service/auth.service';
import { ViajeService } from '@/app/services/viaje.service';
import { ViajeChofer } from '@/app/services/viaje.types';
import {
    GoogleMapsOptimizationService,
    Waypoint,
} from '../../../admin/pages/map/map/google-maps-optimization.service';
import { environment } from '@/environments/environment';

interface ParadaDisplay {
    id: string;
    ordenVisita: number;
    numeroGuia: string;
    nombreCliente: string;
    cliente: string;
    direccionEntrega: string;
    estado: string;
    pesoKg: number;
    precioCarga: number;
    municipio: string;
    rifCliente: string;
    observaciones?: string;
    latitud?: number | null;
    longitud?: number | null;
    eventos: any[];
    fechaLlegadaCliente?: string;
    fechaRegreso?: string;
}

interface DriverSession {
    id: string;
    nombre: string;
    documento: string;
    telefono: string;
    vehiculo: {
        id: string;
        placa: string;
        marca: string;
        modelo: string;
        anio: number;
        tipo: string;
    } | null;
    ruta: {
        codigo: string;
        fecha: string;
    } | null;
}

@Component({
    selector: 'app-mi-ruta',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        CardModule,
        AvatarModule,
        TagModule,
        BadgeModule,
        DividerModule,
        ToastModule,
        TooltipModule,
        SelectModule,
        FirmaDialogComponent,
    ],
    providers: [MessageService],
    templateUrl: './mi-ruta.component.html',
    styleUrl: './mi-ruta.component.css',
})
export class MiRutaComponent implements OnInit {
    private messageService = inject(MessageService);
    private authService = inject(AuthService);
    private viajeService = inject(ViajeService);
    private googleOptimization = inject(GoogleMapsOptimizationService);

    private mapaEl = viewChild<ElementRef<HTMLDivElement>>('mapaElement');

    session = signal<DriverSession | null>(null);
    viajes = signal<ViajeChofer[]>([]);
    paradas = signal<ParadaDisplay[]>([]);
    selectedGuia = signal<ParadaDisplay | null>(null);
    reordering = signal(false);
    showCompleted = signal(false);
    activeTab = signal<'ruta' | 'mapa' | 'completadas'>('ruta');
    firmaGuia = signal<ParadaDisplay | null>(null);
    firmasMap = new Map<string, string>();
    cargando = signal(true);
    saliendo = signal(false);

    private mapa!: google.maps.Map;
    private markers: google.maps.marker.AdvancedMarkerElement[] = [];
    private routePolyline: google.maps.Polyline | null = null;

    readonly activeViaje = computed(() => this.viajes()[0] || null);

    get fechaActual(): string {
        const hoy = new Date();
        return hoy.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    get guiasPendientes(): ParadaDisplay[] {
        return this.paradas().filter((p) => p.estado !== 'FINALIZADO');
    }

    get guiasCompletadas(): ParadaDisplay[] {
        return this.paradas().filter((p) => p.estado === 'FINALIZADO');
    }

    get avance(): number {
        const total = this.paradas().length;
        if (!total) return 0;
        return Math.round((this.guiasCompletadas.length / total) * 100);
    }

    get totalPrecio(): number {
        return this.paradas().reduce((s, p) => s + p.precioCarga, 0);
    }

    get totalPeso(): number {
        return this.paradas().reduce((s, p) => s + p.pesoKg, 0);
    }

    get viajeAbierto(): boolean {
        return this.activeViaje()?.estado === 'programado';
    }

    get viajeEnProceso(): boolean {
        return this.activeViaje()?.estado === 'proceso';
    }

    async ngOnInit() {
        await this.cargarViaje();
        this.cargando.set(false);
    }

    private async cargarViaje() {
        try {
            const viajes = await this.viajeService.obtenerViajeChofer();
            this.viajes.set(viajes);

            const viaje = viajes[0];
            if (viaje) {
                this.paradas.set(
                    (viaje.paradas || [])
                        .slice()
                        .sort((a, b) => a.orden_visita - b.orden_visita)
                        .map((p) => ({
                            id: p.id_factura,
                            ordenVisita: p.orden_visita,
                            numeroGuia: p.codigo_guia || p.numero_factura,
                            nombreCliente: p.nombre_cliente || '',
                            cliente: p.nombre_cliente || '',
                            direccionEntrega: p.direccion || '',
                            estado: p.estado_factura || 'embarque',
                            pesoKg: 0,
                            precioCarga: Number(p.monto_dolares) || 0,
                            municipio: '',
                            rifCliente: '',
                            latitud: p.latitud,
                            longitud: p.longitud,
                            eventos: [],
                        })),
                );

                const user = this.authService.getCurrentUser();
                const nombre = user?.user_metadata?.['nombre_completo'] || 'Chofer';
                const cedula = user?.user_metadata?.['cedula'] ?? '';
                this.session.set({
                    id: user?.id || '',
                    nombre,
                    documento: cedula ? `V-${cedula}` : '',
                    telefono: '',
                    vehiculo: {
                        id: viaje.id_vehiculo,
                        placa: (viaje as any).placa_vehiculo || '—',
                        marca: '',
                        modelo: '',
                        anio: 0,
                        tipo: 'VEHÍCULO',
                    },
                    ruta: {
                        codigo: viaje.id_viaje.substring(0, 8).toUpperCase(),
                        fecha: viaje.fecha_viaje || new Date().toISOString().split('T')[0],
                    },
                });
            } else {
                this.paradas.set([]);
                this.session.set(null);
            }

            if (this.activeViaje()?.estado === 'proceso') {
                setTimeout(() => this.mostrarRutaEnMapa(), 100);
            }
        } catch (err) {
            console.error('Error al cargar viaje', err);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudo cargar tu viaje.',
            });
        }
    }

    async salir() {
        const viaje = this.activeViaje();
        if (!viaje || !this.viajeAbierto) return;

        const conCoords = this.paradas().filter((p) => p.latitud != null && p.longitud != null);
        if (conCoords.length < 1) {
            this.messageService.add({
                severity: 'warn',
                summary: 'Sin coordenadas',
                detail: 'Las paradas no tienen ubicación para calcular la ruta.',
            });
            return;
        }

        this.saliendo.set(true);
        try {
            const waypoints: Waypoint[] = conCoords.map((p) => ({
                lat: p.latitud!,
                lng: p.longitud!,
                name: `${p.nombreCliente} - ${p.numeroGuia}`,
            }));
            const warehouse: Waypoint = {
                lat: environment.warehouseLat,
                lng: environment.warehouseLng,
                name: 'Almacén',
            };

            const result = await this.googleOptimization.optimize(waypoints, warehouse, warehouse);
            const orderedIds = result
                ? result.order.map((idx) => conCoords[idx].id)
                : conCoords.map((p) => p.id);

            await this.viajeService.iniciarViaje(viaje.id_viaje, orderedIds);
            await this.cargarViaje();

            this.messageService.add({
                severity: 'success',
                summary: 'Viaje iniciado',
                detail: 'Las facturas pasaron a proceso y la ruta fue optimizada.',
            });
            this.cambiarTab('mapa');
        } catch (err) {
            console.error('Error al iniciar viaje', err);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudo iniciar el viaje. Intenta nuevamente.',
            });
        } finally {
            this.saliendo.set(false);
        }
    }

    private mostrarRutaEnMapa() {
        this.initMapa();
        if (!this.mapa) return;

        this.limpiarRuta();

        const paradas = this.paradas()
            .filter((p) => p.latitud != null && p.longitud != null)
            .sort((a, b) => a.ordenVisita - b.ordenVisita);

        if (paradas.length < 1) return;

        const waypoints: Waypoint[] = paradas.map((p) => ({
            lat: p.latitud!,
            lng: p.longitud!,
            name: `${p.nombreCliente} - ${p.numeroGuia}`,
        }));
        const warehouse: Waypoint = {
            lat: environment.warehouseLat,
            lng: environment.warehouseLng,
            name: 'Almacén',
        };

        this.googleOptimization.computeRoute(waypoints, warehouse, warehouse).then((result) => {
            if (!result || !this.mapa) return;
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
            result.order.forEach((idx, i) => this.agregarMarcadorEntrega(i, waypoints[idx]));
        });
    }

    private initMapa() {
        if (this.mapa || !this.mapaEl()) return;
        const el = this.mapaEl()!.nativeElement;
        if (!el || el.clientHeight === 0) return;
        this.mapa = new google.maps.Map(el, {
            center: { lat: environment.warehouseLat, lng: environment.warehouseLng },
            zoom: 10,
            mapId: 'mi-ruta-chofer',
        });
    }

    private limpiarRuta() {
        this.markers.forEach((m) => (m.map = null));
        this.markers = [];
        if (this.routePolyline) {
            this.routePolyline.setMap(null);
            this.routePolyline = null;
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
        this.markers.push(marker);
    }

    getEstadoLabel(estado: string): string {
        switch (estado) {
            case 'embarque':
                return 'Embarque';
            case 'proceso':
                return 'En proceso';
            case 'finalizado':
            case 'FINALIZADO':
                return 'Finalizado';
            case 'incidencia':
                return 'Incidencia';
            default:
                return estado;
        }
    }

    getEstadoSeverity(
        estado: string,
    ): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
        switch (estado) {
            case 'embarque':
                return 'info';
            case 'proceso':
                return 'warn';
            case 'finalizado':
            case 'FINALIZADO':
                return 'success';
            case 'incidencia':
                return 'danger';
            default:
                return 'secondary';
        }
    }

    toggleGuia(guia: ParadaDisplay) {
        if (this.selectedGuia()?.id === guia.id) {
            this.selectedGuia.set(null);
        } else {
            this.selectedGuia.set(guia);
        }
    }

    abrirFirma(guia: ParadaDisplay) {
        this.firmaGuia.set(guia);
    }

    onFirmaConfirmada(event: { firma: string; observaciones: string }) {
        const guia = this.firmaGuia();
        if (!guia) return;

        this.firmasMap.set(guia.id, event.firma);

        const updated = this.paradas().map((p) => {
            if (p.id === guia.id) {
                const ahora = new Date();
                const fecha = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
                const hora = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
                return {
                    ...p,
                    estado: 'FINALIZADO' as const,
                    fechaLlegadaCliente: `${fecha} ${hora}`,
                    fechaRegreso: `${fecha} ${hora}`,
                    observaciones: event.observaciones || p.observaciones,
                    eventos: [
                        ...p.eventos,
                        {
                            id: `ev-${Date.now()}`,
                            idGuia: p.id,
                            tipo: 'LLEGADA_CLIENTE' as const,
                            fecha: `${fecha} ${hora}`,
                            descripcion: 'Entrega completada con firma digital',
                        },
                        {
                            id: `ev-${Date.now() + 1}`,
                            idGuia: p.id,
                            tipo: 'REGRESO_BASE' as const,
                            fecha: `${fecha} ${hora}`,
                            descripcion: 'Regreso a base',
                        },
                    ],
                };
            }
            return p;
        });

        this.paradas.set(updated);
        this.firmaGuia.set(null);
        this.messageService.add({
            severity: 'success',
            summary: 'Entrega completada',
            detail: `${guia.nombreCliente} — ${guia.numeroGuia}`,
        });
    }

    onFirmaCancelada() {
        this.firmaGuia.set(null);
    }

    moverGuia(index: number, direction: number) {
        const pendientes = [...this.guiasPendientes];
        const completadas = this.guiasCompletadas;
        const target = index + direction;
        if (target < 0 || target >= pendientes.length) return;
        [pendientes[index], pendientes[target]] = [pendientes[target], pendientes[index]];
        this.paradas.set([...pendientes, ...completadas]);
    }

    toggleReordering() {
        this.reordering.update((v) => !v);
    }

    cambiarTab(tab: 'ruta' | 'mapa' | 'completadas') {
        this.activeTab.set(tab);
        if (tab === 'mapa') {
            setTimeout(() => {
                this.initMapa();
                if (this.viajeEnProceso) this.mostrarRutaEnMapa();
            }, 100);
        }
    }

    getColorBorde(estado: string): string {
        switch (estado) {
            case 'proceso':
                return 'border-l-blue-500';
            case 'embarque':
                return 'border-l-yellow-500';
            case 'FINALIZADO':
            case 'finalizado':
                return 'border-l-green-500';
            case 'incidencia':
                return 'border-l-red-500';
            default:
                return 'border-l-surface-300';
        }
    }

    tieneFirma(guiaId: string): boolean {
        return this.firmasMap.has(guiaId);
    }
}
