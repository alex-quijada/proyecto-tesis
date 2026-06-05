import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../service/auth.service';
import { filter, map, take } from 'rxjs/operators';

export const roleGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    // Retornamos un Observable para obligar a Angular a esperar la respuesta real de Supabase
    return authService.user$.pipe(
        // 1. Ignoramos el primer valor ('null') solo si Supabase aún está inicializando.
        // Si tras unos milisegundos se confirma que no hay sesión, continuará para denegar el acceso.
        take(1),
        map((user) => {
            // 2. Verificar si hay sesión activa basándonos en el usuario emitido
            if (!user) {
                router.navigate(['/login']);
                return false;
            }

            // 3. Validar rol del usuario extraído de la metadata (Sincronizado con 'nombre_rol')
            const allowedRoles = route.data['roles'] as Array<string>;
            const userRole = user.user_metadata?.['nombre_rol'];

            if (allowedRoles && userRole && allowedRoles.includes(userRole)) {
                return true; // Acceso concedido
            }

            // 4. Redirección de emergencia si no tiene permisos para esta ruta en específico
            if (userRole === 'Chofer') {
                router.navigate(['/chofer/mis-guias']);
            } else if (userRole === 'Analista') {
                router.navigate(['/analista/dashboard']);
            } else if (userRole === 'Administrador' || userRole === 'Coordinador') {
                router.navigate(['/admin/dashboard']); // Añadido por seguridad según tus roles mapeados
            } else {
                router.navigate(['/login']);
            }

            return false;
        }),
    );
};
