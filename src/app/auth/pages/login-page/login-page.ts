import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { CheckboxModule } from 'primeng/checkbox';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../service/auth.service';
import { AppFloatingConfigurator } from '@/app/layout/component/app.floatingconfigurator';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [
        ReactiveFormsModule,
        InputTextModule,
        PasswordModule,
        CheckboxModule,
        ButtonModule,
        AppFloatingConfigurator,
    ],
    templateUrl: './login-page.html',
})
export class LoginPage {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);
    private router = inject(Router);

    hasError = signal(false);
    isPosting = signal(false);

    loginForm = this.fb.group({
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(6)]],
        rememberMe: [false],
    });

    async onSubmit() {
        if (this.loginForm.invalid) {
            this.loginForm.markAllAsTouched();
            this.hasError.set(true);
            return;
        }

        this.hasError.set(false);
        this.isPosting.set(true);

        const { email, password } = this.loginForm.getRawValue();

        try {
            // 1. Esperar a que Supabase autentique al usuario y nos devuelva sus datos
            const data = await this.authService.login(email!, password!);

            // 2. Extraemos el rol directamente del usuario retornado por la promesa de login
            // Esto evita problemas de sincronización con el BehaviorSubject
            const userRole = data.user?.user_metadata?.['nombre_rol'];

            // 3. Redirección inteligente adaptada a tus rutas reales (appRoutes)
            if (userRole === 'Chofer') {
                // Redirige a la vista móvil del chofer
                this.router.navigate(['/driver']);
            } else if (
                userRole === 'Analista' ||
                userRole === 'Coordinador' ||
                userRole === 'Administrador'
            ) {
                // Redirige al panel administrativo principal gestionado por AppLayout (dashboard)
                this.router.navigate(['/']);
            } else {
                // Caso alternativo de seguridad
                console.warn('Usuario sin rol logístico asignado válido.');
                this.router.navigate(['/notfound']);
            }
        } catch (error) {
            console.error('Error en el inicio de sesión:', error);
            this.hasError.set(true);
        } finally {
            this.isPosting.set(false);
        }
    }
}
