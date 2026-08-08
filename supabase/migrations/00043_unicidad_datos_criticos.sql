-- ==========================================
-- 00043: Restricciones de unicidad en datos críticos
--
-- Se agregan constraints UNIQUE a los campos que identifican de forma
-- inequívoca un registro:
--   - clientes.numero_doc            -> UNIQUE
--   - clientes.correo                -> UNIQUE parcial (NULL o '' permitidos)
--   - facturas.num_factura           -> UNIQUE
--   - guias_carga.codigo_guia        -> UNIQUE
--
-- (usuarios.cedula/email, vehiculos.placa y
--  licencias_conducir.licencia_numero ya existían en el remoto.)
--
-- Antes de crear las constraints se limpian los duplicados de datos de
-- prueba presentes solo en el remoto:
--   - clientes con numero_doc repetido: se conserva el que más facturas
--     tenga (sucursales caen en cascada al borrar el cliente).
--   - correo vacío ('') -> NULL (excluido por la constraint parcial).
--   - guias_carga con codigo_guia repetido: se conserva la más reciente
--     (fecha_despacho DESC) con más facturas; el resto se elimina junto a
--     sus facturas (historial_estados_factura cae en cascada).
-- ==========================================

-- --- Limpieza: clientes con numero_doc duplicado ---
DELETE FROM public.clientes c
USING (
    SELECT c2.ctid,
           row_number() OVER (
               PARTITION BY c2.numero_doc
               ORDER BY (
                   SELECT count(*)
                   FROM public.sucursales_cliente sc
                   JOIN public.facturas f ON f.id_sucursal = sc.id
                   WHERE sc.cliente_id = c2.id_cliente
               ) DESC,
               c2.ctid
           ) AS rn
    FROM public.clientes c2
    WHERE c2.numero_doc IN (
        SELECT numero_doc
        FROM public.clientes
        GROUP BY numero_doc
        HAVING count(*) > 1
    )
) d
WHERE c.ctid = d.ctid AND d.rn > 1;

-- --- Limpieza: correos vacíos -> NULL (la constraint parcial los excluye) ---
UPDATE public.clientes
SET correo = NULL
WHERE correo IS NOT NULL AND correo = '';

-- --- Limpieza: facturas de guías duplicadas ---
DELETE FROM public.facturas
WHERE id_guia IN (
    SELECT id_guia
    FROM (
        SELECT g.id_guia,
               row_number() OVER (
                   PARTITION BY g.codigo_guia
                   ORDER BY g.fecha_despacho DESC,
                            (SELECT count(*) FROM public.facturas f WHERE f.id_guia = g.id_guia) DESC,
                            g.id_guia
               ) AS rn
        FROM public.guias_carga g
        WHERE g.codigo_guia IN (
            SELECT codigo_guia
            FROM public.guias_carga
            GROUP BY codigo_guia
            HAVING count(*) > 1
        )
    ) d
    WHERE d.rn > 1
);

-- --- Limpieza: guías duplicadas (conservar una por codigo_guia) ---
DELETE FROM public.guias_carga g
USING (
    SELECT g2.id_guia,
           row_number() OVER (
               PARTITION BY g2.codigo_guia
               ORDER BY g2.fecha_despacho DESC,
                        (SELECT count(*) FROM public.facturas f WHERE f.id_guia = g2.id_guia) DESC,
                        g2.id_guia
           ) AS rn
    FROM public.guias_carga g2
    WHERE g2.codigo_guia IN (
        SELECT codigo_guia
        FROM public.guias_carga
        GROUP BY codigo_guia
        HAVING count(*) > 1
    )
) d
WHERE g.id_guia = d.id_guia AND d.rn > 1;

-- --- Constraints ---
ALTER TABLE public.clientes
    ADD CONSTRAINT clientes_numero_doc_key UNIQUE (numero_doc);

CREATE UNIQUE INDEX clientes_correo_key
    ON public.clientes (correo)
    WHERE correo IS NOT NULL AND correo <> '';

ALTER TABLE public.facturas
    ADD CONSTRAINT facturas_num_factura_key UNIQUE (num_factura);

ALTER TABLE public.guias_carga
    ADD CONSTRAINT guias_carga_codigo_guia_key UNIQUE (codigo_guia);
