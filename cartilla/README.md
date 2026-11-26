# Cartilla medica

## Administración con selección de campos

El panel de revisión manual está en `admin.html`. Permite iniciar sesión, cargar el JSON de la revisión semanal y elegir nombre, especialidad, dirección y teléfono por separado. Para activarlo, seguir [docs/admin-setup.md](docs/admin-setup.md): requiere crear un usuario de Supabase Auth y configurar dos variables privadas en Vercel. No modificar `js/env.js` con claves administrativas.

Las decisiones de conservar se guardan por campo en la tabla privada `revision_decisiones` de Supabase. Los casos conservados no vuelven a pendientes mientras sigan iguales los valores comparados; se pueden reabrir desde el filtro Conservados. Los informes semanales continúan completos y el panel aplica las decisiones después de iniciar sesión. Ver también la sincronización de conservaciones de la versión anterior en la guía de administración.

La web consulta Supabase y, si falla o demora mas de 8 segundos, muestra data/profesionales.json. La copia incluye las categorias relacionadas y solo los campos publicos de la cartilla. La fecha visible indica cuando se genero la copia; no indica cuando se modificaron los registros.

## Actualizar el respaldo

Desde la carpeta Cartilla-Medica-master (la que contiene index.html), ejecutar con Node.js 22.19 o posterior:

    node --use-system-ca scripts/update-snapshot.mjs

Supabase debe estar activo. Se reutiliza js/env.js y su clave publica; no se necesita service_role. El comando descarga todas las paginas y reemplaza el JSON solo al completar y validar la descarga. Si falla o devuelve una lista vacia, conserva la copia anterior.

Publicar data/profesionales.json junto con los demas archivos del sitio despues de cada cambio en la cartilla. La copia no se actualiza sola desde el navegador. Si Supabase esta pausado, la copia publicada continua funcionando, aunque puede tener datos anteriores. Para generar una nueva copia hay que reactivar Supabase.

Probar la web mediante un servidor HTTP, no abriendo index.html como archivo local. Para comprobar el respaldo, bloquear el dominio de Supabase desde las herramientas de red del navegador y recargar: debe aparecer la fecha de la copia guardada y funcionar filtros, paginacion y fichas.

## Actualizacion automatica con GitHub Actions

El workflow .github/workflows/update-directory.yml consulta Supabase todos los dias a las 09:23 de Argentina (puede haber demoras del programador de GitHub). Tambien admite ejecucion manual desde Actions > Actualizar respaldo de la cartilla > Run workflow.

Descarga profesionales y sus categorias; si los datos cambiaron, guarda solo data/profesionales.json en la rama predeterminada. Si siguen iguales, conserva el archivo y su fecha de generacion. Si la consulta falla, no modifica el respaldo y la ejecucion figura como fallida. No necesita instalar dependencias ni configurar tokens de Supabase/Vercel: usa la clave publica de js/env.js y el GITHUB_TOKEN automatico para guardar el JSON.

Para activarlo:

1. Subir los cambios locales (incluidos .github/workflows, scripts, js/data-source.js y data) a la rama predeterminada del repositorio. Esta carpeta, que contiene index.html y .git, es la raiz del repositorio.
2. En GitHub, verificar que Actions este habilitado y que las politicas permitan contents: write al workflow. Si la rama tiene protecciones que impiden pushes del bot, se debe adaptar el flujo a esas reglas; no desactivar protecciones sin evaluarlas.
3. Ejecutarlo manualmente una vez y comprobar que la consulta termina correctamente.
4. Si se genera un commit, comprobar el despliegue en Vercel. Debe estar conectado a este repositorio y usar la misma rama para produccion. Restricciones del proyecto o del autor del commit pueden impedir el despliegue automatico; revisar su estado en Vercel.

No se ha activado esta tarea remota solo por crear el archivo local. No reactiva un proyecto que ya este pausado: primero restaurarlo desde Supabase. Generar actividad diaria puede reducir las pausas por inactividad del plan gratuito, pero no es una garantia contractual.

En repositorios publicos, GitHub desactiva las ejecuciones programadas tras 60 dias sin actividad en el repositorio. Consultar Supabase sin cambios no genera commits y no evita esa limitacion: revisar Actions y reactivar la tarea si se deshabilita. El JSON sigue disponible aun si falla la automatizacion.

## Revision semanal con el Circulo Medico

El workflow .github/workflows/review-directory.yml se ejecuta los lunes a las 10:41 de Argentina (13:41 UTC) y tambien manualmente desde Actions > Revisar diferencias con Circulo Medico > Run workflow. Se activa al subir estos archivos a la rama predeterminada; crear los archivos locales no activa la tarea remota.

Lee https://cmolavarria.com.ar/listado-de-profesionales/ una sola vez por revision y compara direccion y telefono con la cartilla. No escribe en Supabase, no modifica categorias ni certificados digitales y no agrega ni elimina profesionales. Si Supabase no responde, usa el JSON publicado en el repositorio e identifica su fecha en el informe.

Al terminar, abrir la ejecucion en Actions y descargar el artifact revision-profesionales. Descomprimir y abrir revision-profesionales.html en el navegador. Tambien incluye JSON para analizar los resultados. Los artifacts se conservan 30 dias; no se publican en Vercel. En un repositorio publico, tratar los artifacts como informacion publica.

Estados:

- diferencias: nombre normalizado unico en ambos listados, con direccion o telefono distintos. Revisar antes de editar.
- ambiguo: nombre completo y especialidad repetidos en alguno de los listados; confirmar consultorio e identidad.
- Las especialidades diferentes se excluyen. Los nombres abreviados compatibles aparecen como posibles coincidencias para confirmar identidad. El resumen indica cuántos registros no tienen una coincidencia conjunta; no implica una baja de la cartilla.
- origen_incompleto: la fuente tiene campos vacios. Nunca se propone borrar un dato por este motivo.
- sin_diferencias: no se detectaron cambios de contacto con la normalizacion aplicada; no certifica vigencia.

Se comparan nombres completos o abreviados compatibles dentro de la misma especialidad, ignorando tildes, puntuación, espacios y orden de las palabras del nombre. Se admiten nombres abreviados si comparten apellido y todas las palabras del nombre corto aparecen en el largo, aunque cambie el orden de los nombres de pila. Se presentan para confirmar identidad; la especialidad siempre debe coincidir. Las direcciones ignoran Nº, N°, No. y N.º delante de la altura, incluso sin espacio: MORENO 2647 equivale a MORENO Nº2647. Se conservan altura, piso y departamento; sus cambios sí se informan. Los prefijos telefónicos distintos pueden producir diferencias para revisión. Los registros externos que no están en tu cartilla no se incorporan.

Para generar un informe local, desde la raiz del repositorio:

    node --use-system-ca scripts/review-directory.mjs

Se guarda en reports/ (carpeta ignorada por Git). Pruebas del comparador:

    node --test scripts/directory-comparison.test.mjs

Si cambia el formato del sitio de origen, hay errores de conexion o la tabla parece incompleta, la tarea falla sin actualizar datos. Revisar los logs. La limitacion de 60 dias sin actividad para tareas programadas de repositorios publicos tambien aplica a esta revision.
