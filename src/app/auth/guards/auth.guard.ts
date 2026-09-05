import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../service/auth.service';

/**
 * Guard para páginas públicas (como el Login).
 * Si el usuario YA está autenticado, lo redirige automáticamente a su sección correspondiente
 * (/driver para choferes o /app para personal interno/administración).
 * Si NO está autenticado, permite el acceso a la página de login.
 */
export const publicGuard: CanActivateFn = async (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    await authService.waitForInitialization();

    const user = authService.getCurrentUser();

    if (!user) {
        return true;
    }

    const userRole = user.user_metadata?.['nombre_rol'];
    const normalizedRole = userRole ? String(userRole).toLowerCase() : '';

    if (normalizedRole === 'chofer') {
        return router.parseUrl('/driver');
    }

    if (
        normalizedRole === 'analista' ||
        normalizedRole === 'administrador' ||
        normalizedRole === 'coordinador'
    ) {
        return router.parseUrl('/app');
    }

    // Si tiene usuario pero rol no reconocido, permite el acceso al login
    return true;
};

/**
 * Guard para rutas privadas generales que requieran estar autenticado.
 * Si NO está autenticado, redirige a la página de login.
 */
export const authGuard: CanActivateFn = async (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    await authService.waitForInitialization();

    const user = authService.getCurrentUser();

    if (!user) {
        return router.parseUrl('/');
    }

    return true;
};
