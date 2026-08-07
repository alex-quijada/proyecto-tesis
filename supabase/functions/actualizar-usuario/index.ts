import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Falta la cabecera de autorización' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const token = authHeader.replace('Bearer ', '');
        const {
            data: { user },
            error: authError,
        } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Sesión inválida o expirada' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const { data: userData, error: userError } = await supabaseAdmin
            .from('usuarios')
            .select('id_usuario, roles!usuarios_id_rol_fkey(nombre_rol)')
            .eq('id_usuario', user.id)
            .single();

        const nombreRolOperador = userData?.roles?.nombre_rol;
        if (userError || nombreRolOperador?.toLowerCase() !== 'administrador') {
            return new Response(
                JSON.stringify({
                    error: 'Acceso denegado: Se requiere rol de Administrador.',
                    detalles: userError ? userError.message : `Rol: ${nombreRolOperador}`,
                }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
        }

        const body = await req.json();
        const {
            user_id,
            email,
            password,
            nombre_completo,
            cedula,
            nombre_rol,
            prefijo_doc,
            certificado_numero,
            certificado_expedicion,
            licencia_numero,
            licencia_grado,
            licencia_expedicion,
        } = body;

        if (!user_id) {
            return new Response(JSON.stringify({ error: 'Falta el campo user_id.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const ROLES_VALIDOS = ['Administrador', 'Coordinador', 'Analista', 'Chofer', 'Ayudante'];
        const nombreRolNormalizado =
            ROLES_VALIDOS.find((r) => r.toLowerCase() === String(nombre_rol).toLowerCase()) ??
            String(nombre_rol);

        const userMetadata: Record<string, any> = {};
        if (nombre_rol) userMetadata.nombre_rol = nombreRolNormalizado;
        if (nombre_completo) userMetadata.nombre_completo = nombre_completo;
        if (cedula) userMetadata.cedula = cedula;
        if (prefijo_doc) userMetadata.prefijo_doc = prefijo_doc;
        const updatePayload: any = { email, user_metadata: userMetadata };

        if (password && password.trim() !== '') {
            updatePayload.password = password;
        }

        const { data: updatedUser, error: updateError } =
            await supabaseAdmin.auth.admin.updateUserById(user_id, updatePayload);

        if (updateError) {
            const err = updateError as any;
            const dbMsg = err.error || err.details || err.hint || err.message;
            console.error('updateUserById error:', updateError);
            return new Response(JSON.stringify({ error: `Error al actualizar: ${dbMsg}` }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const { data: rolData } = await supabaseAdmin
            .from('roles')
            .select('id_rol')
            .ilike('nombre_rol', nombreRolNormalizado)
            .single();

        const { error: dbUpdateError } = await supabaseAdmin
            .from('usuarios')
            .update({
                email,
                id_rol: rolData?.id_rol,
                nombre_completo,
                cedula: Number(cedula),
                prefijo_doc: prefijo_doc || 'V',
            })
            .eq('id_usuario', user_id);

        if (dbUpdateError) {
            return new Response(
                JSON.stringify({
                    error: `Error al actualizar usuario en BD: ${dbUpdateError.message}`,
                }),
                {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                },
            );
        }

        if (certificado_numero) {
            const { error: e } = await supabaseAdmin.from('certificados_medicos').upsert(
                {
                    usuario_id: user_id,
                    certificado_numero,
                    certificado_expedicion: certificado_expedicion || null,
                },
                { onConflict: 'usuario_id' },
            );
            if (e) {
                return new Response(
                    JSON.stringify({ error: `Error al guardar certificado: ${e.message}` }),
                    {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    },
                );
            }
        }

        if (licencia_numero && licencia_grado) {
            const { error: e } = await supabaseAdmin.from('licencias_conducir').upsert(
                {
                    usuario_id: user_id,
                    licencia_numero,
                    licencia_grado,
                    licencia_expedicion: licencia_expedicion || null,
                },
                { onConflict: 'usuario_id' },
            );
            if (e) {
                return new Response(
                    JSON.stringify({ error: `Error al guardar licencia: ${e.message}` }),
                    {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    },
                );
            }
        }

        return new Response(
            JSON.stringify({
                message: 'Usuario actualizado con éxito',
                user: updatedUser.user,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
