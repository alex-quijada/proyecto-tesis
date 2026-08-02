import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../service/auth.service';

export const roleGuard: CanActivateFn = async (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    await authService.waitForInitialization();

    const user = authService.getCurrentUser();

    if (!user) {
        return router.parseUrl('/');
    }

    const allowedRoles = (route.data['roles'] as Array<string>).map((r) => r.toLowerCase());
    const userRole = user.user_metadata?.['nombre_rol'];
    const normalizedRole = userRole ? String(userRole).toLowerCase() : '';

    if (allowedRoles && normalizedRole && allowedRoles.includes(normalizedRole)) {
        return true;
    }

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

    return router.parseUrl('/');
};
