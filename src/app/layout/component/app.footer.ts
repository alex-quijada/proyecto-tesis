import { Component } from '@angular/core';

@Component({
    standalone: true,
    selector: 'app-footer',
    template: `<div class="layout-footer flex items-center justify-between text-xs text-surface-500 dark:text-surface-400">
        <span>BrandIA &copy; 2026 — Sistema de Gestión y Despacho Logístico</span>
        <span class="font-medium text-surface-400 dark:text-surface-500">Isla de Margarita, Nva. Esparta</span>
    </div>`,
})
export class AppFooter {}
