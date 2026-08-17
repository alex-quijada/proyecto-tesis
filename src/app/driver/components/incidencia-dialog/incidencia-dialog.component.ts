import { Component, EventEmitter, Output, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';

export interface IncidenciaGuia {
    cliente: string;
    numeroGuia?: string;
    numeroFactura?: string;
}

@Component({
    selector: 'app-incidencia-dialog',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonModule, DialogModule, TextareaModule],
    template: `
        <p-dialog
            [(visible)]="visible"
            [modal]="true"
            [style]="{ width: '95%', maxWidth: '420px' }"
            [draggable]="false"
            [resizable]="false"
            header="Reportar incidencia"
            (onHide)="cancelar()"
        >
            <div class="space-y-3">
                @if (guia) {
                    <div class="bg-surface-50 dark:bg-surface-800 rounded-lg p-3 text-sm">
                        <div class="text-surface-700 dark:text-surface-200 font-semibold">
                            {{ guia.cliente }}
                        </div>
                        <div class="text-xs text-surface-400 font-mono mt-0.5">
                            {{ guia.numeroGuia
                            }}{{ guia.numeroFactura ? ' · ' + guia.numeroFactura : '' }}
                        </div>
                    </div>
                }
                <textarea
                    pTextarea
                    rows="3"
                    placeholder="Describe la incidencia..."
                    [(ngModel)]="texto"
                    styleClass="w-full"
                ></textarea>
            </div>
            <ng-template pTemplate="footer">
                <div class="flex gap-2 w-full">
                    <p-button
                        label="Cancelar"
                        severity="secondary"
                        (onClick)="cancelar()"
                        styleClass="flex-1"
                    />
                    <p-button
                        label="Confirmar"
                        severity="danger"
                        icon="pi pi-exclamation-triangle"
                        [disabled]="!texto.trim()"
                        (onClick)="confirmar()"
                        styleClass="flex-1"
                    />
                </div>
            </ng-template>
        </p-dialog>
    `,
})
export class IncidenciaDialogComponent {
    @Input() guia: IncidenciaGuia | null = null;
    @Output() confirm = new EventEmitter<string>();
    @Output() cancel = new EventEmitter<void>();

    visible = false;
    texto = '';

    open() {
        this.visible = true;
        this.texto = '';
    }

    confirmar() {
        this.visible = false;
        this.confirm.emit(this.texto);
    }

    cancelar() {
        this.visible = false;
        this.cancel.emit();
    }
}
