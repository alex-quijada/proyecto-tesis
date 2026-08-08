import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from '@/app/auth/service/auth.service';
import { traducirErrorDuplicado } from '@/app/services/errores.util';
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
    private authService = inject(AuthService);

    private get supabase(): SupabaseClient {
        return this.authService.client;
    }

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
        {
            id_municipio: 'ca688dbd-e098-437f-a4dd-950d8e22715c',
            nombre: 'Antolín del Campo',
            capital: 'Paraguachí',
        },
        {
            id_municipio: 'b296c432-4c47-4251-a38d-e8ac3cdafb63',
            nombre: 'Arismendi',
            capital: 'La Asunción',
        },
        {
            id_municipio: '3b568ab8-1fc3-46ae-99b3-43d58fb4c4ad',
            nombre: 'Díaz',
            capital: 'San Juan Bautista',
        },
        {
            id_municipio: '66f23356-6246-4c01-a6da-b7c59326c8f9',
            nombre: 'García',
            capital: 'El Valle del Espíritu Santo',
        },
        {
            id_municipio: '020bff72-e966-4356-9664-e860ea9c1e41',
            nombre: 'Gómez',
            capital: 'Santa Ana',
        },
        {
            id_municipio: 'a1f6d9e1-d999-4e04-a1b0-f80a32e072d3',
            nombre: 'Maneiro',
            capital: 'Pampatar',
        },
        {
            id_municipio: 'bdc8027f-3d0f-4ec0-b4c3-45ca8637d6db',
            nombre: 'Marcano',
            capital: 'Juan Griego',
        },
        {
            id_municipio: 'd1b9ed3e-d2d9-420e-9158-d01e35e79784',
            nombre: 'Mariño',
            capital: 'Porlamar',
        },
        {
            id_municipio: 'dd76c370-a034-4fef-8046-7782b41832b1',
            nombre: 'Península de Macanao',
            capital: 'Boca de Río',
        },
        {
            id_municipio: '40844c65-3bee-4d1f-a87e-588652a8cb82',
            nombre: 'Tubores',
            capital: 'Punta de Piedras',
        },
        {
            id_municipio: '1d380be4-9b76-4230-a83c-67c796d6215c',
            nombre: 'Villalba',
            capital: 'San Pedro de Coche',
        },
    ];

    private readonly PRIORIDADES_FALLBACK: PrioridadItem[] = [
        { id_prioridad: 'ALTA', nombre_prioridad: 'alta' },
        { id_prioridad: 'MEDIA', nombre_prioridad: 'media' },
        { id_prioridad: 'BAJA', nombre_prioridad: 'baja' },
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
            idPrioridad: c.id_prioridad,
            prioridad: c.nombre_prioridad,
        }));
    }

    private formatearError(contexto: string, err: any): Error {
        console.error(`[${contexto}]`, JSON.stringify(err, null, 2));
        const duplicado = traducirErrorDuplicado(
            err,
            {
                numero_doc: 'El número de documento ya existe.',
                correo: 'El correo ya existe.',
            },
            'Ya existe un registro con ese valor.',
        );
        if (duplicado) return new Error(duplicado);
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
        };
        const { data, error } = await this.supabase.rpc('crear_cliente', params);
        if (error) throw this.formatearError('Error al crear cliente', error);
        return data;
    }

    async actualizarCliente(cliente: Cliente): Promise<void> {
        const params = {
            p_id_cliente: cliente.id,
            p_id_prefijo: cliente.idPrefijo,
            p_numero_doc: cliente.documentoIdentidad?.numero || '',
            p_nombre_comercial: cliente.nombreComercial || '',
            p_telefono: cliente.telefono || '',
            p_correo: cliente.correo || '',
            p_persona_contacto: cliente.personaContacto || '',
            p_id_prioridad: cliente.idPrioridad,
        };
        const { error } = await this.supabase.rpc('actualizar_cliente', params);
        if (error) throw this.formatearError('Error al actualizar cliente', error);
    }

    async guardarSucursales(clienteId: string, sucursales: SucursalCliente[]): Promise<void> {
        const sucursalesJson = sucursales
            .filter((s) => s.direccion?.trim())
            .map((s) => ({
                id: s.id || '',
                direccion: s.direccion,
                punto_de_referencia: s.puntoDeReferencia || '',
                id_municipio: s.idMunicipio || null,
                telefono_contacto: s.telefonoContacto || '',
                nombre_contacto: s.nombreContacto || '',
                instruccion_nota: s.reglas?.instrucciones || '',
                cita: s.reglas?.requiereCita ?? false,
                dias_semana: s.reglas?.diasRecepcion?.join(',') || '',
                hora_desde: s.reglas?.horaDesde || '',
                hora_hasta: s.reglas?.horaHasta || '',
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
                horaDesde: s.hora_desde ? s.hora_desde.substring(0, 5) : '',
                horaHasta: s.hora_hasta ? s.hora_hasta.substring(0, 5) : '',
                diasRecepcion: s.dias_semana ? s.dias_semana.split(',') : [],
                requiereCita: s.cita ?? false,
                instrucciones: s.instruccion_nota || '',
            },
            latitud: s.latitud,
            longitud: s.longitud,
        }));
    }
}
