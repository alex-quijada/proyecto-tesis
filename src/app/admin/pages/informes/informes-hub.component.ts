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
    templateUrl: './informes-hub.component.html',
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
