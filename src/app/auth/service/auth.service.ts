import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseClient, User } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { Usuario } from '../../admin/pages/usuarios/data/usuarios-mock';
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
        this.initializationPromise = this.supabase.auth.getSession().then(({ data: { session } }) => {
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

    /**
     * REGISTRO DE NUEVOS USUARIOS (Choferes, Analistas, etc.)
     * Envía las propiedades requeridas en 'options.data' para que las procese el Trigger de la DB.
     */
    async register(
        email: string,
        password: string,
        nombreCompleto: string,
        cedula: number,
        nombreRol: 'Administrador' | 'Coordinador' | 'Analista' | 'Chofer' | 'Ayudante',
    ) {
        const { data, error } = await this.supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    nombre_completo: nombreCompleto,
                    cedula: cedula,
                    nombre_rol: nombreRol, // Mismo nombre que espera el COALESCE del trigger
                },
            },
        });

        if (error) throw error;
        return data;
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
        this.router.navigate(['/login']);
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
        Administrador: 'ADMIN',
        Coordinador: 'ADMIN',
        Analista: 'ANALISTA',
        Chofer: 'CHOFER',
        Ayudante: 'AYUDANTE',
    };

    async listarUsuarios(): Promise<Usuario[]> {
        const { data, error } = await this.supabase
            .from('usuarios')
            .select(`
                id_usuario,
                email,
                nombre_completo,
                cedula,
                roles ( nombre_rol )
            `)
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

    async eliminarUsuario(id: string): Promise<void> {
        const { error } = await this.supabase
            .from('usuarios')
            .delete()
            .eq('id_usuario', id);

        if (error) throw new Error(`Error al eliminar usuario: ${error.message}`);
    }
}
