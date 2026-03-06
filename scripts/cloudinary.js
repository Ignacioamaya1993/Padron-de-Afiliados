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

export function abrirImagenCloudinary(url) {

  // genera una versión optimizada de la imagen
  const visorUrl = url.replace(
    "/upload/",
    "/upload/q_auto,f_auto/"
  );

  window.open(visorUrl, "_blank");

}