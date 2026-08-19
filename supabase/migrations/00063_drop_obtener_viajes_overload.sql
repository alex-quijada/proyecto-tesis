-- ============================================================
-- 00063: eliminar overload redundante de obtener_viajes
--
-- La 00062 creó `obtener_viajes(p_id_chofer uuid DEFAULT NULL)`
-- sin dropear el `obtener_viajes()` anterior. Al quedar ambos
-- overloads, PostgREST responde HTTP 300 (ambiguous) a las
-- llamadas sin parámetros y el dashboard no carga sus cards.
-- El overload con DEFAULT NULL cubre ambos casos de uso.
-- ============================================================

DROP FUNCTION IF EXISTS public.obtener_viajes();
