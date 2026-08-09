import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ButtonModule } from 'primeng/button';

import { DriverStoreService } from '../../services/driver-store.service';

@Component({
    selector: 'app-perfil',
    standalone: true,
    imports: [CommonModule, ButtonModule],
    templateUrl: './perfil.component.html',
})
export class PerfilComponent {
    store = inject(DriverStoreService);
}
