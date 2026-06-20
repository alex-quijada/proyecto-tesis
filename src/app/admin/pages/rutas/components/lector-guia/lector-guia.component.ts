import { Component } from '@angular/core';
import { DatosGuia } from '../../models/pdf-data.model';
import { PdfNormalizerService } from '../../services/pdf-parse.service';
@Component({
    selector: 'app-lector-guia',
    templateUrl: './lector-guia.component.html',
})
export class LectorGuiaComponent {
    public guiaProcesada!: DatosGuia;

    constructor(private pdfNormalizerService: PdfNormalizerService) {}

    async onFileSelected(event: any) {
        const file: File = event.target.files[0];
        if (!file) return;

        try {
            // Llamamos a la función encargada de leer y normalizar todo
            this.guiaProcesada = await this.pdfNormalizerService.procesarArchivoPdf(file);

            // Ya tienes tus datos limpios aquí 🚀
            console.log('Datos de la Guía listos y normalizados:', this.guiaProcesada);
        } catch (error) {
            console.error('Ocurrió un error al procesar el documento PDF:', error);
        }
    }
}
