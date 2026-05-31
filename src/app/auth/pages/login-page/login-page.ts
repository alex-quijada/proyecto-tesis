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
            // 1. Esperar a que Supabase autentique al usuario
            await this.authService.login(email!, password!);

            // 2. Obtener el rol desde la metadata que configuramos en el AuthService
            const userRole = this.authService.getUserRole();

            // 3. Redirección inteligente inmediata
            if (userRole === 'Chofer') {
                this.router.navigate(['/chofer/mis-guias']);
            } else if (userRole === 'Analista' || userRole === 'Administrador') {
                this.router.navigate(['/analista/dashboard']);
            } else {
                // Si el usuario no tiene rol asignado en la metadata de Supabase
                console.warn('Usuario sin rol logístico asignado.');
                this.router.navigate(['/']);
            }
        } catch (error) {
            console.error('Error en el inicio de sesión:', error);
            this.hasError.set(true);
        } finally {
            this.isPosting.set(false);
        }
    }
}
