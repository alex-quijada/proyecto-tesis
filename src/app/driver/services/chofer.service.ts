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
    /** Momento en que la factura entró a 'embarque' (inicio de carga). */
    fecha_inicio_carga: string | null;
    /** Última transición de estado de la factura (entrada al estado actual). */
    fecha_ultimo_cambio: string | null;
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

    /**
     * Reporta una o varias incidencias en la factura (estado → 'incidencia').
     * Cada incidencia sube su foto a storage (si viene en base64) y se guarda
     * como fila en incidencias (una por tipo) + historial de estados.
     */
    async reportarIncidencia(
        idFactura: string,
        incidencias: { tipo?: string | null; descripcion?: string | null; foto?: string | null }[],
    ): Promise<void> {
        const items: { tipo: string; descripcion: string; foto: string }[] = [];
        for (const inc of incidencias) {
            const tipoCodigo = mapearTipoIncidencia(inc.tipo);
            if (!tipoCodigo || tipoCodigo === 'INCIDENCIA') continue;
            let fotoUrl: string | null = null;
            if (inc.foto) {
                fotoUrl = await this.subirFotoIncidencia(idFactura, inc.foto);
            }
            items.push({
                tipo: tipoCodigo,
                descripcion: inc.descripcion || '',
                foto: fotoUrl || '',
            });
        }
        if (items.length === 0) return;
        const { error } = await this.supabase.rpc('reportar_incidencias', {
            p_id_factura: idFactura,
            p_incidencias: items.map((i) => ({
                tipo: i.tipo,
                descripcion: i.descripcion,
                foto: i.foto || null,
            })),
        });
        if (error) throw new Error(`Error al reportar la incidencia: ${error.message}`);
    }

    /** Obtiene la última incidencia de una factura. */
    async obtenerIncidenciaFactura(idFactura: string): Promise<any | null> {
        const { data, error } = await this.supabase.rpc('obtener_incidencia_factura', {
            p_id_factura: idFactura,
        });
        if (error) throw new Error(`Error al obtener la incidencia: ${error.message}`);
        return data || null;
    }

    private async subirFotoIncidencia(idFactura: string, base64DataUrl: string): Promise<string> {
        const uid = this.authService.getCurrentUser()?.id || 'anon';
        const base64 = base64DataUrl.split(',')[1] || base64DataUrl;
        const blob = this.base64ToBlob(base64);
        const path = `${uid}/${idFactura}-${Date.now()}.jpg`;
        const { error } = await this.supabase.storage
            .from('incidencias-fotos')
            .upload(path, blob, { contentType: 'image/jpeg' });
        if (error) throw new Error(`Error al subir la foto: ${error.message}`);
        const { data } = this.supabase.storage.from('incidencias-fotos').getPublicUrl(path);
        return data.publicUrl;
    }

    private base64ToBlob(base64: string): Blob {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: 'image/jpeg' });
    }
}

/** Mapea el tipo de incidencia del diálogo a su código resumido (1-2 palabras). */
const TIPOS_INCIDENCIA_MAP: Record<string, string> = {
    'Cliente fuera de tiempo': 'FUERA_HORARIO',
    'Cliente cerrado': 'CERRADO',
    'Producto faltante': 'FALTANTE',
    'Producto sobrante': 'SOBRANTE',
    'Producto no solicitado': 'NO_SOLICITADO',
    'Producto dañado': 'DANADO',
};

export function mapearTipoIncidencia(tipo?: string | null): string {
    if (!tipo) return 'INCIDENCIA';
    return TIPOS_INCIDENCIA_MAP[tipo] || tipo.toUpperCase().replace(/\s+/g, '_');
}
