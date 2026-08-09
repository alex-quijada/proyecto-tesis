import { Injectable, OnDestroy, inject, signal, computed } from '@angular/core';
import { MessageService } from 'primeng/api';

import { AuthService } from '@/app/auth/service/auth.service';
import { ESTADOS_FACTURA } from '@/app/admin/pages/rutas/data/rutas-mock';
import { Chofer } from '@/app/admin/pages/choferes/data/choferes-mock';
import { ChoferService, ChoferGuia, ChoferVehiculo } from './chofer.service';

export interface Incidencia {
    tipo: string;
    numeroGuia: string;
    descripcion: string;
    horaReporte: string;
    foto?: string;
}

export interface Entrega {
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

export interface DriverInfo {
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
    licencia?: {
        numero: string;
        grado: string;
        fechaExpedicion?: string;
        fechaVencimiento: string;
    };
    certificadoMedico?: { numero: string; fechaExpedicion: string; fechaVencimiento: string };
    fechaIngreso?: string;
}

export interface GuiaPendiente {
    id: string;
    numeroGuia: string;
    empresaSuministro: string;
    ruta: string;
    observaciones?: string;
    facturas: Entrega[];
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

@Injectable()
export class DriverStoreService implements OnDestroy {
    private authService = inject(AuthService);
    private choferService = inject(ChoferService);
    private messageService = inject(MessageService);

    readonly driverInfo = signal<DriverInfo | null>(null);
    readonly guiasAsignadas = signal<Entrega[]>([]);
    readonly firmasMap = new Map<string, string>();

    readonly now = signal(new Date());
    private guiaStartTimes = new Map<string, Date>();
    private timerId: ReturnType<typeof setInterval> | null = null;

    readonly guiasPendientes = computed(() =>
        this.guiasAsignadas().filter((g) => g.estado !== 'finalizado' && g.estado !== 'cancelado'),
    );

    readonly guiasCompletadas = computed(() =>
        this.guiasAsignadas().filter((g) => g.estado === 'finalizado' || g.estado === 'cancelado'),
    );

    readonly municipiosDisponibles = computed(() => {
        const municipios = new Set(this.guiasCompletadas().map((g) => g.ruta));
        return ['todas', ...Array.from(municipios).sort()];
    });

    readonly historialReciente = computed(() => this.guiasCompletadas().slice(0, 5));

    readonly pendingCount = computed(() => this.guiasPendientes().length);
    readonly completedCount = computed(() => this.guiasCompletadas().length);

    readonly guiasPendientesAgrupadas = computed<GuiaPendiente[]>(() => {
        const mapa = new Map<string, GuiaPendiente>();
        for (const g of this.guiasPendientes()) {
            let grupo = mapa.get(g.idGuia);
            if (!grupo) {
                grupo = {
                    id: g.idGuia,
                    numeroGuia: g.numeroGuia,
                    empresaSuministro: g.empresaSuministro,
                    ruta: g.ruta,
                    observaciones: g.observaciones,
                    facturas: [],
                };
                mapa.set(g.idGuia, grupo);
            }
            grupo.facturas.push(g);
        }
        return Array.from(mapa.values());
    });

    readonly pendingGuiasCount = computed(() => this.guiasPendientesAgrupadas().length);

    async cargarDatos() {
        await this.authService.waitForInitialization();
        const user = this.authService.getCurrentUser();
        if (!user) return;

        const setDriverInfo = (chofer?: Chofer) => {
            const nombreCompleto =
                user.user_metadata?.['nombre_completo'] || chofer?.nombreCompleto || 'Chofer';
            const prefijo =
                user.user_metadata?.['prefijo_doc'] || chofer?.documentoIdentidad?.prefijo || 'V';
            const cedula =
                user.user_metadata?.['cedula'] ?? chofer?.documentoIdentidad?.numero ?? '';

            this.driverInfo.set({
                nombre: nombreCompleto,
                documento: `${prefijo}-${cedula}`,
                telefono: chofer?.telefono || user.user_metadata?.['telefono'] || '',
                email: user.email || chofer?.email || '',
                vehiculos: this.driverInfo()?.vehiculos || [],
                licencia: chofer?.licencia,
                certificadoMedico: chofer?.certificadoMedico,
                fechaIngreso: chofer?.fechaIngreso || user.user_metadata?.['fechaIngreso'] || '',
            });
        };

        setDriverInfo();

        let choferes: Chofer[] = [];
        try {
            choferes = await this.choferService.obtenerChoferes();
            setDriverInfo(choferes.find((ch: any) => ch.id === user.id));
        } catch (err) {
            console.error('Error cargando perfil del chofer:', err);
        }

        try {
            const guias = await this.choferService.obtenerGuias();
            const vehiculos = await this.choferService.obtenerVehiculos().catch((e) => {
                console.error('Error cargando vehículos:', e);
                return [] as ChoferVehiculo[];
            });
            this.driverInfo.update((info) => ({
                ...(info || this.driverInfo()!),
                vehiculos: this.mapearVehiculos(guias, vehiculos),
            }));
            this.guiasAsignadas.set(this.mapearEntregas(guias));
            this.initGuiaStartTimes();
        } catch (err) {
            console.error('Error cargando guías del chofer:', err);
            this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudieron cargar tus guías. Intenta de nuevo.',
            });
        }

        this.initTimer();
    }

    ngOnDestroy() {
        if (this.timerId) clearInterval(this.timerId);
    }

    async recargarGuias() {
        const guias = await this.choferService.obtenerGuias();
        this.guiasAsignadas.set(this.mapearEntregas(guias));
        this.initGuiaStartTimes();
    }

    private initTimer() {
        this.timerId = setInterval(() => this.now.set(new Date()), 30000);
    }

    private initGuiaStartTimes() {
        this.guiaStartTimes.clear();
        this.guiasPendientes().forEach((g, i) => {
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

    vehiculoPrincipal() {
        const v = this.driverInfo()?.vehiculos;
        return v && v.length > 0 ? v[0] : null;
    }

    tieneFirma(id: string): boolean {
        return this.firmasMap.has(id);
    }

    async finalizarEntrega(entrega: Entrega, firma: string, observaciones: string) {
        await this.choferService.finalizarEntrega(entrega.id, observaciones || null);
        this.firmasMap.set(entrega.id, firma);

        const hoy = this.fechaHoy();
        this.guiasAsignadas.update((list) =>
            list.map((g) =>
                g.id === entrega.id
                    ? {
                          ...g,
                          estado: 'finalizado',
                          fechaEntrega: hoy,
                          observaciones: observaciones || g.observaciones,
                      }
                    : g,
            ),
        );

        await this.recargarGuias();
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
}
