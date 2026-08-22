import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { AppConnectivityBanner } from './app/layout/component/app.connectivity-banner';
import { NotificationService } from './app/services/notification.service';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterModule, AppConnectivityBanner, ToastModule],
    template: `
        <app-connectivity-banner />
        <p-toast [position]="notif.posicion()" />
        <router-outlet></router-outlet>
    `,
})
export class AppComponent {
    protected notif = inject(NotificationService);
}