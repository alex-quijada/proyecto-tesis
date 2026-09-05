import { Routes } from '@angular/router';
import { AccessPage } from './pages/access-page/access-page';
import { LoginPage } from './pages/login-page/login-page';
import { ErrorPage } from './pages/error-page/error-page';
import { publicGuard } from './guards/auth.guard';

export default [
    { path: 'access', component: AccessPage },
    { path: 'error', component: ErrorPage },
    { path: 'login', component: LoginPage, canActivate: [publicGuard] },
] as Routes;
