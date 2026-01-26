// scripts/cloudinary.js
export async function subirArchivoCloudinary(file) {
  if (!file) throw new Error("No se seleccionó ningún archivo");

  const url = `https://api.cloudinary.com/v1_1/daegaptwk/upload`; // cloud name correcto
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "lyfolavarria"); // preset unsigned
  formData.append("resource_type", "auto"); // permite imágenes y pdfs

  const res = await fetch(url, {
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
