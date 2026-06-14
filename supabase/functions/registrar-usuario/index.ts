import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  // Control de peticiones CORS preflight (OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // Inicializar cliente de Supabase usando la Service Role Key (Bypass de RLS)
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    // Extraer el token de autorización enviado por Angular
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        error: 'Falta la cabecera de autorización'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const token = authHeader.replace('Bearer ', '');
    // Obtener de forma segura los datos del usuario que hace la llamada desde el servicio Auth
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({
        error: 'Sesión inválida o expirada'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // ======================================================================
    // VALIDACIÓN DE ROL OPTIMIZADA (Compatible 100% con tu esquema de base de datos)
    // ======================================================================
    // Consultamos la tabla pública de usuarios usando el cliente admin para forzar el bypass del RLS.
    // Realizamos un JOIN directo en sintaxis de PostgREST hacia la tabla 'roles'.
    const { data: userData, error: userError } = await supabaseAdmin.from('usuarios').select('id_usuario, roles!usuarios_id_rol_fkey(nombre_rol)') // Especificamos explícitamente la clave foránea del backup
    .eq('id_usuario', user.id).single();
    // Si hay error o la estructura relacional no devuelve un Administrador, denegamos el acceso
    const nombreRolOperador = userData?.roles?.nombre_rol;
    if (userError || nombreRolOperador?.toLowerCase() !== 'administrador') {
      return new Response(JSON.stringify({
        error: 'Acceso denegado: El usuario no cuenta con el rol de Administrador en el sistema.',
        detalles: userError ? userError.message : `Rol encontrado: ${nombreRolOperador}`
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // ======================================================================
    // Leer los datos que vienen del formulario de Angular
    const body = await req.json();
    const { email, password, nombre_completo, cedula, nombre_rol, ...datosAdicionales } = body;
    if (!email || !password || !nombre_completo || !cedula || !nombre_rol) {
      return new Response(JSON.stringify({
        error: 'Faltan campos obligatorios en el cuerpo de la solicitud.'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Registrar el nuevo usuario en el Auth de Supabase (Esto disparará tu trigger handle_new_user)
    const { data: nuevoUsuario, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        nombre_rol,
        nombre_completo,
        cedula,
        ...datosAdicionales // Pasa de largo el certificado médico, licencia, etc.
      }
    });
    // Si tu trigger handle_new_user() de PostgreSQL arroja un RAISE EXCEPTION, se captura aquí de forma limpia
    if (createError) {
      const err = createError as any;
      const dbMsg = err.error || err.details || err.hint || err.message;
      console.error('createUser error:', createError);
      return new Response(JSON.stringify({
        error: `Error en Base de Datos: ${dbMsg}`
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    return new Response(JSON.stringify({
      message: 'Usuario registrado con éxito',
      user: nuevoUsuario.user
    }), {
      status: 201,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
