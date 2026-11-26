import { configuration, authorize, listRecords, applyUpdate, rememberDecision, forgetDecision, HttpError } from '../server/admin-service.mjs';

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
        if (!['GET', 'POST'].includes(req.method)) {
            res.setHeader('Allow', 'GET, POST');
            throw new HttpError(405, 'Método no permitido.');
        }
        const config = configuration();
        const user = await authorize(req.headers.authorization, config);
        if (req.method === 'GET') {
            const [professionals, categories, reviewDecisions] = await Promise.all([
                listRecords(config, 'profesionales', 'id,name,address,city,phone,categoria_id,categorias(nombre)'),
                listRecords(config, 'categorias', 'id,nombre'),
                listRecords(config, 'revision_decisiones', 'id,profesional_id,field,source_identity,current_value,source_value,fingerprint,decided_at,decided_by,revoked_at', fetch, { revoked_at: 'is.null' })
            ]);
            return res.status(200).json({ professionals, categories, reviewDecisions, user: { id: user.id, email: user.email } });
        }
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'Se requiere JSON.');
        if (req.headers.origin && req.headers.origin !== `https://${req.headers.host}` &&
            !(process.env.NODE_ENV !== 'production' && req.headers.origin === `http://${req.headers.host}`)) {
            throw new HttpError(403, 'Origen de la solicitud no permitido.');
        }
        let body = req.body;
        if (typeof body === 'string') {
            if (body.length > 15000) throw new HttpError(413, 'Solicitud demasiado grande.');
            try { body = JSON.parse(body); } catch { throw new HttpError(400, 'JSON inválido.'); }
        }
        if (body?.action === 'remember') return res.status(200).json(await rememberDecision(body, config, user));
        if (body?.action === 'forget') return res.status(200).json(await forgetDecision(body, config));
        const receipt = await applyUpdate(body, config, user);
        console.info(JSON.stringify({ event: 'directory_update', ...receipt }));
        return res.status(200).json(receipt);
    } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        if (status === 500) console.error('Administrative request failed.');
        return res.status(status).json({ error: status === 500 ? 'No se pudo completar la operación. Reintentá más tarde.' : error.message });
    }
}
