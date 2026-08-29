import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Medidor de nivel de combustible estilo automóvil: semicírculo E→F.
 * Al hacer clic en el arco emite el valor (0..1) seleccionado.
 */
@Component({
    selector: 'app-tanque-gauge',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div
            class="relative w-full mx-auto select-none"
            [style.maxWidth.px]="ancho()"
            [ngClass]="{ 'cursor-pointer': interactivo() }"
        >
            <svg
                viewBox="0 0 100 60"
                class="w-full h-auto"
                [ngClass]="{ 'cursor-pointer': interactivo() }"
                (click)="interactivo() && onClick($event)"
            >
                <!-- Fondo del semicírculo -->
                <path
                    d="M 10 50 A 40 40 0 0 1 90 50"
                    fill="none"
                    stroke="#e2e8f0"
                    stroke-width="9"
                    stroke-linecap="round"
                />
                <!-- Arco lleno según el nivel -->
                <path
                    [attr.d]="arcPath()"
                    fill="none"
                    [attr.stroke]="color()"
                    stroke-width="9"
                    stroke-linecap="round"
                />
                <!-- Aguja -->
                <line
                    x1="50"
                    y1="50"
                    [attr.x2]="needleX()"
                    [attr.y2]="needleY()"
                    stroke="#334155"
                    stroke-width="2.5"
                    stroke-linecap="round"
                />
                <circle cx="50" cy="50" r="4" fill="#334155" />
            </svg>
            <span class="absolute bottom-1 left-1 text-xs font-bold text-surface-400">E</span>
            <span class="absolute bottom-1 right-1 text-xs font-bold text-surface-400">F</span>
            @if (mostrarPorcentaje()) {
                <div class="text-center text-sm font-bold mt-1" [style.color]="color()">
                    {{ valor() * 100 | number: '1.0-0' }}%
                </div>
            }
        </div>
    `,
})
export class TanqueGaugeComponent {
    valor = input<number>(0);
    color = input<string>('#f59e0b');
    ancho = input<number>(190);
    interactivo = input<boolean>(true);
    mostrarPorcentaje = input<boolean>(true);
    valorChange = output<number>();

    private vv = computed(() => Math.max(0, Math.min(1, this.valor())));

    private puntoArco(v: number): string {
        const ang = Math.PI * (1 - v);
        const x = 50 + 40 * Math.cos(ang);
        const y = 50 - 40 * Math.sin(ang);
        return `${x.toFixed(2)} ${y.toFixed(2)}`;
    }

    readonly arcPath = computed(() => {
        const v = this.vv();
        if (v <= 0) return '';
        return `M 10 50 A 40 40 0 0 1 ${this.puntoArco(v)}`;
    });

    readonly needleX = computed(() => 50 + 26 * Math.cos(Math.PI * (1 - this.vv())));
    readonly needleY = computed(() => 50 - 26 * Math.sin(Math.PI * (1 - this.vv())));

    onClick(event: MouseEvent) {
        const svg = (event.target as SVGElement).closest('svg');
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height * (50 / 60);
        const dx = event.clientX - cx;
        const dy = event.clientY - cy;
        const ang = Math.atan2(-dy, dx);
        const v = Math.max(0, Math.min(1, 1 - ang / Math.PI));
        this.valorChange.emit(v);
    }
}
