const FILAS_POR_PAGINA = 3;
const ANCHO_MINIMO_CARD = 350;

function contarColumnas(lista) {
  const columnasCalculadas = getComputedStyle(lista).gridTemplateColumns;
  if (columnasCalculadas && columnasCalculadas !== "none") {
    return Math.max(1, columnasCalculadas.trim().split(/\s+/).length);
  }

  return Math.max(1, Math.floor(lista.clientWidth / ANCHO_MINIMO_CARD));
}

export function configurarPaginacionCards(moduleRoot, lista, alCambiar) {
  let cantidad = contarColumnas(lista) * FILAS_POR_PAGINA;
  let timerResize;

  const sincronizar = () => {
    if (moduleRoot && getComputedStyle(moduleRoot).display === "none") return;

    const nuevaCantidad = contarColumnas(lista) * FILAS_POR_PAGINA;
    if (nuevaCantidad === cantidad) return;
    cantidad = nuevaCantidad;
    alCambiar(cantidad);
  };

  window.addEventListener("resize", () => {
    clearTimeout(timerResize);
    timerResize = setTimeout(sincronizar, 160);
  });
  moduleRoot?.addEventListener("module:shown", sincronizar);

  return () => cantidad;
}
