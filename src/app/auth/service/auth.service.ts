import { Injectable, computed, signal } from '@angular/core';
import { supabase } from '../../core/supabase.client';

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    private _user = signal<any | null>(null);

    user = this._user.asReadonly();

    authStatus = computed(() => (this._user() ? 'authenticated' : 'not-authenticated'));

    constructor() {
        supabase.auth.getSession().then(({ data }) => {
            this._user.set(data.session?.user ?? null);
        });

        supabase.auth.onAuthStateChange((event, session) => {
            this._user.set(session?.user ?? null);
        });
    }

    async login(email: string, password: string) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            throw error;
        }

        this._user.set(data.user);
    }

    async logout() {
        await supabase.auth.signOut();
        this._user.set(null);
    }
}
