export function normalizeText(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function normalizeProfessionalName(value) {
    return normalizeText(value).replace(/^(DR|DRA) /, '');
}

export function professionalKey(name, specialty) {
    const normalizedName = normalizeProfessionalName(name);
    const normalizedSpecialty = normalizeText(specialty);
    if (!normalizedName || !normalizedSpecialty) return null;
    // The full set of name tokens must agree; partial/fuzzy names are excluded.
    return JSON.stringify([normalizedName.split(' ').sort(), normalizedSpecialty]);
}

export function sameProfessional(current, source) {
    return professionalMatch(current, source) !== null;
}

export function professionalMatch(current, source) {
    const key = professionalKey(current?.name, current?.categorias?.nombre);
    if (key === null || normalizeText(current?.categorias?.nombre) !== normalizeText(source?.specialty)) return null;
    if (key === professionalKey(source?.name, source?.specialty)) return 'exact';
    const left = normalizeProfessionalName(current?.name).split(' ').filter(Boolean);
    const right = normalizeProfessionalName(source?.name).split(' ').filter(Boolean);
    // Abbreviated names are suggestions only: same surname prefix, at least
    // two meaningful words, and no conflicting given names in the shorter form.
    if (left[0] !== right[0]) return null;
    const shorter = left.length <= right.length ? left : right;
    const longer = [...(left.length <= right.length ? right : left)];
    const particles = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y', 'H']);
    if (new Set(shorter.filter(word => !particles.has(word))).size < 2) return null;
    for (const word of shorter) {
        const index = longer.indexOf(word);
        if (index === -1) return null;
        longer.splice(index, 1);
    }
    return 'possible';
}

export function addressKey(value) {
    // Strip numbering markers only when followed by the street number. Keep
    // the number itself, floor, apartment and any other address information.
    const withoutMarker = String(value || '').replace(/\bN\s*\.?\s*[º°o]\s*\.?\s*(?=\d)/gi, ' ');
    return normalizeText(withoutMarker).replace(/\bN\b(?=\s*\d)/g, ' ')
        .replace(/\bGRAL\b/g, 'GENERAL').replace(/\bVTE\b/g, 'VICENTE')
        .replace(/\bCNEL\b/g, 'CORONEL').replace(/\bAV\b/g, 'AVENIDA').replace(/\s+/g, ' ').trim();
}

export function phoneKey(value) {
    return String(value || '').replace(/[^0-9]/g, '');
}

export function equivalentReviewValue(field, current, found) {
    if (field === 'address') return addressKey(current) === addressKey(found);
    if (field === 'phone') return phoneKey(current) === phoneKey(found);
    return normalizeText(current) === normalizeText(found);
}
