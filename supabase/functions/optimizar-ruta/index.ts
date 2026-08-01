import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { status: 200, headers: corsHeaders });
    }

    try {
        const body = await req.json();
        const { googleProjectId, googleRegion, requestBody, googleMapsKey } = body;

        const apiKey = Deno.env.get('GOOGLE_MAPS_KEY') || googleMapsKey;
        const projectId = Deno.env.get('GOOGLE_PROJECT_ID') || googleProjectId;
        const region = Deno.env.get('GOOGLE_REGION') || googleRegion || 'global';

        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: 'Falta googleMapsKey o variable GOOGLE_MAPS_KEY' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
        }
        if (!projectId) {
            return new Response(
                JSON.stringify({ error: 'Falta googleProjectId o variable GOOGLE_PROJECT_ID' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
        }

        const url = `https://routeoptimization.googleapis.com/v1/projects/${projectId}/locations/${region}/optimizeTours?key=${apiKey}`;

        const googleResponse = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        const data = await googleResponse.json();

        if (!googleResponse.ok) {
            console.error('Google API error:', googleResponse.status, data);
            return new Response(JSON.stringify(data), {
                status: googleResponse.status,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (err) {
        console.error('Edge Function error:', err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
