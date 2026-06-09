import { Component, OnInit, signal, inject, ViewChild } from '@angular/core';
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

import { GuiaDespacho, GUIAS_MOCK, ESTADOS_GUIA } from '../../../admin/pages/rutas/data/rutas-mock';
import { CHOFERES_MOCK } from '../../../admin/pages/choferes/data/choferes-mock';
import { VEHICULOS_MOCK } from '../../../admin/pages/vehiculos/data/vehiculos-mock';
import { FirmaDialogComponent } from './components/firma-dialog/firma-dialog.component';

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
        imagen?: string;
    } | null;
    ruta: {
        codigo: string;
        fecha: string;
    } | null;
}

const ORDEN_MUNICIPIOS: Record<string, number> = {
    'PENINSULA_DE_MACANAO': 1,
    'TUBORES': 2,
    'DIAZ': 3,
    'GARCIA': 4,
    'ARISMENDI': 5,
    'GOMEZ': 6,
    'MANEIRO': 7,
    'MARINO': 8,
    'MARCANO': 9,
    'ANTOLIN_DEL_CAMPO': 10,
    'VILLALBA': 11,
};

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

    @ViewChild(FirmaDialogComponent) firmaDialog!: FirmaDialogComponent;

    choferesDisponibles = CHOFERES_MOCK.filter((ch: any) => ch.rol === 'Chofer').map((ch: any) => ({
        label: `${ch.nombreCompleto} — ${ch.documentoIdentidad?.prefijo}-${ch.documentoIdentidad?.numero}`,
        value: ch.id!,
    }));

    session = signal<DriverSession | null>(null);
    guiasAsignadas = signal<GuiaDespacho[]>([]);
    selectedGuia = signal<GuiaDespacho | null>(null);
    reordering = signal(false);
    showCompleted = signal(false);
    activeTab = signal<'ruta' | 'mapa' | 'completadas'>('ruta');
    firmaGuia = signal<GuiaDespacho | null>(null);
    firmasMap = new Map<string, string>();

    get fechaActual(): string {
        const hoy = new Date();
        return hoy.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    get guiasPendientes(): GuiaDespacho[] {
        return this.guiasAsignadas().filter(g => g.estado !== 'FINALIZADO');
    }

    get guiasCompletadas(): GuiaDespacho[] {
        return this.guiasAsignadas().filter(g => g.estado === 'FINALIZADO');
    }

    get avance(): number {
        const total = this.guiasAsignadas().length;
        if (!total) return 0;
        return Math.round((this.guiasCompletadas.length / total) * 100);
    }

    get totalPrecio(): number {
        return this.guiasAsignadas().reduce((s, g) => s + g.precioCarga, 0);
    }

    get totalPeso(): number {
        return this.guiasAsignadas().reduce((s, g) => s + g.pesoKg, 0);
    }

    ngOnInit() {
        const choferPredeterminado = CHOFERES_MOCK[0];
        if (choferPredeterminado) {
            this.cargarRutaChofer(choferPredeterminado.id!);
        }
    }

    onSelectChofer(id: string) {
        this.cargarRutaChofer(id);
    }

    private cargarRutaChofer(idChofer: string) {
        const chofer = CHOFERES_MOCK.find((ch: any) => ch.id === idChofer);
        if (!chofer) return;

        const vehiculo = VEHICULOS_MOCK.find((v: any) =>
            GUIAS_MOCK.some((g: any) => g.idChofer === idChofer && g.idVehiculo === v.id)
        ) || VEHICULOS_MOCK[0];

        const guias = GUIAS_MOCK
            .filter((g: any) => g.idChofer === idChofer)
            .sort((a: any, b: any) => ORDEN_MUNICIPIOS[a.municipio] - ORDEN_MUNICIPIOS[b.municipio]);

        const rutasUnicas: string[] = GUIAS_MOCK
            .filter((g: any) => g.idChofer === idChofer)
            .map((g: any) => g.idRuta)
            .filter((id: string | undefined): id is string => !!id);

        this.session.set({
            id: chofer.id!,
            nombre: chofer.nombreCompleto!,
            documento: `${chofer.documentoIdentidad!.prefijo}-${chofer.documentoIdentidad!.numero}`,
            telefono: chofer.telefono!,
            vehiculo: vehiculo ? {
                id: vehiculo.id!,
                placa: vehiculo.placa!,
                marca: vehiculo.marca!,
                modelo: vehiculo.modelo!,
                anio: vehiculo.anio!,
                tipo: vehiculo.tipo || 'CARRO',
                imagen: vehiculo.imagen,
            } : null,
            ruta: rutasUnicas.length ? {
                codigo: rutasUnicas[0],
                fecha: new Date().toISOString().split('T')[0],
            } : null,
        });

        this.guiasAsignadas.set(guias);
        this.selectedGuia.set(null);
    }

    getEstadoLabel(estado: string): string {
        const e = ESTADOS_GUIA.find((eg: any) => eg.value === estado);
        return e?.label || estado;
    }

    getEstadoSeverity(estado: string): 'info' | 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
        const e = ESTADOS_GUIA.find((eg: any) => eg.value === estado);
        return (e?.severity as any) || 'info';
    }

    toggleGuia(guia: GuiaDespacho) {
        if (this.selectedGuia()?.id === guia.id) {
            this.selectedGuia.set(null);
        } else {
            this.selectedGuia.set(guia);
        }
    }

    abrirFirma(guia: GuiaDespacho) {
        this.firmaGuia.set(guia);
        setTimeout(() => this.firmaDialog?.open(), 50);
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
        this.messageService.add({
            severity: 'success',
            summary: 'Entrega completada',
            detail: `${guia.nombreCliente} — ${guia.numeroGuia}`,
        });
    }

    optimizarRuta() {
        const guias = this.guiasAsignadas();
        const pendientes = guias.filter(g => g.estado !== 'FINALIZADO');
        const completadas = guias.filter(g => g.estado === 'FINALIZADO');

        pendientes.sort((a, b) => {
            const ordenA = ORDEN_MUNICIPIOS[a.municipio] ?? 99;
            const ordenB = ORDEN_MUNICIPIOS[b.municipio] ?? 99;
            if (ordenA !== ordenB) return ordenA - ordenB;
            return a.nombreCliente.localeCompare(b.nombreCliente);
        });

        this.guiasAsignadas.set([...completadas, ...pendientes]);
        this.messageService.add({
            severity: 'info',
            summary: 'Ruta optimizada',
            detail: 'Guias ordenadas de oeste a este',
        });
    }

    moverGuia(index: number, direction: number) {
        const guias = [...this.guiasPendientes];
        const completadas = this.guiasAsignadas().filter(g => g.estado === 'FINALIZADO');
        const target = index + direction;
        if (target < 0 || target >= guias.length) return;
        [guias[index], guias[target]] = [guias[target], guias[index]];
        this.guiasAsignadas.set([...completadas, ...guias]);
    }

    toggleReordering() {
        this.reordering.update(v => !v);
    }

    cambiarTab(tab: 'ruta' | 'mapa' | 'completadas') {
        this.activeTab.set(tab);
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
}
