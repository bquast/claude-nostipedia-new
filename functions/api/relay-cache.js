// Cloudflare Pages Function for caching relay lists
// This can be expanded to use KV storage for persisting user preferences

export async function onRequestGet(context) {
    const { env } = context;
    
    // Default relays
    const defaultRelays = [
        'wss://relay.damus.io',
        'wss://relay.nostr.band',
        'wss://nos.lol',
        'wss://relay.snort.social'
    ];

    // If KV is bound, you can retrieve stored relays
    // const stored = await env.RELAY_KV?.get('user-relays');
    // const relays = stored ? JSON.parse(stored) : defaultRelays;

    return new Response(JSON.stringify({
        relays: defaultRelays,
        timestamp: Date.now()
    }), {
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        }
    });
}

export async function onRequestPost(context) {
    const { request, env } = context;
    
    try {
        const { relays } = await request.json();
        
        // Validate relays
        if (!Array.isArray(relays)) {
            return new Response(JSON.stringify({
                error: 'Invalid relays format'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // If KV is bound, you can store relays
        // await env.RELAY_KV?.put('user-relays', JSON.stringify(relays));

        return new Response(JSON.stringify({
            success: true,
            relays
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (err) {
        return new Response(JSON.stringify({
            error: 'Failed to save relays'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        }
    });
}