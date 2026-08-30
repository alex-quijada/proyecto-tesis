import {
    Component,
    EventEmitter,
    Output,
    Input,
    ViewChild,
    ElementRef,
    AfterViewInit,
    signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { CheckboxModule } from 'primeng/checkbox';
import { DividerModule } from 'primeng/divider';

@Component({
    selector: 'app-firma-dialog',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ButtonModule,
        DialogModule,
        InputTextModule,
        CheckboxModule,
        DividerModule,
    ],
    template: `
        <p-dialog
            [(visible)]="visible"
            [modal]="true"
            [style]="{ width: '95%', maxWidth: '420px' }"
            [draggable]="false"
            [resizable]="false"
            [closable]="false"
            [dismissableMask]="false"
            styleClass="firma-dialog"
            [breakpoints]="{ '480px': '95vw' }"
        >
            <ng-template pTemplate="header">
                <div class="flex items-center gap-2 w-full">
                    <i class="pi pi-pen text-primary text-xl"></i>
                    <span class="font-semibold text-sm">Firma de Entrega</span>
                </div>
            </ng-template>

            <div class="space-y-4">
                <!-- Guia info -->
                <div class="bg-surface-50 dark:bg-surface-800 rounded-lg p-3 text-sm">
                    <div class="flex justify-between mb-1">
                        <span class="text-surface-400">Guía:</span>
                        <span class="font-mono font-semibold">{{ guia?.numeroGuia }}</span>
                    </div>
                    <div class="flex justify-between mb-1">
                        <span class="text-surface-400">Cliente:</span>
                        <span class="font-semibold">{{ guia?.cliente }}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-surface-400">Monto:</span>
                        <span class="font-semibold text-primary">{{
                            guia?.precioCarga | currency: 'USD' : 'symbol' : '1.0-0'
                        }}</span>
                    </div>
                </div>

                <!-- Checklist -->
                <div class="space-y-2">
                    <span class="text-xs font-semibold text-surface-400 uppercase tracking-wider"
                        >Checklist de entrega</span
                    >
                    @for (item of checklistItems; track item.id) {
                        <label
                            class="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800 cursor-pointer"
                        >
                            <p-checkbox [(ngModel)]="item.checked" [binary]="true" />
                            <span
                                class="text-sm"
                                [ngClass]="{ 'line-through text-surface-400': item.checked }"
                                >{{ item.label }}</span
                            >
                        </label>
                    }
                </div>

                <p-divider />

                <!-- Signature pad -->
                <div>
                    <span
                        class="text-xs font-semibold text-surface-400 uppercase tracking-wider block mb-2"
                        >Firma del cliente</span
                    >
                    <div
                        class="relative border-2 border-dashed border-surface-300 dark:border-surface-600 rounded-xl overflow-hidden bg-white"
                        [ngClass]="{ 'border-primary border-solid': isDrawing }"
                    >
                        <canvas
                            #signatureCanvas
                            width="360"
                            height="160"
                            class="w-full touch-none cursor-crosshair"
                            (mousedown)="startDrawing($event)"
                            (mousemove)="draw($event)"
                            (mouseup)="stopDrawing()"
                            (mouseleave)="stopDrawing()"
                            (touchstart)="onTouchStart($event)"
                            (touchmove)="onTouchMove($event)"
                            (touchend)="stopDrawing()"
                        >
                        </canvas>
                        @if (!hasSignature) {
                            <div
                                class="absolute inset-0 flex items-center justify-center pointer-events-none"
                            >
                                <span class="text-surface-300 text-sm">Firme aquí</span>
                            </div>
                        }
                    </div>
                    <div class="flex justify-between mt-2">
                        <span class="text-xs text-surface-400">Firma digital del cliente</span>
                        <button
                            class="text-xs text-primary font-semibold hover:underline cursor-pointer bg-transparent border-none"
                            (click)="clearSignature()"
                        >
                            Limpiar
                        </button>
                    </div>
                </div>

                <!-- Observations -->
                <div>
                    <span
                        class="text-xs font-semibold text-surface-400 uppercase tracking-wider block mb-2"
                        >Observaciones (opcional)</span
                    >
                    <textarea
                        [(ngModel)]="observaciones"
                        class="w-full border border-surface-300 dark:border-surface-600 rounded-lg p-2 text-sm bg-transparent resize-none"
                        rows="2"
                        placeholder="Notas sobre la entrega..."
                    ></textarea>
                </div>
            </div>

            <ng-template pTemplate="footer">
                <div class="flex gap-2 w-full">
                    <p-button
                        label="Cancelar"
                        severity="danger"
                        (onClick)="cancelar()"
                        styleClass="flex-1"
                    />
                    <p-button
                        label="Confirmar Entrega"
                        icon="pi pi-check"
                        severity="success"
                        [disabled]="!hasSignature || !checklistCompleto"
                        (onClick)="confirmar()"
                        styleClass="flex-1"
                    />
                </div>
            </ng-template>
        </p-dialog>
    `,
    styles: `
        :host .firma-dialog .p-dialog-content {
            padding: 1.25rem;
        }

        canvas {
            display: block;
            max-width: 100%;
        }

        textarea {
            font-family: inherit;
        }

        textarea:focus {
            outline: none;
            border-color: var(--p-primary-color);
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--p-primary-color) 20%, transparent);
        }
    `,
})
export class FirmaDialogComponent implements AfterViewInit {
    @Input() guia: any = null;
    @Output() confirm = new EventEmitter<{ firma: string; observaciones: string }>();
    @Output() cancel = new EventEmitter<void>();

    @ViewChild('signatureCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

    visible = false;
    isDrawing = signal(false);
    hasSignature = false;
    observaciones = '';

    private ctx!: CanvasRenderingContext2D;
    private lastX = 0;
    private lastY = 0;

    checklistItems = [
        { id: 'c1', label: 'Carga verificada contra factura', checked: false },
        { id: 'c2', label: 'Documentos en orden', checked: false },
        { id: 'c3', label: 'Productos en buen estado', checked: false },
        { id: 'c4', label: 'Cliente notificado', checked: false },
    ];

    get checklistCompleto(): boolean {
        return this.checklistItems.every((i) => i.checked);
    }

    ngAfterViewInit() {
        const canvas = this.canvasRef.nativeElement;
        this.ctx = canvas.getContext('2d')!;
        this.ctx.strokeStyle = '#1e293b';
        this.ctx.lineWidth = 2.5;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
    }

    open() {
        this.visible = true;
        this.hasSignature = false;
        this.observaciones = '';
        this.checklistItems.forEach((i) => (i.checked = false));
        setTimeout(() => this.clearCanvas(), 100);
    }

    private clearCanvas() {
        const canvas = this.canvasRef?.nativeElement;
        if (!canvas) return;
        const ctx = this.ctx;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        this.hasSignature = false;
    }

    clearSignature() {
        this.clearCanvas();
    }

    private getCanvasPos(clientX: number, clientY: number) {
        const rect = this.canvasRef.nativeElement.getBoundingClientRect();
        const scaleX = this.canvasRef.nativeElement.width / rect.width;
        const scaleY = this.canvasRef.nativeElement.height / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY,
        };
    }

    startDrawing(e: MouseEvent) {
        this.isDrawing.set(true);
        const pos = this.getCanvasPos(e.clientX, e.clientY);
        this.lastX = pos.x;
        this.lastY = pos.y;
        this.hasSignature = true;
    }

    draw(e: MouseEvent) {
        if (!this.isDrawing()) return;
        const pos = this.getCanvasPos(e.clientX, e.clientY);
        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        this.ctx.lineTo(pos.x, pos.y);
        this.ctx.stroke();
        this.lastX = pos.x;
        this.lastY = pos.y;
    }

    stopDrawing() {
        this.isDrawing.set(false);
    }

    onTouchStart(e: TouchEvent) {
        e.preventDefault();
        const touch = e.touches[0];
        this.isDrawing.set(true);
        const pos = this.getCanvasPos(touch.clientX, touch.clientY);
        this.lastX = pos.x;
        this.lastY = pos.y;
        this.hasSignature = true;
    }

    onTouchMove(e: TouchEvent) {
        e.preventDefault();
        if (!this.isDrawing()) return;
        const touch = e.touches[0];
        const pos = this.getCanvasPos(touch.clientX, touch.clientY);
        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        this.ctx.lineTo(pos.x, pos.y);
        this.ctx.stroke();
        this.lastX = pos.x;
        this.lastY = pos.y;
    }

    confirmar() {
        const firma = this.canvasRef.nativeElement.toDataURL('image/png');
        this.visible = false;
        this.confirm.emit({ firma, observaciones: this.observaciones });
    }

    cancelar() {
        this.visible = false;
        this.cancel.emit();
    }
}
