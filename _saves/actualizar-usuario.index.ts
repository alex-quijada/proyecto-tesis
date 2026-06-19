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
            ...datosAdicionales
        } = body;

        if (!user_id) {
            return new Response(JSON.stringify({ error: 'Falta el campo user_id.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const updatePayload: any = { email };

        const userMetadata: Record<string, any> = {};
        if (nombre_rol) userMetadata.nombre_rol = nombre_rol;
        if (nombre_completo) userMetadata.nombre_completo = nombre_completo;
        if (cedula) userMetadata.cedula = cedula;
        Object.assign(userMetadata, datosAdicionales);
        updatePayload.user_metadata = userMetadata;

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
