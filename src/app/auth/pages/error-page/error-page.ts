import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { RippleModule } from 'primeng/ripple';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-error',
    imports: [CommonModule, ButtonModule, RippleModule, RouterModule],
    standalone: true,
    templateUrl: './error-page.html',
})
export class ErrorPage {
    reintentar() {
        window.location.reload();
    }
}
