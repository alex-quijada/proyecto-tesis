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
            await this.authService.login(email!, password!);

            this.router.navigateByUrl('/');
        } catch (error) {
            console.error(error);
            this.hasError.set(true);
        } finally {
            this.isPosting.set(false);
        }
    }
}
