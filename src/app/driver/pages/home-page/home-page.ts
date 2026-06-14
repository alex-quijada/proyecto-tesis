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
import { GUIAS_MOCK, ESTADOS_GUIA } from '../../../admin/pages/rutas/data/rutas-mock';
import { CHOFERES_MOCK } from '../../../admin/pages/choferes/data/choferes-mock';
import { VEHICULOS_MOCK } from '../../../admin/pages/vehiculos/data/vehiculos-mock';

interface Incidencia {
    tipo: string;
    numeroGuia: string;
    descripcion: string;
    horaReporte: string;
    foto?: string;
}

interface GuiaDisplay {
    id: string;
    numeroGuia: string;
    empresaSuministro: string;
    cliente: string;
    ruta: string;
    direccion: string;
    rif: string;
    pesoKg: number;
    precioCarga: number;
    estado: string;
    observaciones?: string;
    tuvoDevolucion: boolean;
    eventos: any[];
    incidencia?: Incidencia;
    fechaEntrega?: string;
}

interface DriverInfo {
    nombre: string;
    documento: string;
    telefono: string;
    email: string;
    vehiculos: {
        id: string; placa: string; marca: string; modelo: string; anio: number; tipo: string;
    }[];
    licencia?: { numero: string; grado: string; fechaVencimiento: string; };
    certificadoMedico?: { numero: string; fechaExpedicion: string; fechaVencimiento: string; };
    fechaIngreso?: string;
}

const EMPRESAS_SUMINISTRO: Record<string, string> = {
    'g-1': 'Angelo', 'g-2': 'Metropol', 'g-3': 'Metropol', 'g-4': 'Guaao', 'g-5': 'Angelo',
    'h-6': 'Angelo', 'h-7': 'Metropol', 'h-8': 'Guaao', 'h-9': 'Angelo', 'h-10': 'Metropol',
};

const CLIENTES_MOCK: Record<string, string> = {
    'g-1': 'Distribuidora Polar C.A.', 'g-2': 'Cervecería Regional C.A.',
    'g-3': 'Supermercado Central Madeirense', 'g-4': 'Farmatodo S.A.', 'g-5': "Automercado Plaza's",
    'h-6': 'Pan de París', 'h-7': 'El fogón de los muchachos',
    'h-8': 'Licorería El Barril', 'h-9': 'La Fe C.A.', 'h-10': 'Restaurant El Puerto',
};

const FECHAS_ENTREGA: Record<string, string> = {
    'g-1': '2026-06-02', 'g-4': '2026-05-29',
    'h-6': '2026-06-08', 'h-7': '2026-06-10',
    'h-8': '2026-06-09', 'h-9': '2026-06-07', 'h-10': '2026-06-11',
};

const EXTRA_HISTORY: GuiaDisplay[] = [
    {
        id: 'h-6', numeroGuia: 'G-2026-0006',
        empresaSuministro: 'Angelo', cliente: 'Pan de París',
        ruta: 'Maneiro', direccion: 'Calle 5, Sector Centro, Porlamar',
        rif: 'J-111223344', pesoKg: 120, precioCarga: 350,
        estado: 'CANCELADO', tuvoDevolucion: false, eventos: [],
        observaciones: 'Cliente no disponible - se reprogramó entrega',
        fechaEntrega: '2026-06-08',
    },
    {
        id: 'h-7', numeroGuia: 'G-2026-0007',
        empresaSuministro: 'Metropol', cliente: 'El fogón de los muchachos',
        ruta: 'Mariño', direccion: 'Av. Aldonza, Local 3, Porlamar',
        rif: 'J-998877665', pesoKg: 200, precioCarga: 258,
        estado: 'FINALIZADO', tuvoDevolucion: true, eventos: [],
        incidencia: {
            tipo: 'Devolución parcial', numeroGuia: 'G-2026-0007',
            descripcion: 'Se recibieron 2 cajas dañadas de las 5 enviadas. Se procedió a devolución parcial.',
            horaReporte: '2026-06-10 14:30',
        },
        fechaEntrega: '2026-06-10',
    },
    {
        id: 'h-8', numeroGuia: 'G-2026-0008',
        empresaSuministro: 'Guaao', cliente: 'Licorería El Barril',
        ruta: 'Mariño', direccion: 'CC Sigo, Nivel PB, Local 8',
        rif: 'J-554433221', pesoKg: 450, precioCarga: 1200,
        estado: 'FINALIZADO', tuvoDevolucion: false, eventos: [],
        fechaEntrega: '2026-06-09',
    },
    {
        id: 'h-9', numeroGuia: 'G-2026-0009',
        empresaSuministro: 'Angelo', cliente: 'La Fe C.A.',
        ruta: 'García', direccion: 'Zona Industrial, Calle 3, El Valle',
        rif: 'J-776655443', pesoKg: 3200, precioCarga: 5600,
        estado: 'CANCELADO', tuvoDevolucion: false, eventos: [],
        observaciones: 'Cancelado por condiciones climáticas',
        fechaEntrega: '2026-06-07',
    },
    {
        id: 'h-10', numeroGuia: 'G-2026-0010',
        empresaSuministro: 'Metropol', cliente: 'Restaurant El Puerto',
        ruta: 'Peninsula de Macanao', direccion: 'Vía Playa El Ángel, Sector Boca de Pozo',
        rif: 'J-332211445', pesoKg: 85, precioCarga: 180,
        estado: 'FINALIZADO', tuvoDevolucion: true, eventos: [],
        incidencia: {
            tipo: 'Mercancía faltante', numeroGuia: 'G-2026-0010',
            descripcion: 'Faltaron 3 kg de productos del mar según factura. Se reportó al supervisor.',
            horaReporte: '2026-06-11 11:45',
        },
        fechaEntrega: '2026-06-11',
    },
];

const ORDEN_MUNICIPIOS: Record<string, number> = {
    PENINSULA_DE_MACANAO: 1, TUBORES: 2, DIAZ: 3, GARCIA: 4,
    ARISMENDI: 5, GOMEZ: 6, MANEIRO: 7, MARINO: 8,
    MARCANO: 9, ANTOLIN_DEL_CAMPO: 10, VILLALBA: 11,
};

@Component({
    selector: 'app-home-page',
    standalone: true,
    imports: [
        CommonModule, ButtonModule, CardModule, TagModule, BadgeModule,
        ToastModule, AvatarModule, TooltipModule, DividerModule, RippleModule,
        FirmaDialogComponent,
    ],
    providers: [MessageService],
    templateUrl: './home-page.html',
    styleUrl: './home-page.css',
})
export class HomePage implements OnInit, OnDestroy {
    private authService = inject(AuthService);
    private messageService = inject(MessageService);
    private router = inject(Router);

    activeTab = signal<'inicio' | 'ruta' | 'historial' | 'perfil'>('inicio');

    driverInfo = signal<DriverInfo | null>(null);
    guiasAsignadas = signal<GuiaDisplay[]>([]);
    selectedGuia = signal<GuiaDisplay | null>(null);
    selectedHistory = signal<GuiaDisplay | null>(null);
    guiaActivaExpandida = signal<string | null>(null);
    firmaGuia = signal<any | null>(null);
    firmasMap = new Map<string, string>();
    historialFiltro = signal<'todas' | 'finalizadas' | 'canceladas' | 'incidencias'>('todas');
    municipioFiltro = signal<string>('todas');

    now = signal(new Date());
    private guiaStartTimes = new Map<string, Date>();
    private timerId: ReturnType<typeof setInterval> | null = null;

    get guiasPendientes(): GuiaDisplay[] {
        return this.guiasAsignadas().filter(g => g.estado !== 'FINALIZADO' && g.estado !== 'CANCELADO');
    }

    get guiasCompletadas(): GuiaDisplay[] {
        return this.guiasAsignadas().filter(g => g.estado === 'FINALIZADO' || g.estado === 'CANCELADO');
    }

    get municipiosDisponibles(): string[] {
        const municipios = new Set(this.guiasCompletadas.map(g => g.ruta));
        return ['todas', ...Array.from(municipios).sort()];
    }

    get historialReciente(): GuiaDisplay[] {
        return this.guiasCompletadas.slice(0, 5);
    }

    get historialFiltradas(): GuiaDisplay[] {
        const f = this.historialFiltro();
        const m = this.municipioFiltro();
        let lista = this.guiasCompletadas;
        if (m !== 'todas') lista = lista.filter(g => g.ruta === m);
        switch (f) {
            case 'finalizadas': lista = lista.filter(g => g.estado === 'FINALIZADO'); break;
            case 'canceladas': lista = lista.filter(g => g.estado === 'CANCELADO'); break;
            case 'incidencias': lista = lista.filter(g => g.incidencia !== undefined || g.tuvoDevolucion || !!g.observaciones); break;
        }
        return [...lista].reverse();
    }

    pendingCount = computed(() => this.guiasPendientes.length);
    completedCount = computed(() => this.guiasCompletadas.length);

    ngOnInit() {
        const user = this.authService.getCurrentUser();
        const nombreCompleto = user?.user_metadata?.['nombre_completo'] || 'David Espinoza';
        const email = user?.email || 'chofer@example.com';

        const chofer = CHOFERES_MOCK.find((ch: any) =>
            ch.nombreCompleto?.toLowerCase().includes(nombreCompleto.toLowerCase().split(' ')[0])
        ) || CHOFERES_MOCK[0];

        const guiasDelChofer: GuiaDisplay[] = GUIAS_MOCK
            .filter((g: any) => g.idChofer === chofer.id)
            .sort((a: any, b: any) => ORDEN_MUNICIPIOS[a.municipio] - ORDEN_MUNICIPIOS[b.municipio])
            .map((g: any) => ({
                id: g.id, numeroGuia: g.numeroGuia,
                empresaSuministro: EMPRESAS_SUMINISTRO[g.id] || 'Angelo',
                cliente: CLIENTES_MOCK[g.id] || g.nombreCliente,
                ruta: g.municipio, direccion: g.direccionEntrega, rif: g.rifCliente,
                pesoKg: g.pesoKg, precioCarga: g.precioCarga,
                estado: g.estado, observaciones: g.observaciones,
                tuvoDevolucion: g.tuvoDevolucion, eventos: g.eventos || [],
                fechaEntrega: FECHAS_ENTREGA[g.id] || undefined,
            }));

        const vehiculoIds = [...new Set(guiasDelChofer.map((g: any) =>
            GUIAS_MOCK.find((mock: any) => mock.id === g.id)?.idVehiculo
        ).filter(Boolean))];

        const vehiculos = VEHICULOS_MOCK.filter((v: any) => vehiculoIds.includes(v.id));

        this.guiasAsignadas.set([...guiasDelChofer, ...EXTRA_HISTORY]);
        this.driverInfo.set({
            nombre: chofer.nombreCompleto || nombreCompleto,
            documento: `${chofer.documentoIdentidad?.prefijo || 'V'}-${chofer.documentoIdentidad?.numero || ''}`,
            telefono: chofer.telefono || '+58 000-0000000', email,
            vehiculos: vehiculos.map((v: any) => ({
                id: v.id!, placa: v.placa!, marca: v.marca!,
                modelo: v.modelo!, anio: v.anio!, tipo: v.tipo || 'CARRO',
            })),
            licencia: chofer.licencia ? {
                numero: chofer.licencia.numero, grado: chofer.licencia.grado,
                fechaVencimiento: chofer.licencia.fechaVencimiento,
            } : undefined,
            certificadoMedico: chofer.certificadoMedico ? {
                numero: chofer.certificadoMedico.numero,
                fechaExpedicion: chofer.certificadoMedico.fechaExpedicion,
                fechaVencimiento: chofer.certificadoMedico.fechaVencimiento,
            } : undefined,
            fechaIngreso: chofer.fechaIngreso,
        });

        this.initTimer();
        this.initGuiaStartTimes();
    }

    ngOnDestroy() {
        if (this.timerId) clearInterval(this.timerId);
    }

    private initTimer() {
        this.timerId = setInterval(() => this.now.set(new Date()), 30000);
    }

    private initGuiaStartTimes() {
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

    cambiarTab(tab: 'inicio' | 'ruta' | 'historial' | 'perfil') { this.activeTab.set(tab); }
    irAPerfil() { this.activeTab.set('perfil'); }

    setHistorialFiltro(f: string) {
        this.historialFiltro.set(f as any);
        this.selectedHistory.set(null);
    }

    setMunicipioFiltro(m: string) {
        this.municipioFiltro.set(m);
        this.selectedHistory.set(null);
    }

    toggleGuiaActiva(id: string) { this.guiaActivaExpandida.set(this.guiaActivaExpandida() === id ? null : id); }
    toggleSelectedGuia(g: GuiaDisplay) { this.selectedGuia.set(this.selectedGuia()?.id === g.id ? null : g); }
    toggleHistory(g: GuiaDisplay) { this.selectedHistory.set(this.selectedHistory()?.id === g.id ? null : g); }
    abrirFirma(guia: any) { this.firmaGuia.set(guia); }

    onFirmaConfirmada(event: { firma: string; observaciones: string }) {
        const guia = this.firmaGuia();
        if (!guia) return;
        this.firmasMap.set(guia.id, event.firma);
        const ahora = new Date();
        const f = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
        const h = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
        this.guiasAsignadas.update(list => list.map(g =>
            g.id !== guia.id ? g : {
                ...g, estado: 'FINALIZADO', fechaEntrega: f,
                eventos: [...g.eventos,
                    { id: `ev-${Date.now()}`, idGuia: g.id, tipo: 'LLEGADA_CLIENTE', fecha: `${f} ${h}`, descripcion: 'Entrega completada con firma digital', ubicacion: g.ruta },
                    { id: `ev-${Date.now() + 1}`, idGuia: g.id, tipo: 'REGRESO_BASE', fecha: `${f} ${h}`, descripcion: 'Regreso a base', ubicacion: 'Base' },
                ]
            } as GuiaDisplay
        ));
        this.guiaActivaExpandida.set(null);
        this.messageService.add({ severity: 'success', summary: 'Entrega completada', detail: `${guia.cliente} — ${guia.numeroGuia}` });
    }

    onFirmaCancelada() { this.firmaGuia.set(null); }
    tieneFirma(id: string) { return this.firmasMap.has(id); }

    getEstadoLabel(e: string): string {
        if (e === 'CANCELADO') return 'Cancelado';
        const found = ESTADOS_GUIA.find((eg: any) => eg.value === e);
        return found?.label || e;
    }

    getEstadoSeverity(e: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
        if (e === 'CANCELADO') return 'danger';
        const found = ESTADOS_GUIA.find((eg: any) => eg.value === e);
        return (found?.severity as any) || 'info';
    }

    getColorBorde(e: string): string {
        switch (e) {
            case 'EN_PROCESO': return 'border-l-blue-500';
            case 'CARGADO': return 'border-l-yellow-500';
            case 'EN_ESPERA': return 'border-l-orange-500';
            case 'FINALIZADO': return 'border-l-green-500';
            case 'CANCELADO': return 'border-l-red-500';
            default: return 'border-l-surface-300';
        }
    }

    logout() { this.authService.logout(); }

    get fechaActual(): string {
        return new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    vehiculoPrincipal() {
        const v = this.driverInfo()?.vehiculos;
        return v && v.length > 0 ? v[0] : null;
    }
}
