import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from '@/app/auth/service/auth.service';
import { Chofer } from '@/app/admin/pages/choferes/data/choferes-mock';

export interface ChoferFactura {
    id_factura: string;
    numero_factura: string;
    id_sucursal: string | null;
    monto_dolares: number | null;
    monto_bss: number | null;
    incidencia: string | null;
    id_estado: string | null;
    nombre_estado: string;
    direccion_sucursal: string | null;
    punto_de_referencia: string | null;
    latitud: number | null;
    longitud: number | null;
    nombre_contacto: string | null;
    telefono_contacto: string | null;
    cita: boolean | null;
    dias_semana: string | null;
    hora_desde: string | null;
    hora_hasta: string | null;
    id_cliente: string | null;
    nombre_cliente: string | null;
    rif_cliente: string | null;
    telefono_cliente: string | null;
    persona_contacto: string | null;
    nombre_prioridad: string | null;
}

export interface ChoferGuia {
    id_guia: string;
    codigo_guia: string;
    fecha_despacho: string;
    fecha_registro: string;
    estado_guia: string;
    observaciones: string | null;
    id_vehiculo: string | null;
    placa_vehiculo: string | null;
    marca_vehiculo: string | null;
    modelo_vehiculo: string | null;
    id_chofer: string;
    nombre_chofer: string | null;
    id_ayudante: string | null;
    nombre_ayudante: string | null;
    id_empresa: string | null;
    nombre_empresa: string | null;
    id_municipio: string | null;
    nombre_municipio: string | null;
    facturas: ChoferFactura[];
}

export interface ChoferVehiculo {
    id_vehiculo: string;
    placa: string;
    marca: string;
    modelo: string;
    anio: number;
    tipo_nombre: string;
    caja_nombre: string;
    capacidad_pallets: number;
    peso_maximo: number;
    estado_nombre: string;
}

export interface FinalizarEntregaResult {
    ok: boolean;
    ya_finalizado?: boolean;
    id_factura?: string;
    id_guia?: string;
    guia_finalizada?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ChoferService {
    private authService = inject(AuthService);

    private get supabase(): SupabaseClient {
        return this.authService.client;
    }

    async obtenerGuias(): Promise<ChoferGuia[]> {
        const { data, error } = await this.supabase.rpc('obtener_guias_chofer');
        if (error) throw new Error(`Error al cargar las guías del chofer: ${error.message}`);
        return (data || []) as ChoferGuia[];
    }

    async obtenerVehiculos(): Promise<ChoferVehiculo[]> {
        const { data, error } = await this.supabase.rpc('obtener_vehiculos');
        if (error) throw new Error(`Error al cargar los vehículos: ${error.message}`);
        return (data || []) as ChoferVehiculo[];
    }

    async obtenerChoferes(): Promise<Chofer[]> {
        return this.authService.obtenerChoferes();
    }

    async finalizarEntrega(
        idFactura: string,
        observacion?: string | null,
        firma?: string | null,
    ): Promise<FinalizarEntregaResult> {
        const { data, error } = await this.supabase.rpc('finalizar_entrega', {
            p_id_factura: idFactura,
            p_observacion: observacion || null,
            p_firma: firma || null,
        });
        if (error) throw new Error(`Error al finalizar la entrega: ${error.message}`);
        return (data || {}) as FinalizarEntregaResult;
    }

    /** Llegada GPS al punto: las facturas del punto pasan a 'espera'. */
    async llegarAParada(idsFacturas: string[]): Promise<{ total_actualizadas: number }> {
        const { data, error } = await this.supabase.rpc('llegar_a_parada', {
            p_ids_facturas: idsFacturas,
        });
        if (error) throw new Error(`Error al marcar la llegada: ${error.message}`);
        return (data || {}) as { total_actualizadas: number };
    }

    /** Botón "Iniciar entrega": las facturas del punto pasan a 'entrega'. */
    async iniciarEntrega(idsFacturas: string[]): Promise<{ total_actualizadas: number }> {
        const { data, error } = await this.supabase.rpc('iniciar_entrega', {
            p_ids_facturas: idsFacturas,
        });
        if (error) throw new Error(`Error al iniciar la entrega: ${error.message}`);
        return (data || {}) as { total_actualizadas: number };
    }

    /** Reporta una incidencia en la factura (estado → 'incidencia'). */
    async reportarIncidencia(idFactura: string, observacion?: string | null): Promise<void> {
        const { error } = await this.supabase.rpc('reportar_incidencia', {
            p_id_factura: idFactura,
            p_observacion: observacion || null,
        });
        if (error) throw new Error(`Error al reportar la incidencia: ${error.message}`);
    }
}
