import { ENV } from "./env.js";
import { fetchProfessionals, validateSnapshot } from "./data-source.js";

// Variables globales
let professionals = [];
let currentPage = 1;
let recordsPerPage = 10;
let filteredProfessionals = [];
let digitalCertificateOnly = false;
async function loadProfessionalsFromDB() {
    try {
    let data;
    const status = document.getElementById('dataStatus');
    status.textContent = 'Consultando cartilla...';
    try {
        data = await fetchProfessionals(ENV, AbortSignal.timeout(8000));
        status.textContent = 'Cartilla consultada en línea';
    } catch (error) {
        console.warn('Online directory unavailable; loading local snapshot.');
        const response = await fetch('./data/profesionales.json', { cache: 'no-cache', signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error('Snapshot unavailable');
        const snapshot = validateSnapshot(await response.json());
        data = snapshot.professionals;
        const date = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(snapshot.generatedAt));
        status.textContent = 'Mostrando copia guardada el ' + date + '. Puede haber cambios posteriores.';
    }
    professionals = (data || []).sort((a, b) => {
        const specialtyA = a.categorias?.nombre || '';
        const specialtyB = b.categorias?.nombre || '';

        // Primero: ordenar por especialidad
        const specialtyComparison = specialtyA.localeCompare(
            specialtyB,
            'es',
            { sensitivity: 'base' }
        );

        if (specialtyComparison !== 0) {
            return specialtyComparison;
        }

        // Segundo: dentro de la especialidad, ordenar por profesional
        return (a.name || '').localeCompare(
            b.name || '',
            'es',
            { sensitivity: 'base' }
        );
    });

    populateSpecialtyFilter();
    updateProfessionals();
    } catch (error) {
        console.error('Error cargando profesionales:', error);
        document.getElementById('dataStatus').textContent = 'Cartilla no disponible. Reintentá en unos minutos.';
        document.getElementById('prevPage').disabled = true;
        document.getElementById('nextPage').disabled = true;
        document.getElementById('professionalList').innerHTML = '<tr><td colspan="5" class="empty-state">No se pudieron cargar los profesionales. <button type="button" id="retryLoad">Reintentar</button></td></tr>';
        document.getElementById('retryLoad').addEventListener('click', () => {
            document.getElementById('professionalList').innerHTML = '<tr><td colspan="5" class="empty-state">Cargando profesionales...</td></tr>';
            loadProfessionalsFromDB();
        });
    }
}

// Función para actualizar la cantidad de registros por página
function updateRecordsPerPage() {
    recordsPerPage = parseInt(document.getElementById('recordsPerPage').value);
    currentPage = 1;
    updateProfessionals();
}

// Función para poblar el filtro de especialidades
function populateSpecialtyFilter() {
    const specialties = [
        ...new Set(
            professionals
                .map(p => p.categorias?.nombre)
                .filter(Boolean)
        )
    ].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

    const specialtyFilter = document.getElementById('specialtyFilter');

    specialtyFilter.innerHTML =
        '<option value="all">TODAS LAS ESPECIALIDADES</option>';

    specialties.forEach(specialty => {
        const option = document.createElement('option');
        option.value = specialty;
        option.textContent = specialty;
        specialtyFilter.appendChild(option);
    });
}

// Función para actualizar los profesionales mostrados
function updateProfessionals() {
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    const searchQuery = normalize(document.getElementById('search').value.trim());
    const selectedSpecialty = document.getElementById('specialtyFilter').value;

    filteredProfessionals = professionals.filter(p =>
        normalize(p.name).includes(searchQuery) &&
        (selectedSpecialty === 'all' ||
            p.categorias?.nombre === selectedSpecialty) &&
        (!digitalCertificateOnly ||
            p.certificado_medico_digital === true)
    );

    currentPage = 1;
    renderProfessionals();
    updatePaginationInfo();
}

// Función para renderizar los profesionales en la tabla

function renderProfessionals() {
    const startIndex = (currentPage - 1) * recordsPerPage;
    const paginatedProfessionals = filteredProfessionals.slice(
        startIndex,
        startIndex + recordsPerPage
    );

    const professionalList = document.getElementById('professionalList');
    professionalList.innerHTML = paginatedProfessionals.length ? '' : '<tr><td colspan="5" class="empty-state">No encontramos profesionales con esos filtros.</td></tr>';

    paginatedProfessionals.forEach(professional => {
        const row = document.createElement('tr');

        row.innerHTML = `
            <td>${escapeHtml(professional.categorias?.nombre || '')}</td>
            <td>
                <span class="professional-name">${escapeHtml(professional.name || '')}</span>
                <button type="button" class="professional-link"
                    title="Tocá para ver los datos completos"
                >${escapeHtml(professional.name || '')}<span class="details-hint">Ver ficha ↗</span></button>

                ${professional.certificado_medico_digital === true
                    ? '<span class="digital-certificate-badge">✓ Certificado Médico Digital</span>'
                    : ''}
            </td>
            <td>${escapeHtml(professional.address || '')}
                ${professional.address ? '<a class="table-maps-link" href="' + escapeHtml(getMapsUrl(professional)) + '" target="_blank" rel="noopener noreferrer" aria-label="Ver ubicaci&#243;n de ' + escapeHtml(professional.name || 'profesional') + ' en Google Maps">Ver en Google Maps &#8599;</a>' : ''}
            </td>
            <td>${escapeHtml(professional.city || '')}</td>
            <td>${escapeHtml(professional.phone || '')}</td>
        `;

        const nameLink = row.querySelector('.professional-link');

        const openDetails = () => {
            if (!window.matchMedia("(max-width: 776px)").matches) return;
            showProfessionalDetails(professional);
        };

        nameLink.addEventListener('click', openDetails);

        professionalList.appendChild(row);
    });

}

function getMapsUrl(professional) {
    const address = [professional.address, professional.city, 'Argentina'].filter(Boolean).join(', ');
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address);
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showProfessionalDetails(professional) {
    const specialty = professional.categorias?.nombre || 'No especificada';
    const name = professional.name || 'No informado';
    const address = professional.address || 'No informada';
    const city = professional.city || 'No informada';
    const phone = professional.phone || 'No informado';

    const digitalCertificate =
        professional.certificado_medico_digital === true;

    Swal.fire({
        icon: 'info',
        title: name,
        html: `
            <div class="professional-details-popup">
                <p>
                    <strong>Especialidad:</strong><br>
                    ${escapeHtml(specialty)}
                </p>

                <p>
                    <strong>Apellido y nombre:</strong><br>
                    ${escapeHtml(name)}
                </p>

                <p>
                    <strong>Dirección:</strong><br>
                    ${escapeHtml(address)}
                </p>

                <p>
                    <strong>Localidad:</strong><br>
                    ${escapeHtml(city)}
                </p>

                <p>
                    <strong>Teléfono:</strong><br>
                    ${escapeHtml(phone)}
                </p>

                ${professional.address ? '<a class="maps-link" target="_blank" rel="noopener noreferrer" href="' + escapeHtml(getMapsUrl(professional)) + '">Ver en Google Maps ↗<small>Se abre en una nueva pestaña</small></a>' : ''}

                ${digitalCertificate ? `
                    <p class="digital-certificate-badge">
                        ✓ Ofrece Certificado Médico Digital
                    </p>
                ` : ''}
            </div>
        `,
        confirmButtonText: 'Cerrar',
        customClass: {
            popup: 'swal2-popup-custom',
            title: 'swal2-title-custom',
            htmlContainer: 'swal2-html-custom'
        }
    });
}


// Función para actualizar la información de paginación
function updatePaginationInfo() {
    const pageInfo = document.getElementById('pageInfo');
    const pages = Math.ceil(filteredProfessionals.length / recordsPerPage);
    pageInfo.textContent = pages ? `Página ${currentPage} de ${pages} · ${filteredProfessionals.length} resultados` : "Sin resultados";

    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage >= Math.ceil(filteredProfessionals.length / recordsPerPage);
}

// Función para cambiar de página
function changePage(direction) {
    currentPage = Math.max(1, Math.min(currentPage + direction, Math.ceil(filteredProfessionals.length / recordsPerPage) || 1));
    renderProfessionals();
    updatePaginationInfo();
}

// Inicializa la aplicación cuando se carga el DOM
document.addEventListener('DOMContentLoaded', () => {
loadProfessionalsFromDB();

const digitalCertificateFilter =
    document.getElementById('digitalCertificateFilter');

digitalCertificateFilter.addEventListener('click', () => {
    digitalCertificateOnly = !digitalCertificateOnly;

    digitalCertificateFilter.classList.toggle(
        'active',
        digitalCertificateOnly
    );

    digitalCertificateFilter.setAttribute(
        'aria-pressed',
        String(digitalCertificateOnly)
    );

    updateProfessionals();
});


    document.getElementById('recordsPerPage').addEventListener('change', updateRecordsPerPage);
    document.getElementById('search').addEventListener('input', updateProfessionals);
    document.getElementById('specialtyFilter').addEventListener('change', updateProfessionals);
    document.getElementById('prevPage').addEventListener('click', () => changePage(-1));
    document.getElementById('nextPage').addEventListener('click', () => changePage(1));
});

