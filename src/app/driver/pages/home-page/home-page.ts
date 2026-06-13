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
import { GuiaDespacho, GUIAS_MOCK, ESTADOS_GUIA } from '../../../admin/pages/rutas/data/rutas-mock';
import { CHOFERES_MOCK, Chofer } from '../../../admin/pages/choferes/data/choferes-mock';
import { VEHICULOS_MOCK, Vehiculo } from '../../../admin/pages/vehiculos/data/vehiculos-mock';

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
    licencia?: {
        numero: string;
        grado: string;
        fechaVencimiento: string;
    };
    certificadoMedico?: {
        numero: string;
        fechaExpedicion: string;
        fechaVencimiento: string;
    };
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
    private messageService = inject(MessageService);
    private router = inject(Router);

    activeTab = signal<'inicio' | 'ruta' | 'historial' | 'perfil'>('inicio');

    driverInfo = signal<DriverInfo | null>(null);
    guiasAsignadas = signal<GuiaDespacho[]>([]);
    selectedGuia = signal<GuiaDespacho | null>(null);
    firmaGuia = signal<GuiaDespacho | null>(null);
    guiaActivaExpandida = signal<string | null>(null);
    firmasMap = new Map<string, string>();

    now = signal(new Date());
    private guiaStartTimes = new Map<string, Date>();
    private timerId: ReturnType<typeof setInterval> | null = null;

    get guiasPendientes(): GuiaDespacho[] {
        return this.guiasAsignadas().filter(g => g.estado !== 'FINALIZADO');
    }

    get guiasCompletadas(): GuiaDespacho[] {
        return this.guiasAsignadas().filter(g => g.estado === 'FINALIZADO');
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

        const guiasDelChofer = GUIAS_MOCK
            .filter((g: any) => g.idChofer === chofer.id)
            .sort((a: any, b: any) => ORDEN_MUNICIPIOS[a.municipio] - ORDEN_MUNICIPIOS[b.municipio]);

        const vehiculoIds = [...new Set(guiasDelChofer.map((g: any) => g.idVehiculo).filter(Boolean))];
        const vehiculos = VEHICULOS_MOCK.filter((v: any) => vehiculoIds.includes(v.id));

        this.guiasAsignadas.set(guiasDelChofer);

        this.driverInfo.set({
            nombre: chofer.nombreCompleto || nombreCompleto,
            documento: `${chofer.documentoIdentidad?.prefijo || 'V'}-${chofer.documentoIdentidad?.numero || ''}`,
            telefono: chofer.telefono || '+58 000-0000000',
            email,
            vehiculos: vehiculos.map((v: any) => ({
                id: v.id!,
                placa: v.placa!,
                marca: v.marca!,
                modelo: v.modelo!,
                anio: v.anio!,
                tipo: v.tipo || 'CARRO',
            })),
            licencia: chofer.licencia ? {
                numero: chofer.licencia.numero,
                grado: chofer.licencia.grado,
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
        if (this.timerId) {
            clearInterval(this.timerId);
        }
    }

    private initTimer() {
        this.timerId = setInterval(() => {
            this.now.set(new Date());
        }, 30000);
    }

    private initGuiaStartTimes() {
        this.guiasPendientes.forEach((g, i) => {
            const minsAgo = 7 + i * 12;
            this.guiaStartTimes.set(g.id, new Date(Date.now() - minsAgo * 60000));
        });
    }

    getTiempoCarga(guiaId: string): string {
        const start = this.guiaStartTimes.get(guiaId);
        if (!start) return 'Pendiente';
        const diffMs = this.now().getTime() - start.getTime();
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return 'Menos de 1 min';
        return `${mins} mins subiendo mercancía`;
    }

    cambiarTab(tab: 'inicio' | 'ruta' | 'historial' | 'perfil') {
        this.activeTab.set(tab);
    }

    irAPerfil() {
        this.activeTab.set('perfil');
    }

    toggleGuiaActiva(guiaId: string) {
        if (this.guiaActivaExpandida() === guiaId) {
            this.guiaActivaExpandida.set(null);
        } else {
            this.guiaActivaExpandida.set(guiaId);
        }
    }

    toggleSelectedGuia(guia: GuiaDespacho) {
        if (this.selectedGuia()?.id === guia.id) {
            this.selectedGuia.set(null);
        } else {
            this.selectedGuia.set(guia);
        }
    }

    abrirFirma(guia: GuiaDespacho) {
        this.firmaGuia.set(guia);
    }

    onFirmaConfirmada(event: { firma: string; observaciones: string }) {
        const guia = this.firmaGuia();
        if (!guia) return;

        this.firmasMap.set(guia.id, event.firma);

        const updated = this.guiasAsignadas().map(g => {
            if (g.id === guia.id) {
                const ahora = new Date();
                const fecha = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
                const hora = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;

                return {
                    ...g,
                    estado: 'FINALIZADO' as const,
                    fechaLlegadaCliente: `${fecha} ${hora}`,
                    fechaRegreso: `${fecha} ${hora}`,
                    observaciones: event.observaciones || g.observaciones,
                    eventos: [
                        ...g.eventos,
                        {
                            id: `ev-${Date.now()}`,
                            idGuia: g.id,
                            tipo: 'LLEGADA_CLIENTE' as const,
                            fecha: `${fecha} ${hora}`,
                            descripcion: 'Entrega completada con firma digital',
                            ubicacion: g.municipio,
                        },
                        {
                            id: `ev-${Date.now() + 1}`,
                            idGuia: g.id,
                            tipo: 'REGRESO_BASE' as const,
                            fecha: `${fecha} ${hora}`,
                            descripcion: 'Regreso a base',
                            ubicacion: 'Base',
                        },
                    ],
                };
            }
            return g;
        });

        this.guiasAsignadas.set(updated);
        this.guiaActivaExpandida.set(null);
        this.messageService.add({
            severity: 'success',
            summary: 'Entrega completada',
            detail: `${guia.nombreCliente} — ${guia.numeroGuia}`,
        });
    }

    onFirmaCancelada() {
        this.firmaGuia.set(null);
    }

    getEstadoLabel(estado: string): string {
        const e = ESTADOS_GUIA.find((eg: any) => eg.value === estado);
        return e?.label || estado;
    }

    getEstadoSeverity(estado: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
        const e = ESTADOS_GUIA.find((eg: any) => eg.value === estado);
        return (e?.severity as any) || 'info';
    }

    getColorBorde(estado: string): string {
        switch (estado) {
            case 'EN_PROCESO': return 'border-l-blue-500';
            case 'CARGADO': return 'border-l-yellow-500';
            case 'EN_ESPERA': return 'border-l-orange-500';
            case 'FINALIZADO': return 'border-l-green-500';
            default: return 'border-l-surface-300';
        }
    }

    tieneFirma(guiaId: string): boolean {
        return this.firmasMap.has(guiaId);
    }

    logout() {
        this.authService.logout();
    }

    get fechaActual(): string {
        const hoy = new Date();
        return hoy.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    vehiculoPrincipal() {
        const v = this.driverInfo()?.vehiculos;
        return v && v.length > 0 ? v[0] : null;
    }
}
