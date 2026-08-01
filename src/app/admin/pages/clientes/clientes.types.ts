import { PrefijoDoc } from '../rutas/models/pdf-data.model';

export interface DocumentoIdentidad {
    prefijo: PrefijoDoc;
    numero: string;
}

export interface ReglasSucursal {
    horaDesde?: string;
    horaHasta?: string;
    diasRecepcion?: string[];
    requiereCita?: boolean;
    instrucciones?: string;
}

export interface SucursalCliente {
    id?: string;
    direccion?: string;
    puntoDeReferencia?: string;
    idMunicipio?: string;
    telefonoContacto?: string;
    nombreContacto?: string;
    reglas?: ReglasSucursal;
    latitud?: number;
    longitud?: number;
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
    idPrioridad?: string;
    prioridad?: string;
    sucursales?: SucursalCliente[];
}
