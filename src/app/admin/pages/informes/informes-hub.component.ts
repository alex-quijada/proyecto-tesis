import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

interface ReporteCard {
    ruta: string;
    icono: string;
    titulo: string;
    descripcion: string;
    color: string;
}

@Component({
    selector: 'app-informes-hub',
    standalone: true,
    imports: [CommonModule, RouterModule],
    template: `
        <div class="card">
            <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-0 mb-1">
                Informes y Reportes
            </h1>
            <p class="text-sm text-muted-color mb-6">
                Análisis operativos y financieros del sistema de distribución.
            </p>

            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                @for (r of reportes; track r.ruta) {
                    <a
                        [routerLink]="r.ruta"
                        class="group rounded-xl border border-surface-200 dark:border-surface-700 p-5 flex flex-col gap-3 hover:shadow-lg hover:border-primary transition-all bg-surface-50 dark:bg-surface-900/40"
                    >
                        <div
                            class="w-12 h-12 rounded-lg flex items-center justify-center text-xl"
                            [ngClass]="r.color"
                        >
                            <i [class]="r.icono"></i>
                        </div>
                        <div>
                            <div class="font-semibold text-surface-800 dark:text-surface-100">
                                {{ r.titulo }}
                            </div>
                            <p class="text-xs text-muted-color mt-1 leading-relaxed">
                                {{ r.descripcion }}
                            </p>
                        </div>
                        <span
                            class="text-xs font-medium text-primary flex items-center gap-1 mt-auto"
                        >
                            Abrir reporte <i class="pi pi-arrow-right text-[10px]"></i>
                        </span>
                    </a>
                }
            </div>
        </div>
    `,
})
export class InformesHubComponent {
    reportes: ReporteCard[] = [
        {
            ruta: 'eficiencia',
            icono: 'pi pi-chart-line',
            titulo: 'Eficiencia',
            descripcion:
                'Entregas, incidencias, tiempos por etapa y eficiencia de ruta (planificada vs real).',
            color: 'bg-blue-100 dark:bg-blue-400/10 text-blue-500',
        },
        {
            ruta: 'operaciones',
            icono: 'pi pi-box',
            titulo: 'Operaciones',
            descripcion:
                'Detalle de entregas filtrable por fecha, chofer, municipio, empresa y estado.',
            color: 'bg-cyan-100 dark:bg-cyan-400/10 text-cyan-500',
        },
        {
            ruta: 'incidencias',
            icono: 'pi pi-exclamation-triangle',
            titulo: 'Incidencias',
            descripcion:
                'Conteos por tipo y chofer, recuperables vs terminales, resueltas y monto afectado.',
            color: 'bg-red-100 dark:bg-red-400/10 text-red-500',
        },
        {
            ruta: 'gastos',
            icono: 'pi pi-money-bill',
            titulo: 'Gastos',
            descripcion:
                'Combustible y mantenimiento por vehículo, costos por tipo y costo por km.',
            color: 'bg-green-100 dark:bg-green-400/10 text-green-500',
        },
    ];
}
