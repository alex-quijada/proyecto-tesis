import { Component, OnInit, OnDestroy, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { BadgeModule } from 'primeng/badge';
import { ToastModule } from 'primeng/toast';
import { AvatarModule } from 'primeng/avatar';
import { TooltipModule } from 'primeng/tooltip';
import { DividerModule } from 'primeng/divider';
import { RippleModule } from 'primeng/ripple';

import { AuthService } from '../../../auth/service/auth.service';
import { FirmaDialogComponent } from '../mi-ruta/components/firma-dialog/firma-dialog.component';
import { ESTADOS_FACTURA } from '../../../admin/pages/rutas/data/rutas-mock';
import { ChoferService, ChoferGuia, ChoferVehiculo } from '../../services/chofer.service';

interface Incidencia {
    tipo: string;
    numeroGuia: string;
    descripcion: string;
    horaReporte: string;
    foto?: string;
}

interface Entrega {
    id: string;
    idGuia: string;
    numeroGuia: string;
    numeroFactura: string;
    empresaSuministro: string;
    cliente: string;
    ruta: string;
    direccion: string;
    rif: string;
    precioCarga: number;
    estado: string;
    observaciones?: string;
    tuvoDevolucion: boolean;
    eventos: any[];
    incidencia?: Incidencia;
    fechaEntrega?: string;
    latitud?: number;
    longitud?: number;
}

interface DriverInfo {
    nombre: string;
    documento: string;
    telefono: string;
    email: string;
    vehiculos: {
        id: string;
        placa: string;
        marca: string;
        modelo: string;
        anio: number;
        tipo: string;
    }[];
    licencia?: { numero: string; grado: string; fechaVencimiento: string };
    certificadoMedico?: { numero: string; fechaExpedicion: string; fechaVencimiento: string };
    fechaIngreso?: string;
}

const ORDEN_MUNICIPIOS: Record<string, number> = {
    PENINSULA_DE_MACANAO: 1,
    TUBORES: 2,
    DIAZ: 3,
    GARCIA: 4,
    ARISMENDI: 5,
    GOMEZ: 6,
    MANEIRO: 7,
    MARINO: 8,
    MARCANO: 9,
    ANTOLIN_DEL_CAMPO: 10,
    VILLALBA: 11,
};

function normalizarMunicipio(nombre: string): string {
    return nombre
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_');
}

@Component({
    selector: 'app-home-page',
    standalone: true,
    imports: [
        CommonModule,
        ButtonModule,
        CardModule,
        TagModule,
        BadgeModule,
        ToastModule,
        AvatarModule,
        TooltipModule,
        DividerModule,
        RippleModule,
        FirmaDialogComponent,
    ],
    providers: [MessageService],
    templateUrl: './home-page.html',
    styleUrl: './home-page.css',
})
export class HomePage implements OnInit, OnDestroy {
    private authService = inject(AuthService);
    private choferService = inject(ChoferService);
    private messageService = inject(MessageService);
    private router = inject(Router);

    activeTab = signal<'inicio' | 'ruta' | 'historial' | 'perfil'>('inicio');

    driverInfo = signal<DriverInfo | null>(null);
    guiasAsignadas = signal<Entrega[]>([]);
    selectedGuia = signal<Entrega | null>(null);
    selectedHistory = signal<Entrega | null>(null);
    guiaActivaExpandida = signal<string | null>(null);
    firmaGuia = signal<Entrega | null>(null);
    firmasMap = new Map<string, string>();
    historialFiltro = signal<'todas' | 'finalizadas' | 'canceladas' | 'incidencias'>('todas');
    municipioFiltro = signal<string>('todas');

    now = signal(new Date());
    private guiaStartTimes = new Map<string, Date>();
    private timerId: ReturnType<typeof setInterval> | null = null;

    get guiasPendientes(): Entrega[] {
        return this.guiasAsignadas().filter(
            (g) => g.estado !== 'finalizado' && g.estado !== 'cancelado',
        );
    }

    get guiasCompletadas(): Entrega[] {
        return this.guiasAsignadas().filter(
            (g) => g.estado === 'finalizado' || g.estado === 'cancelado',
        );
    }

    get municipiosDisponibles(): string[] {
        const municipios = new Set(this.guiasCompletadas.map((g) => g.ruta));
        return ['todas', ...Array.from(municipios).sort()];
    }

    get historialReciente(): Entrega[] {
        return this.guiasCompletadas.slice(0, 5);
    }

    get historialFiltradas(): Entrega[] {
        const f = this.historialFiltro();
        const m = this.municipioFiltro();
        let lista = this.guiasCompletadas;
        if (m !== 'todas') lista = lista.filter((g) => g.ruta === m);
        switch (f) {
            case 'finalizadas':
                lista = lista.filter((g) => g.estado === 'finalizado');
                break;
            case 'canceladas':
                lista = lista.filter((g) => g.estado === 'cancelado');
                break;
            case 'incidencias':
                lista = lista.filter(
                    (g) => g.incidencia !== undefined || g.tuvoDevolucion || !!g.observaciones,
                );
                break;
        }
        return [...lista].reverse();
    }

    pendingCount = computed(() => this.guiasPendientes.length);
    completedCount = computed(() => this.guiasCompletadas.length);

    async ngOnInit() {
        await this.authService.waitForInitialization();
        const user = this.authService.getCurrentUser();
        if (!user) return;

        try {
            const [guias, choferes, vehiculos] = await Promise.all([
                this.choferService.obtenerGuias(),
                this.choferService.obtenerChoferes(),
                this.choferService.obtenerVehiculos(),
            ]);

            const miChofer = choferes.find((ch: any) => ch.id === user.id) || choferes[0];
            const nombreCompleto =
                user.user_metadata?.['nombre_completo'] || miChofer?.nombreCompleto || 'Chofer';

            const vehiculosChofer = this.mapearVehiculos(guias, vehiculos);

            this.guiasAsignadas.set(this.mapearEntregas(guias));
            this.driverInfo.set({
                nombre: nombreCompleto,
                documento: `${miChofer?.documentoIdentidad?.prefijo || user.user_metadata?.['prefijo_doc'] || 'V'}-${
                    miChofer?.documentoIdentidad?.numero || user.user_metadata?.['cedula'] || ''
                }`,
                telefono: miChofer?.telefono || '',
                email: user.email || '',
                vehiculos: vehiculosChofer,
                licencia: miChofer?.licencia,
                certificadoMedico: miChofer?.certificadoMedico,
                fechaIngreso: miChofer?.fechaIngreso,
            });
        } catch (err) {
            console.error('Error cargando datos del chofer:', err);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudieron cargar tus guías. Intenta de nuevo.',
            });
        }

        this.initTimer();
        this.initGuiaStartTimes();
    }

    ngOnDestroy() {
        if (this.timerId) clearInterval(this.timerId);
    }

    private mapearEntregas(guias: ChoferGuia[]): Entrega[] {
        const entregas: Entrega[] = [];
        for (const guia of guias) {
            const municipio = guia.nombre_municipio || guia.id_municipio || '';
            for (const f of guia.facturas || []) {
                const estado = f.nombre_estado || 'nuevo';
                entregas.push({
                    id: f.id_factura,
                    idGuia: guia.id_guia,
                    numeroGuia: guia.codigo_guia || guia.id_guia.substring(0, 8).toUpperCase(),
                    numeroFactura: f.numero_factura || '',
                    empresaSuministro: guia.nombre_empresa || '',
                    cliente: f.nombre_cliente || 'Sin cliente',
                    ruta: municipio,
                    direccion: f.direccion_sucursal || '',
                    rif: f.rif_cliente || '',
                    precioCarga: Number(f.monto_dolares) || 0,
                    estado,
                    observaciones: guia.observaciones || undefined,
                    tuvoDevolucion: false,
                    eventos: [],
                    fechaEntrega: estado === 'finalizado' ? guia.fecha_despacho : undefined,
                    incidencia:
                        estado === 'incidencia'
                            ? {
                                  tipo: 'Incidencia',
                                  numeroGuia: guia.codigo_guia || '',
                                  descripcion:
                                      guia.observaciones ||
                                      'Se reportó una incidencia en la entrega',
                                  horaReporte: '',
                              }
                            : undefined,
                    latitud: f.latitud ?? undefined,
                    longitud: f.longitud ?? undefined,
                });
            }
        }

        entregas.sort((a, b) => {
            const estadoA = a.estado === 'finalizado' ? 1 : 0;
            const estadoB = b.estado === 'finalizado' ? 1 : 0;
            if (estadoA !== estadoB) return estadoA - estadoB;
            const rA = ORDEN_MUNICIPIOS[normalizarMunicipio(a.ruta)] ?? 99;
            const rB = ORDEN_MUNICIPIOS[normalizarMunicipio(b.ruta)] ?? 99;
            if (rA !== rB) return rA - rB;
            return (a.numeroFactura || '').localeCompare(b.numeroFactura || '');
        });

        return entregas;
    }

    private mapearVehiculos(
        guias: ChoferGuia[],
        vehiculos: ChoferVehiculo[],
    ): DriverInfo['vehiculos'] {
        const vehiculoMap = new Map(vehiculos.map((v) => [v.id_vehiculo, v]));
        const ids = [...new Set(guias.map((g) => g.id_vehiculo).filter(Boolean))];

        return ids
            .map((id) => {
                const detalle = vehiculoMap.get(id!);
                const deGuia = guias.find((g) => g.id_vehiculo === id);
                return {
                    id: id!,
                    placa: detalle?.placa || deGuia?.placa_vehiculo || '',
                    marca: detalle?.marca || deGuia?.marca_vehiculo || '',
                    modelo: detalle?.modelo || deGuia?.modelo_vehiculo || '',
                    anio: detalle?.anio || 0,
                    tipo: detalle?.tipo_nombre || '',
                };
            })
            .filter((v) => !!v.placa);
    }

    private async recargarGuias() {
        const guias = await this.choferService.obtenerGuias();
        this.guiasAsignadas.set(this.mapearEntregas(guias));
        this.initGuiaStartTimes();
    }

    private initTimer() {
        this.timerId = setInterval(() => this.now.set(new Date()), 30000);
    }

    private initGuiaStartTimes() {
        this.guiaStartTimes.clear();
        this.guiasPendientes.forEach((g, i) => {
            this.guiaStartTimes.set(g.id, new Date(Date.now() - (7 + i * 12) * 60000));
        });
    }

    getTiempoCarga(guiaId: string): string {
        const start = this.guiaStartTimes.get(guiaId);
        if (!start) return 'Pendiente';
        const mins = Math.floor((this.now().getTime() - start.getTime()) / 60000);
        if (mins < 1) return 'Menos de 1 min';
        return `${mins} mins subiendo mercancía`;
    }

    cambiarTab(tab: 'inicio' | 'ruta' | 'historial' | 'perfil') {
        this.activeTab.set(tab);
    }
    irAPerfil() {
        this.activeTab.set('perfil');
    }

    setHistorialFiltro(f: string) {
        this.historialFiltro.set(f as any);
        this.selectedHistory.set(null);
    }

    setMunicipioFiltro(m: string) {
        this.municipioFiltro.set(m);
        this.selectedHistory.set(null);
    }

    toggleGuiaActiva(id: string) {
        this.guiaActivaExpandida.set(this.guiaActivaExpandida() === id ? null : id);
    }
    toggleSelectedGuia(g: Entrega) {
        this.selectedGuia.set(this.selectedGuia()?.id === g.id ? null : g);
    }
    toggleHistory(g: Entrega) {
        this.selectedHistory.set(this.selectedHistory()?.id === g.id ? null : g);
    }
    abrirFirma(entrega: Entrega) {
        this.firmaGuia.set(entrega);
    }

    async onFirmaConfirmada(event: { firma: string; observaciones: string }) {
        const entrega = this.firmaGuia();
        if (!entrega) return;

        try {
            await this.choferService.finalizarEntrega(entrega.id, event.observaciones || null);
            this.firmasMap.set(entrega.id, event.firma);

            const hoy = this.fechaHoy();
            this.guiasAsignadas.update((list) =>
                list.map((g) =>
                    g.id === entrega.id
                        ? {
                              ...g,
                              estado: 'finalizado',
                              fechaEntrega: hoy,
                              observaciones: event.observaciones || g.observaciones,
                          }
                        : g,
                ),
            );

            this.guiaActivaExpandida.set(null);
            this.messageService.add({
                severity: 'success',
                summary: 'Entrega completada',
                detail: `${entrega.cliente} — ${entrega.numeroFactura || entrega.numeroGuia}`,
            });

            await this.recargarGuias();
        } catch (err: any) {
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: err?.message || 'No se pudo guardar la entrega.',
            });
        } finally {
            this.firmaGuia.set(null);
        }
    }

    onFirmaCancelada() {
        this.firmaGuia.set(null);
    }
    tieneFirma(id: string) {
        return this.firmasMap.has(id);
    }

    getEstadoLabel(e: string): string {
        if (e === 'cancelado' || e === 'CANCELADO') return 'Cancelado';
        const found = ESTADOS_FACTURA.find((ef) => ef.value === e);
        return found?.label || e;
    }

    getEstadoSeverity(
        e: string,
    ): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
        if (e === 'cancelado' || e === 'CANCELADO') return 'danger';
        const found = ESTADOS_FACTURA.find((ef) => ef.value === e);
        return (found?.severity as any) || 'info';
    }

    getColorBorde(e: string): string {
        switch (e) {
            case 'nuevo':
                return 'border-l-surface-300';
            case 'embarque':
                return 'border-l-yellow-500';
            case 'proceso':
                return 'border-l-blue-500';
            case 'espera':
                return 'border-l-orange-500';
            case 'incidencia':
                return 'border-l-red-500';
            case 'finalizado':
                return 'border-l-green-500';
            default:
                return 'border-l-surface-300';
        }
    }

    logout() {
        this.authService.logout();
    }

    get fechaActual(): string {
        return new Date().toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
    }

    private fechaHoy(): string {
        const a = new Date();
        return `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}-${String(
            a.getDate(),
        ).padStart(2, '0')}`;
    }

    vehiculoPrincipal() {
        const v = this.driverInfo()?.vehiculos;
        return v && v.length > 0 ? v[0] : null;
    }
}
