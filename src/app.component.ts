import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AppConnectivityBanner } from './app/layout/component/app.connectivity-banner';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterModule, AppConnectivityBanner],
    template: `
        <app-connectivity-banner />
        <router-outlet></router-outlet>
    `,
})
export class AppComponent {}
