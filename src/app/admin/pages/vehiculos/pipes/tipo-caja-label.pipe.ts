import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'tipoCajaLabel',
    standalone: true,
})
export class TipoCajaLabelPipe implements PipeTransform {
    transform(tipo: string | undefined | null): string {
        switch ((tipo || '').toLowerCase()) {
            case 'seca':
                return 'Caja Seca';
            case 'plataforma':
                return 'Plataforma Abierta';
            case 'refrigerado':
                return 'Refrigerado';
            case 'articulado':
                return 'Articulado';
            default:
                return 'No Definido';
        }
    }
}
