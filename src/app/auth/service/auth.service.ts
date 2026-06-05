import { environment } from '@/environments/environment';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    private supabase: SupabaseClient;
    private router = inject(Router);

    private userSubject = new BehaviorSubject<User | null>(null);
    public user$ = this.userSubject.asObservable();

    constructor() {
        // Inicializar el cliente de Supabase
        this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);

        // Escuchar cambios en el estado de la sesión automáticamente (Login, Logout, Refresh)
        this.supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                this.userSubject.next(session.user);
            } else {
                this.userSubject.next(null);
            }
        });
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
}
