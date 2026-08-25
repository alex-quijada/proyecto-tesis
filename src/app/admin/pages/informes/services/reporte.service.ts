import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from '@/app/auth/service/auth.service';
import { RutaService } from '@/app/admin/pages/rutas/services/ruta.service';
import { VehiculoService } from '@/app/admin/pages/vehiculos/service/vehiculo.service';
import { MunicipioService } from '@/app/admin/services/municipio.service';
import { OpcionFiltro } from '../utils/reporte.types';
import { capitalizar, aMayusculas } from '../utils/capitalizar.util';

export interface MetricasEficiencia {
    kpis: {
        viajes_finalizados: number;
        entregas: number;
        incidencias: number;
        monto_entregado_usd: number;
        monto_entregado_bss: number;
        monto_incidencia_usd: number;
        monto_incidencia_bss: number;
    };
    por_chofer: {
        id_chofer: string;
        nombre_chofer: string;
        entregas: number;
        incidencias: number;
        monto_usd: number;
        monto_bss: number;
        km_planificados: number;
    }[];
    por_municipio: {
        municipio: string;
        entregas: number;
        incidencias: number;
        monto_usd: number;
        monto_bss: number;
    }[];
    tiempos_por_etapa: {
        orden: number;
        etapa: string;
        minutos_promedio: number;
    }[];
}

export interface ResumenGastos {
    por_vehiculo: {
        id_vehiculo: string;
        placa: string;
        vehiculo_desc: string;
        litros_combustible: number;
        costo_combustible: number;
        costo_combustible_bss: number;
        cargas: number;
        costo_mantenimiento: number;
        costo_mantenimiento_bss: number;
        mantenimientos: number;
        costo_total: number;
        costo_total_bss: number;
        km_recorridos: number;
        costo_por_km: number;
    }[];
    totales: {
        costo_combustible: number;
        litros: number;
        costo_mantenimiento: number;
        costo_total: number;
        costo_combustible_bss: number;
        costo_mantenimiento_bss: number;
        costo_total_bss: number;
    };
}

export interface ResumenIncidencias {
    por_tipo: {
        tipo: string;
        total: number;
        recuperables: number;
        terminales: number;
        resueltas: number;
        pendientes: number;
        monto_usd: number;
        monto_bss: number;
    }[];
    por_chofer: {
        nombre_chofer: string;
        total: number;
        recuperables: number;
        resueltas: number;
        monto_usd: number;
        monto_bss: number;
    }[];
    totales: {
        total: number;
        recuperables: number;
        terminales: number;
        resueltas: number;
        pendientes: number;
        monto_usd: number;
        monto_bss: number;
    };
}

@Injectable({ providedIn: 'root' })
export class ReporteService {
    private authService = inject(AuthService);
    private rutaService = inject(RutaService);
    private vehiculoService = inject(VehiculoService);
    private municipioService = inject(MunicipioService);

    private get supabase(): SupabaseClient {
        return this.authService.client;
    }

    async obtenerEficiencia(
        pDesde?: string | null,
        pHasta?: string | null,
        pIdChofer?: string | null,
        pIdMunicipio?: string | null,
    ): Promise<MetricasEficiencia> {
        const { data, error } = await this.supabase.rpc('obtener_metricas_eficiencia', {
            p_desde: pDesde || null,
            p_hasta: pHasta || null,
            p_id_chofer: pIdChofer || null,
            p_id_municipio: pIdMunicipio || null,
        });
        if (error) throw new Error(`Error al cargar el reporte de eficiencia: ${error.message}`);
        return data as MetricasEficiencia;
    }

    async obtenerGastos(
        pDesde?: string | null,
        pHasta?: string | null,
        pIdVehiculo?: string | null,
    ): Promise<ResumenGastos> {
        const { data, error } = await this.supabase.rpc('obtener_resumen_gastos', {
            p_desde: pDesde || null,
            p_hasta: pHasta || null,
            p_id_vehiculo: pIdVehiculo || null,
        });
        if (error) throw new Error(`Error al cargar el reporte de gastos: ${error.message}`);
        return data as ResumenGastos;
    }

    async obtenerIncidencias(
        pDesde?: string | null,
        pHasta?: string | null,
        pIdChofer?: string | null,
    ): Promise<ResumenIncidencias> {
        const { data, error } = await this.supabase.rpc('obtener_resumen_incidencias', {
            p_desde: pDesde || null,
            p_hasta: pHasta || null,
            p_id_chofer: pIdChofer || null,
        });
        if (error) throw new Error(`Error al cargar el reporte de incidencias: ${error.message}`);
        return data as ResumenIncidencias;
    }

    // ---------------- Opciones para filtros ----------------

    async obtenerChoferes(): Promise<OpcionFiltro[]> {
        const choferes = await this.authService.obtenerChoferes(true);
        return choferes.map((c) => ({
            label: capitalizar(c.nombreCompleto) || 'Sin nombre',
            value: c.id || '',
        }));
    }

    async obtenerMunicipios(): Promise<OpcionFiltro[]> {
        const items = await this.municipioService.obtenerTodos();
        return items;
    }

    async obtenerVehiculos(): Promise<OpcionFiltro[]> {
        const vehiculos = await this.vehiculoService.obtenerVehiculos();
        return vehiculos.map((v) => ({
            label: aMayusculas(`${v.placa || ''} — ${v.marca || ''} ${v.modelo || ''}`.trim()),
            value: v.id_vehiculo || v.id || '',
        }));
    }

    async obtenerEmpresas(): Promise<OpcionFiltro[]> {
        const empresas = await this.rutaService.obtenerEmpresas();
        // Las guías mapeadas por RutaService exponen el NOMBRE de la empresa
        // (no el id), así que el valor del filtro debe ser el nombre.
        return empresas.map((e) => ({ label: e.label, value: e.label }));
    }
}
