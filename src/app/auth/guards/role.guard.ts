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

    const allowedRoles = route.data['roles'] as Array<string>;
    const userRole = user.user_metadata?.['nombre_rol'];

    if (allowedRoles && userRole && allowedRoles.includes(userRole)) {
        return true;
    }

    if (userRole === 'Chofer') {
        return router.parseUrl('/driver');
    }

    if (userRole === 'Analista' || userRole === 'Administrador' || userRole === 'Coordinador') {
        return router.parseUrl('/app');
    }

    return router.parseUrl('/');
};
