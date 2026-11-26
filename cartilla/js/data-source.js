// Only fields already displayed by the public directory are exported.
export const PUBLIC_FIELDS = 'name,address,city,phone,certificado_medico_digital,categorias(nombre)';

export async function fetchProfessionals(config, signal) {
    const professionals = [];
    while (true) {
        const url = new URL('/rest/v1/profesionales', config.SUPABASE_URL);
        url.searchParams.set('select', PUBLIC_FIELDS);
        url.searchParams.set('order', 'name.asc,address.asc,city.asc,phone.asc');
        url.searchParams.set('limit', '100');
        url.searchParams.set('offset', String(professionals.length));
        const response = await fetch(url, {
            headers: {
                'Accept-Profile': 'cartilla',
                apikey: config.SUPABASE_ANON_KEY,
                
            },
            signal
        });
        if (!response.ok) throw new Error(`Directory request failed (${response.status})`);
        const page = await response.json();
        if (!Array.isArray(page)) throw new Error('Invalid directory response');
        if (!page.length) return professionals;
        professionals.push(...page);
    }
}

export function validateSnapshot(snapshot) {
    if (snapshot?.version !== 1 || !Number.isFinite(Date.parse(snapshot.generatedAt)) ||
        !Array.isArray(snapshot.professionals) || !snapshot.professionals.every(item =>
            item && typeof item.name === 'string' &&
            ['address', 'city', 'phone'].every(field => item[field] == null || typeof item[field] === 'string') &&
            (item.categorias == null || typeof item.categorias.nombre === 'string') &&
            (item.certificado_medico_digital == null || typeof item.certificado_medico_digital === 'boolean')
        )) throw new Error('Invalid directory snapshot');
    return snapshot;
}
