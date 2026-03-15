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
        <title>Visor de archivo</title>

        <style>

          body{
            margin:0;
            background:#f5f5f5;
            display:flex;
            flex-direction:column;
            height:100vh;
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
            background:#4CAF50;
            color:white;
            cursor:pointer;
            border-radius:4px;
            font-size:14px;
          }

          button:hover{
            background:#45a049;
          }

          .visor{
            flex:1;
            display:flex;
            justify-content:center;
            align-items:center;
            background:white;
          }

          img,iframe{
            max-width:100%;
            max-height:100%;
          }

        </style>

      </head>

      <body>

        <div class="barra">
          <button onclick="window.print()">🖨 Imprimir</button>
        </div>

        <div class="visor">

          ${
            esPdf
              ? `<iframe src="${visorUrl}" width="100%" height="100%"></iframe>`
              : `<img src="${visorUrl}">`
          }

        </div>

      </body>
    </html>
  `);

}