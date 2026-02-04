// scripts/cloudinary.js
export async function subirArchivoCloudinary(file, carpeta = "") {
  if (!file) throw new Error("No se seleccionó ningún archivo");

  const esPdf = file.type === "application/pdf";

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
