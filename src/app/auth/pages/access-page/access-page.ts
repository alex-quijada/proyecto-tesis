import { Component, computed, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { RippleModule } from 'primeng/ripple';
import { CommonModule } from '@angular/common';
import { AuthService } from '@/app/auth/service/auth.service';

@Component({
    selector: 'app-access',
    standalone: true,
    imports: [CommonModule, ButtonModule, RouterModule, RippleModule],
    templateUrl: './access-page.html',
})
export class AccessPage {
    private authService = inject(AuthService);

    readonly userRole = computed(() => this.authService.getUserRole());

    readonly destino = computed(() => {
        const role = this.userRole();
        if (role === 'Chofer') {
            return { ruta: '/driver', label: 'Ir a Mis Entregas', icon: 'pi pi-truck' };
        }
        if (role === 'Administrador' || role === 'Analista' || role === 'Coordinador') {
            return { ruta: '/app', label: 'Ir al Panel Principal', icon: 'pi pi-th-large' };
        }
        return { ruta: '/', label: 'Iniciar Sesión', icon: 'pi pi-sign-in' };
    });

    cerrarSesion() {
        void this.authService.logout();
    }
}
