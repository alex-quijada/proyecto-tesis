import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseClient, User, FunctionsHttpError, createClient } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { Usuario } from '../../admin/pages/usuarios/data/usuarios-mock';
import { Chofer } from '../../admin/pages/choferes/data/choferes-mock';
import { environment } from '@/environments/environment';

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    private supabaseClient = createClient(environment.supabaseUrl, environment.supabaseKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
        },
    });
    private supabase: SupabaseClient = this.supabaseClient;
    private router = inject(Router);

    get client(): SupabaseClient {
        return this.supabaseClient;
    }

    private userSubject = new BehaviorSubject<User | null>(null);
    public user$ = this.userSubject.asObservable();

    private initializationPromise: Promise<void>;

    constructor() {
        this.initializationPromise = this.supabase.auth
            .getSession()
            .then(async ({ data: { session } }) => {
                if (session?.user) {
                    this.userSubject.next(session.user);
                }
                if (
                    session &&
                    session.expires_at &&
                    session.expires_at * 1000 <= Date.now() + 5000
                ) {
                    const { data } = await this.supabase.auth.refreshSession();
                    if (data.session?.user) {
                        this.userSubject.next(data.session.user);
                    }
                }
            });

        this.supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                this.userSubject.next(session.user);
            } else {
                this.userSubject.next(null);
            }
            if ((event as string) === 'TOKEN_REFRESH_FAILED') {
                this.cerrarSesionExpirada();
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
        this.router.navigate(['/']);
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

    // Asegurar una sesión vigente (refresca si el token ya venció)
    async ensureSession(): Promise<boolean> {
        const {
            data: { session },
        } = await this.supabase.auth.getSession();
        if (!session) return false;
        if (session.expires_at && session.expires_at * 1000 <= Date.now()) {
            const { data } = await this.supabase.auth.refreshSession();
            if (data.session?.user) {
                this.userSubject.next(data.session.user);
            }
            return !!data.session;
        }
        return true;
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
                prefijo_doc,
                roles ( nombre_rol )
            `,
            )
            .order('nombre_completo', { ascending: true });

        if (error) throw new Error(`Error al cargar usuarios: ${error.message}`);

        const ids = (data || []).map((r) => r.id_usuario);
        let adicionales: any[] = [];
        if (ids.length > 0) {
            const { data: ad, error: rpcError } = await this.supabase.rpc(
                'obtener_datos_adicionales_usuarios',
                { usuario_ids: ids },
            );
            if (!rpcError) {
                adicionales = ad || [];
            } else {
                console.warn('Error al cargar datos adicionales de usuarios:', rpcError);
            }
        }
        const adMap = new Map(adicionales.map((a: any) => [a.usuario_id, a]));

        return (data || []).map((row: any) => {
            const nombreRol: string = row.roles?.nombre_rol || 'Analista';
            const dialogRol = this.ROL_MAP_TO_DIALOG[nombreRol.toLowerCase()] || 'ANALISTA';
            const ad = adMap.get(row.id_usuario);

            return {
                id: row.id_usuario,
                username: row.email?.split('@')[0] || 'usuario',
                email: row.email || '',
                documentoIdentidad: {
                    prefijo: row.prefijo_doc || 'V',
                    numero: String(row.cedula || 0),
                },
                nombreCompleto: row.nombre_completo || '',
                rol: dialogRol,
                activo: true,
                fechaCreacion: '',
                licencia: ad?.licencia_numero
                    ? {
                          numero: ad.licencia_numero || '',
                          grado: ad.licencia_grado || '',
                          fechaExpedicion: ad.licencia_expedicion || '',
                          fechaVencimiento: ad.licencia_vencimiento || '',
                      }
                    : undefined,
                certificadoMedico: ad?.certificado_numero
                    ? {
                          numero: ad.certificado_numero || '',
                          fechaExpedicion: ad.certificado_expedicion || '',
                          fechaVencimiento: ad.certificado_vencimiento || '',
                      }
                    : undefined,
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
        const { data, error } = await this.supabase.rpc('obtener_choferes');

        if (error) throw new Error(`Error al cargar choferes: ${error.message}`);

        return (data || []).map(
            (row: any): Chofer => ({
                id: row.id_usuario,
                documentoIdentidad: {
                    prefijo: row.prefijo_doc || 'V',
                    numero: String(row.cedula || ''),
                },
                nombreCompleto: row.nombre_completo || '',
                telefono: '',
                rol: String(row.nombre_rol).toLowerCase() === 'chofer' ? 'Chofer' : 'Ayudante',
                fechaIngreso: '',
                licencia: row.licencia_numero
                    ? {
                          numero: row.licencia_numero || '',
                          grado: row.licencia_grado || '',
                          fechaExpedicion: row.licencia_expedicion || '',
                          fechaVencimiento: row.licencia_vencimiento || '',
                      }
                    : undefined,
                certificadoMedico: row.certificado_numero
                    ? {
                          numero: row.certificado_numero || '',
                          fechaExpedicion: row.certificado_expedicion || '',
                          fechaVencimiento: row.certificado_vencimiento || '',
                      }
                    : undefined,
            }),
        );
    }

    private cerrarSesionExpirada() {
        this.supabase.auth.signOut();
        this.userSubject.next(null);
        this.router.navigate(['/'], {
            queryParams: { sesionExpirada: 'true' },
        });
    }

    async registrarUsuarioPorRol(datosFormulario: any): Promise<any> {
        let token: string | undefined;
        try {
            const refreshed = await this.supabase.auth.refreshSession();
            token = refreshed.data.session?.access_token;
        } catch {
            this.cerrarSesionExpirada();
            throw new Error('Tu sesión ha expirado. Inicia sesión nuevamente.');
        }
        if (!token) {
            this.cerrarSesionExpirada();
            throw new Error('Tu sesión ha expirado. Inicia sesión nuevamente.');
        }

        const { data, error } = await this.supabase.functions.invoke('registrar-usuario', {
            body: {
                email: datosFormulario.email,
                password: datosFormulario.password,
                nombre_completo: datosFormulario.nombre_completo,
                cedula: Number(datosFormulario.cedula),
                nombre_rol: datosFormulario.nombre_rol,
                prefijo_doc: datosFormulario.prefijo_doc || 'V',
            },
            headers: { Authorization: `Bearer ${token}` },
        });

        if (error) {
            let funcMsg = error.message;
            if (error instanceof FunctionsHttpError) {
                try {
                    const body = await error.context.json();
                    console.error('registrar-usuario error body:', body);
                    funcMsg = body?.error || body?.message || funcMsg;
                } catch {
                    /* ignora */
                }
            }
            if (funcMsg?.includes('Sesión inválida') || funcMsg?.includes('expirada')) {
                this.cerrarSesionExpirada();
                throw new Error('Tu sesión ha expirado. Inicia sesión nuevamente.');
            }
            console.error('registrar-usuario error:', funcMsg);
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
                certificado_expedicion: datosFormulario.certificado_expedicion || null,
                certificado_vencimiento: datosFormulario.certificado_vencimiento,
            });
        }

        if (
            datosFormulario.licencia_numero &&
            datosFormulario.licencia_grado &&
            datosFormulario.licencia_vencimiento
        ) {
            await doInsert('licencias_conducir', {
                usuario_id: usuarioId,
                licencia_numero: datosFormulario.licencia_numero,
                licencia_grado: datosFormulario.licencia_grado,
                licencia_expedicion: datosFormulario.licencia_expedicion || null,
                licencia_vencimiento: datosFormulario.licencia_vencimiento,
            });
        }

        return data;
    }

    async actualizarUsuarioPorRol(datosFormulario: any): Promise<any> {
        let token: string | undefined;
        try {
            const refreshed = await this.supabase.auth.refreshSession();
            token = refreshed.data.session?.access_token;
        } catch {
            this.cerrarSesionExpirada();
            throw new Error('Tu sesión ha expirado. Inicia sesión nuevamente.');
        }
        if (!token) {
            this.cerrarSesionExpirada();
            throw new Error('Tu sesión ha expirado. Inicia sesión nuevamente.');
        }

        const { data, error } = await this.supabase.functions.invoke('actualizar-usuario', {
            body: {
                user_id: datosFormulario.user_id,
                email: datosFormulario.email,
                password: datosFormulario.password || '',
                nombre_completo: datosFormulario.nombre_completo,
                cedula: Number(datosFormulario.cedula),
                nombre_rol: datosFormulario.nombre_rol,
                prefijo_doc: datosFormulario.prefijo_doc || 'V',
                certificado_numero: datosFormulario.certificado_numero,
                certificado_expedicion: datosFormulario.certificado_expedicion,
                certificado_vencimiento: datosFormulario.certificado_vencimiento,
                licencia_numero: datosFormulario.licencia_numero,
                licencia_grado: datosFormulario.licencia_grado,
                licencia_expedicion: datosFormulario.licencia_expedicion,
                licencia_vencimiento: datosFormulario.licencia_vencimiento,
            },
            headers: { Authorization: `Bearer ${token}` },
        });

        if (error) {
            let funcMsg = error.message;
            console.error('actualizar-usuario error:', error);
            if (error instanceof FunctionsHttpError) {
                try {
                    const body = await error.context.json();
                    console.error('actualizar-usuario body:', body);
                    funcMsg = body?.error || body?.message || funcMsg;
                } catch {
                    /* ignora */
                }
            }
            if (funcMsg?.includes('Sesión inválida') || funcMsg?.includes('expirada')) {
                this.cerrarSesionExpirada();
                throw new Error('Tu sesión ha expirado. Inicia sesión nuevamente.');
            }
            throw new Error(funcMsg);
        }

        return data;
    }
}
