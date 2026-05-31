import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../service/auth.service';

export const roleGuard: CanActivateFn = async (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    // 1. Verificar sesión activa en Supabase
    const isLogged = await authService.isAuthenticated();
    if (!isLogged) {
        router.navigate(['/login']);
        return false;
    }

    // 2. Validar rol del usuario contra los permitidos en la ruta
    const allowedRoles = route.data['roles'] as Array<string>;
    const userRole = authService.getUserRole();

    if (allowedRoles && userRole && allowedRoles.includes(userRole)) {
        return true; // Acceso concedido
    }

    // 3. Redirección de emergencia si intenta invadir otra zona
    if (userRole === 'Chofer') {
        router.navigate(['/chofer/mis-guias']);
    } else if (userRole === 'Analista') {
        router.navigate(['/analista/dashboard']);
    } else {
        router.navigate(['/login']);
    }

    return false;
};
