import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';

@Component({
    selector: 'app-error-state-widget',
    standalone: true,
    imports: [CommonModule, ButtonModule],
    template: `
        <div
            class="flex flex-col items-center justify-center text-center rounded-2xl border border-surface-200 dark:border-surface-800 bg-surface-50/50 dark:bg-surface-900/50 transition-all"
            [class.p-8]="!compact()"
            [class.p-4]="compact()"
            [class.min-h-[220px]]="!compact()"
        >
            <div
                class="rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mb-3 shrink-0"
                [class.w-14]="!compact()"
                [class.h-14]="!compact()"
                [class.w-10]="compact()"
                [class.h-10]="compact()"
            >
                <i [class]="icon()" [class.text-2xl]="!compact()" [class.text-lg]="compact()"></i>
            </div>

            <h4
                class="font-bold text-surface-900 dark:text-surface-0 m-0 mb-1"
                [class.text-lg]="!compact()"
                [class.text-sm]="compact()"
            >
                {{ title() }}
            </h4>

            <p
                class="text-surface-600 dark:text-surface-400 m-0 max-w-md"
                [class.text-sm]="!compact()"
                [class.text-xs]="compact()"
                [class.mb-4]="showRetry()"
            >
                {{ message() }}
            </p>

            @if (showRetry()) {
                <p-button
                    [label]="retryLabel()"
                    icon="pi pi-refresh"
                    (onClick)="retry.emit()"
                    [rounded]="true"
                    severity="danger"
                    [outlined]="true"
                    [size]="compact() ? 'small' : 'small'"
                />
            }
        </div>
    `,
})
export class ErrorStateWidgetComponent {
    title = input<string>('No se pudieron cargar los datos');
    message = input<string>('Ocurrió un problema temporal al consultar la información.');
    icon = input<string>('pi pi-exclamation-triangle');
    retryLabel = input<string>('Reintentar');
    showRetry = input<boolean>(true);
    compact = input<boolean>(false);

    retry = output<void>();
}
