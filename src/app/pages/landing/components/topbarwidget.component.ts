import { Component } from '@angular/core';
import { StyleClassModule } from 'primeng/styleclass';
import { Router, RouterModule } from '@angular/router';
import { RippleModule } from 'primeng/ripple';
import { ButtonModule } from 'primeng/button';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'topbar-widget',
    standalone: true,
    imports: [CommonModule, RouterModule, StyleClassModule, ButtonModule, RippleModule],
    template: `
        <a class="flex items-center gap-3 cursor-pointer" routerLink="/">
            <div
                class="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-surface-0 shadow-md p-1.5"
            >
                <img
                    src="/pictures/Brandia-icon.svg"
                    alt="BrandIA"
                    class="w-full h-full object-contain brightness-0 invert"
                />
            </div>
            <span class="text-surface-900 dark:text-surface-0 font-bold text-2xl tracking-tight"
                >BrandIA</span
            >
        </a>

        <a
            pButton
            [text]="true"
            severity="secondary"
            [rounded]="true"
            pRipple
            class="lg:hidden!"
            pStyleClass="@next"
            enterFromClass="hidden"
            leaveToClass="hidden"
            [hideOnOutsideClick]="true"
        >
            <i class="pi pi-bars text-2xl!"></i>
        </a>

        <div
            class="items-center bg-surface-0 dark:bg-surface-900 grow justify-between hidden lg:flex absolute lg:static w-full left-0 top-full px-12 lg:px-0 z-20 rounded-border shadow-md lg:shadow-none"
        >
            <ul
                class="list-none p-0 m-0 flex lg:items-center select-none flex-col lg:flex-row cursor-pointer gap-8"
            >
                <li>
                    <a
                        (click)="router.navigate(['/landing'], { fragment: 'home' })"
                        pRipple
                        class="px-0 py-4 text-surface-900 dark:text-surface-0 font-medium text-lg hover:text-primary transition-colors"
                    >
                        <span>Inicio</span>
                    </a>
                </li>
                <li>
                    <a
                        (click)="router.navigate(['/landing'], { fragment: 'features' })"
                        pRipple
                        class="px-0 py-4 text-surface-900 dark:text-surface-0 font-medium text-lg hover:text-primary transition-colors"
                    >
                        <span>Módulos</span>
                    </a>
                </li>
                <li>
                    <a
                        (click)="router.navigate(['/landing'], { fragment: 'highlights' })"
                        pRipple
                        class="px-0 py-4 text-surface-900 dark:text-surface-0 font-medium text-lg hover:text-primary transition-colors"
                    >
                        <span>Plataformas</span>
                    </a>
                </li>
                <li>
                    <a
                        (click)="router.navigate(['/landing'], { fragment: 'impacto' })"
                        pRipple
                        class="px-0 py-4 text-surface-900 dark:text-surface-0 font-medium text-lg hover:text-primary transition-colors"
                    >
                        <span>Impacto y Métricas</span>
                    </a>
                </li>
            </ul>
            <div class="flex border-t lg:border-t-0 border-surface py-4 lg:py-0 mt-4 lg:mt-0 gap-3">
                <p-button
                    label="Ingresar al Sistema"
                    icon="pi pi-sign-in"
                    routerLink="/"
                    [rounded]="true"
                    severity="primary"
                />
            </div>
        </div>
    `,
})
export class TopbarWidget {
    constructor(public router: Router) {}
}
