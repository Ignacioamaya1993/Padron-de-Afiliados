// scripts/cloudinary.js
export async function subirArchivoCloudinary(file, carpeta = "") {
  if (!file) throw new Error("No se seleccionó ningún archivo");

  const url = `https://api.cloudinary.com/v1_1/daegaptwk/upload`;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "lyfolavarria"); // preset unsigned
  formData.append("resource_type", "raw");

  // 🔹 Si se pasa carpeta, se le indica a Cloudinary que suba ahí
  if (carpeta) {
    formData.append("folder", carpeta); // ej: "19-00639-4/00"
  }

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