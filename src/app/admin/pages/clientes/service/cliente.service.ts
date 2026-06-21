import { Injectable } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '@/environments/environment';
import { Cliente, UbicacionResumen } from '../clientes.types';

export interface PrefijoItem {
    id_prefijo: string;
    prefijo: string;
    descripcion: string;
}

export interface MunicipioItem {
    id_municipio: string;
    nombre: string;
    capital: string;
}

export interface PrioridadItem {
    id_prioridad: string;
    nombre_prioridad: string;
}

@Injectable({
    providedIn: 'root',
})
export class ClienteService {
    private supabase: SupabaseClient = createClient(
        environment.supabaseUrl,
        environment.supabaseKey,
    );

    async obtenerPrefijos(): Promise<PrefijoItem[]> {
        const { data, error } = await this.supabase.rpc('obtener_prefijos_documento');
        if (error) throw new Error(`Error al cargar prefijos: ${error.message}`);
        return data || [];
    }

    async obtenerMunicipios(): Promise<MunicipioItem[]> {
        const { data, error } = await this.supabase.rpc('obtener_municipios');
        if (error) throw new Error(`Error al cargar municipios: ${error.message}`);
        return data || [];
    }

    async obtenerPrioridades(): Promise<PrioridadItem[]> {
        const { data, error } = await this.supabase.rpc('obtener_prioridades_clientes');
        if (error) throw new Error(`Error al cargar prioridades: ${error.message}`);
        return data || [];
    }

    async crearCliente(cliente: Cliente): Promise<string> {
        const { data, error } = await this.supabase.rpc('crear_cliente', {
            p_id_prefijo: cliente.idPrefijo,
            p_rif_numero: cliente.documentoIdentidad?.numero || '',
            p_nombre_comercial: cliente.nombreComercial || '',
            p_telefono: cliente.telefono || '',
            p_correo: cliente.correo || '',
            p_persona_contacto: cliente.personaContacto || '',
            p_id_prioridad: cliente.idPrioridad,
            p_reglas: cliente.reglas ? JSON.stringify(cliente.reglas) : null,
        });

        if (error) throw new Error(`Error al crear cliente: ${error.message}`);
        return data;
    }

    async guardarUbicaciones(clienteId: string, ubicaciones: UbicacionResumen[]): Promise<void> {
        const ubicacionesJson = ubicaciones
            .filter((u) => u.direccion?.trim())
            .map((u) => ({
                direccion: u.direccion,
                id_municipio: u.idMunicipio || null,
                municipio: u.municipio || '',
                estado: u.estado || 'Nueva Esparta',
                pais: u.pais || 'Venezuela',
                referencia: u.referencia || '',
                nombre_contacto: u.nombreContacto || '',
                telefono_contacto: u.telefonoContacto || '',
            }));

        const { error } = await this.supabase.rpc('guardar_ubicaciones_cliente', {
            p_id_cliente: clienteId,
            p_ubicaciones: JSON.stringify(ubicacionesJson),
        });

        if (error) throw new Error(`Error al guardar ubicaciones: ${error.message}`);
    }
}
