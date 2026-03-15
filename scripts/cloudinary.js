// scripts/cloudinary.js

async function comprimirImagen(file) {

  if (!file.type.startsWith("image/")) return file;

  const img = await createImageBitmap(file);

  const canvas = document.createElement("canvas");

  const maxSize = 1920;
  let width = img.width;
  let height = img.height;

  if (width > maxSize || height > maxSize) {
    if (width > height) {
      height = Math.round((height * maxSize) / width);
      width = maxSize;
    } else {
      width = Math.round((width * maxSize) / height);
      height = maxSize;
    }
  }

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise(resolve => {
    canvas.toBlob(
      blob => {
        resolve(new File([blob], file.name, {
          type: "image/jpeg"
        }));
      },
      "image/jpeg",
      0.8   // calidad 80%
    );
  });
}

export async function subirArchivoCloudinary(file, carpeta = "") {

  if (!file) throw new Error("No se seleccionó ningún archivo");

  const esPdf = file.type === "application/pdf";

  // 🔹 Comprimir si es imagen
  if (!esPdf) {
    file = await comprimirImagen(file);
  }

  const resourceType = esPdf ? "raw" : "image";

  const endpoint = esPdf
    ? "https://api.cloudinary.com/v1_1/daegaptwk/raw/upload"
    : "https://api.cloudinary.com/v1_1/daegaptwk/image/upload";

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "lyfolavarria");

  if (carpeta) {
    formData.append("folder", carpeta);
  }

  const res = await fetch(endpoint, {
    method: "POST",
    body: formData
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Error Cloudinary:", text);
    throw new Error("Error subiendo archivo");
  }

  const data = await res.json();
  return data.secure_url;
}

export function abrirArchivoCloudinary(url) {

  const esPdf = url.toLowerCase().endsWith(".pdf");

  const visorUrl = esPdf
    ? url
    : url.replace("/upload/", "/upload/q_auto,f_auto/");

  const ventana = window.open("", "_blank");

  ventana.document.write(`
  <html>
  <head>
  <title>Visor</title>

  <style>

  body{
    margin:0;
    display:flex;
    flex-direction:column;
    height:100vh;
    background:#111;
    font-family:Arial;
  }

  .barra{
    background:#222;
    padding:10px;
    display:flex;
    gap:10px;
  }

  button{
    padding:8px 14px;
    border:none;
    border-radius:4px;
    cursor:pointer;
    font-size:14px;
  }

  .imprimir{
    background:#4CAF50;
    color:white;
  }

  .descargar{
    background:#2196F3;
    color:white;
  }

  .visor{
    flex:1;
    display:flex;
    justify-content:center;
    align-items:center;
  }

  img{
    max-width:100%;
    max-height:100%;
    object-fit:contain;
  }

  iframe{
    width:100%;
    height:100%;
    border:none;
  }

  </style>

  </head>

  <body>

  <div class="barra">
    <button class="imprimir" onclick="imprimirArchivo()">🖨 Imprimir</button>
    <button class="descargar" onclick="descargarArchivo()">⬇ Descargar</button>
  </div>

  <div class="visor">
    ${
      esPdf
        ? `<iframe src="${visorUrl}" id="archivo"></iframe>`
        : `<img src="${visorUrl}" id="archivo">`
    }
  </div>

  <script>

  const url = "${visorUrl}";

  function descargarArchivo(){
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function imprimirArchivo(){

    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = url;

    document.body.appendChild(iframe);

    iframe.onload = function(){
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }

  }

  </script>

  </body>
  </html>
  `);

}