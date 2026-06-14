import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseClient, User, FunctionsHttpError } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { Usuario } from '../../admin/pages/usuarios/data/usuarios-mock';
import { Chofer } from '../../admin/pages/choferes/data/choferes-mock';
import { supabase } from '../../core/supabase.client';

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    private supabase: SupabaseClient = supabase;
    private router = inject(Router);

    private userSubject = new BehaviorSubject<User | null>(null);
    public user$ = this.userSubject.asObservable();

    private initializationPromise: Promise<void>;

    constructor() {
        this.initializationPromise = this.supabase.auth
            .getSession()
            .then(({ data: { session } }) => {
                if (session?.user) {
                    this.userSubject.next(session.user);
                }
            });

        this.supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                this.userSubject.next(session.user);
            } else {
                this.userSubject.next(null);
            }
        });
    }

    async waitForInitialization(): Promise<void> {
        await this.initializationPromise;
    }

    getCurrentUser(): User | null {
        return this.userSubject.getValue();
    }



    // Función para iniciar sesión
    async login(email: string, password: string) {
        const { data, error } = await this.supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) throw error;
        return data;
    }

    // Función para cerrar sesión
    async logout() {
        await this.supabase.auth.signOut();
        this.userSubject.next(null);
        this.router.navigate(['auth/login']);
    }

    /**
     * Recuperar el rol guardado en la metadata del usuario de Supabase
     * Corregido para apuntar a 'nombre_rol' (sincronizado con el Front/Back)
     */
    getUserRole(): string | undefined {
        const user = this.userSubject.value;
        return user?.user_metadata?.['nombre_rol'];
    }

    // Validar si hay una sesión activa
    async isAuthenticated(): Promise<boolean> {
        const {
            data: { session },
        } = await this.supabase.auth.getSession();
        return !!session;
    }

    // ==========================================
    // OPERACIONES CRUD SOBRE public.usuarios
    // ==========================================

    private readonly ROL_MAP_TO_DIALOG: Record<string, string> = {
        administrador: 'ADMIN',
        coordinador: 'ADMIN',
        analista: 'ANALISTA',
        chofer: 'CHOFER',
        ayudante: 'AYUDANTE',
    };

    async listarUsuarios(): Promise<Usuario[]> {
        const { data, error } = await this.supabase
            .from('usuarios')
            .select(
                `
                id_usuario,
                email,
                nombre_completo,
                cedula,
                roles ( nombre_rol )
            `,
            )
            .order('nombre_completo', { ascending: true });

        if (error) throw new Error(`Error al cargar usuarios: ${error.message}`);

        return (data || []).map((row: any) => {
            const nombreRol: string = row.roles?.nombre_rol || 'Analista';
            const dialogRol = this.ROL_MAP_TO_DIALOG[nombreRol] || 'ANALISTA';

            return {
                id: row.id_usuario,
                username: row.email?.split('@')[0] || 'usuario',
                email: row.email || '',
                documentoIdentidad: { prefijo: 'V', numero: String(row.cedula || 0) },
                nombreCompleto: row.nombre_completo || '',
                telefono: '',
                rol: dialogRol,
                activo: true,
                fechaCreacion: '',
            } as Usuario;
        });
    }

    async obtenerTodosLosUsuarios() {
        const { data, error } = await this.supabase
            .from('usuarios')
            .select(
                `
        id_usuario,
        email,
        nombre_completo,
        cedula,
        roles (
          nombre_rol
        )
      `,
            )
            .order('nombre_completo', { ascending: true });

        if (error) throw error;
        return data;
    }

    async eliminarUsuario(id: string): Promise<void> {
        const { error } = await this.supabase.from('usuarios').delete().eq('id_usuario', id);

        if (error) throw new Error(`Error al eliminar usuario: ${error.message}`);
    }

    async obtenerChoferes(): Promise<Chofer[]> {
        const { data, error } = await this.supabase
            .rpc('obtener_choferes');

        if (error) throw new Error(`Error al cargar choferes: ${error.message}`);

        return (data || []).map((row: any): Chofer => ({
            id: row.id_usuario,
            documentoIdentidad: { prefijo: 'V', numero: String(row.cedula || '') },
            nombreCompleto: row.nombre_completo || '',
            telefono: '',
            rol: row.nombre_rol === 'chofer' ? 'Chofer' : 'Ayudante',
            fechaIngreso: '',
            licencia: row.licencia_numero
                ? {
                    numero: row.licencia_numero || '',
                    grado: row.licencia_grado || '',
                    fechaVencimiento: row.licencia_vencimiento || '',
                  }
                : undefined,
            certificadoMedico: row.certificado_numero
                ? {
                    numero: row.certificado_numero || '',
                    fechaExpedicion: '',
                    fechaVencimiento: row.certificado_vencimiento || '',
                  }
                : undefined,
        }));
    }

    async registrarUsuarioPorRol(datosFormulario: any): Promise<any> {
        const { data, error } = await this.supabase.functions.invoke('registrar-usuario', {
            body: {
                email: datosFormulario.email,
                password: datosFormulario.password,
                nombre_completo: datosFormulario.nombre_completo,
                cedula: Number(datosFormulario.cedula),
                nombre_rol: datosFormulario.nombre_rol,
            },
        });

        if (error) {
            let funcMsg = error.message;
            if (error instanceof FunctionsHttpError) {
                try {
                    const body = await error.context.json();
                    funcMsg = body?.error || body?.message || funcMsg;
                } catch { /* ignora */ }
            }
            throw new Error(funcMsg);
        }

        const usuarioId = data?.user?.id;
        if (!usuarioId) throw new Error('No se pudo obtener el ID del usuario creado');

        const doInsert = async (table: string, row: any) => {
            const { error: e } = await this.supabase.from(table).insert(row);
            if (e) throw new Error(`Error al guardar en ${table}: ${e.message}`);
        };

        if (datosFormulario.certificado_numero && datosFormulario.certificado_vencimiento) {
            await doInsert('certificados_medicos', {
                usuario_id: usuarioId,
                certificado_numero: datosFormulario.certificado_numero,
                certificado_vencimiento: datosFormulario.certificado_vencimiento,
            });
        }

        if (datosFormulario.licencia_numero && datosFormulario.licencia_grado && datosFormulario.licencia_vencimiento) {
            await doInsert('licencias_conducir', {
                usuario_id: usuarioId,
                licencia_numero: datosFormulario.licencia_numero,
                licencia_grado: datosFormulario.licencia_grado,
                licencia_vencimiento: datosFormulario.licencia_vencimiento,
            });
        }

        return data;
    }
}
