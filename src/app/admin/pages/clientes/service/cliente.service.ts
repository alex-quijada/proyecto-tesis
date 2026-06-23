import { Injectable } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '@/environments/environment';
import { PrefijoDoc } from '../../rutas/models/pdf-data.model';
import { Cliente, SucursalCliente } from '../clientes.types';

export interface PrefijoItem {
    id_prefijo: string;
    prefijo: PrefijoDoc;
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

    private readonly PREFIJOS_FALLBACK: PrefijoItem[] = [
        { id_prefijo: 'V', prefijo: 'V', descripcion: 'V - Venezolano' },
        { id_prefijo: 'E', prefijo: 'E', descripcion: 'E - Extranjero' },
        { id_prefijo: 'J', prefijo: 'J', descripcion: 'J - Jurídico / Comercio' },
        { id_prefijo: 'P', prefijo: 'P', descripcion: 'P - Pasaporte' },
        { id_prefijo: 'G', prefijo: 'G', descripcion: 'G - Gobierno' },
    ];

    async obtenerPrefijos(): Promise<PrefijoItem[]> {
        const { data, error } = await this.supabase.rpc('obtener_prefijos_documento');
        if (error) return this.PREFIJOS_FALLBACK;
        return data?.length ? data : this.PREFIJOS_FALLBACK;
    }

    private readonly MUNICIPIOS_FALLBACK: MunicipioItem[] = [
        { id_municipio: 'ANTOLIN_DEL_CAMPO', nombre: 'Antolín del Campo', capital: 'Paraguachí' },
        { id_municipio: 'ARISMENDI', nombre: 'Arismendi', capital: 'La Asunción' },
        { id_municipio: 'DIAZ', nombre: 'Díaz', capital: 'San Juan Bautista' },
        { id_municipio: 'GARCIA', nombre: 'García', capital: 'El Valle del Espíritu Santo' },
        { id_municipio: 'GOMEZ', nombre: 'Gómez', capital: 'Santa Ana' },
        { id_municipio: 'MANEIRO', nombre: 'Maneiro', capital: 'Pampatar' },
        { id_municipio: 'MARCANO', nombre: 'Marcano', capital: 'Juan Griego' },
        { id_municipio: 'MARINO', nombre: 'Mariño', capital: 'Porlamar' },
        { id_municipio: 'PENINSULA_DE_MACANAO', nombre: 'Península de Macanao', capital: 'Boca de Río' },
        { id_municipio: 'TUBORES', nombre: 'Tubores', capital: 'Punta de Piedras' },
        { id_municipio: 'VILLALBA', nombre: 'Villalba', capital: 'San Pedro de Coche' },
    ];

    private readonly PRIORIDADES_FALLBACK: PrioridadItem[] = [
        { id_prioridad: 'ALTA', nombre_prioridad: 'Alta' },
        { id_prioridad: 'MEDIA', nombre_prioridad: 'Media' },
        { id_prioridad: 'BAJA', nombre_prioridad: 'Baja' },
    ];

    async obtenerMunicipios(): Promise<MunicipioItem[]> {
        const { data, error } = await this.supabase.rpc('obtener_municipios');
        if (error) return this.MUNICIPIOS_FALLBACK;
        return data?.length ? data : this.MUNICIPIOS_FALLBACK;
    }

    async obtenerPrioridades(): Promise<PrioridadItem[]> {
        const { data, error } = await this.supabase.rpc('obtener_prioridades_clientes');
        if (error) return this.PRIORIDADES_FALLBACK;
        return data?.length ? data : this.PRIORIDADES_FALLBACK;
    }

    async obtenerClientes(): Promise<Cliente[]> {
        const { data, error } = await this.supabase.rpc('obtener_clientes');
        if (error) throw this.formatearError('Error al obtener clientes', error);
        return (data || []).map((c: any) => ({
            id: c.id_cliente,
            idCliente: c.id_cliente,
            documentoIdentidad: {
                prefijo: c.prefijo || 'V',
                numero: c.numero_doc || '',
            },
            nombreComercial: c.nombre_comercial,
            telefono: c.telefono,
            correo: c.correo,
            personaContacto: c.persona_contacto,
            reglas: c.reglas,
            idPrioridad: c.id_prioridad,
            prioridad: c.nombre_prioridad,
        }));
    }

    private formatearError(contexto: string, err: any): Error {
        console.error(`[${contexto}]`, JSON.stringify(err, null, 2));
        const msg = err?.details || err?.hint || err?.message || err?.code || JSON.stringify(err);
        return new Error(`${contexto}: ${msg}`);
    }

    async crearCliente(cliente: Cliente): Promise<string> {
        const params = {
            p_id_prefijo: cliente.idPrefijo,
            p_numero_doc: cliente.documentoIdentidad?.numero || '',
            p_nombre_comercial: cliente.nombreComercial || '',
            p_telefono: cliente.telefono || '',
            p_correo: cliente.correo || '',
            p_persona_contacto: cliente.personaContacto || '',
            p_id_prioridad: cliente.idPrioridad,
            p_reglas: cliente.reglas ?? null,
        };
        const { data, error } = await this.supabase.rpc('crear_cliente', params);
        if (error) throw this.formatearError('Error al crear cliente', error);
        return data;
    }

    async guardarSucursales(clienteId: string, sucursales: SucursalCliente[]): Promise<void> {
        const sucursalesJson = sucursales
            .filter((s) => s.direccion?.trim())
            .map((s) => ({
                direccion: s.direccion,
                punto_de_referencia: s.puntoDeReferencia || '',
                id_municipio: s.idMunicipio || null,
                telefono_contacto: s.telefonoContacto || '',
                nombre_contacto: s.nombreContacto || '',
                instruccion_nota: s.reglas?.instrucciones || '',
                cita: s.reglas?.requiereCita ?? false,
                dias_semana: s.reglas?.diasRecepcion?.join(',') || '',
                hora_entrega: s.reglas?.horaEntrega || '',
                latitud: s.latitud != null ? String(s.latitud) : null,
                longitud: s.longitud != null ? String(s.longitud) : null,
            }));

        const { error } = await this.supabase.rpc('guardar_sucursales_cliente', {
            p_cliente_id: clienteId,
            p_sucursales: sucursalesJson,
        });

        if (error) throw this.formatearError('Error al guardar sucursales', error);
    }

    async obtenerSucursales(clienteId: string): Promise<SucursalCliente[]> {
        const { data, error } = await this.supabase.rpc('obtener_sucursales_cliente', {
            p_cliente_id: clienteId,
        });

        if (error) throw this.formatearError('Error al obtener sucursales', error);

        return (data || []).map((s: any) => ({
            id: s.id,
            direccion: s.direccion,
            puntoDeReferencia: s.punto_de_referencia,
            idMunicipio: s.id_municipio,
            telefonoContacto: s.telefono_contacto,
            nombreContacto: s.nombre_contacto,
            reglas: {
                horaEntrega: s.hora_entrega ? s.hora_entrega.substring(0, 5) : '',
                diasRecepcion: s.dias_semana ? s.dias_semana.split(',') : [],
                requiereCita: s.cita ?? false,
                instrucciones: s.instruccion_nota || '',
            },
            latitud: s.latitud,
            longitud: s.longitud,
        }));
    }
}
