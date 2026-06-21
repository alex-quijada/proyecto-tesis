export interface DocumentoIdentidad {
    prefijo: string;
    numero: string;
}

export interface ReglasCliente {
    horarioDesde?: string;
    horarioHasta?: string;
    diasRecepcion?: string[];
    requiereCita?: boolean;
    instrucciones?: string;
}

export interface Cliente {
    id?: string;
    idCliente?: string;
    idPrefijo?: string;
    documentoIdentidad?: DocumentoIdentidad;
    nombreComercial?: string;
    telefono?: string;
    correo?: string;
    personaContacto?: string;
    reglas?: ReglasCliente;
    idPrioridad?: string;
    prioridad?: string;
    ubicaciones?: UbicacionResumen[];
}

export interface UbicacionResumen {
    id?: string;
    idUbicacion?: string;
    direccion?: string;
    municipio?: string;
    idMunicipio?: string;
    referencia?: string;
    pais?: string;
    estado?: string;
    nombreContacto?: string;
    telefonoContacto?: string;
    reglas?: ReglasCliente;
}
