// scripts/cloudinary.js
export async function subirArchivoCloudinary(file) {
  if (!file) throw new Error("No se seleccionó ningún archivo");

  const url = `https://api.cloudinary.com/v1_1/352816824892132/upload`;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "lyfolavarria");

  const res = await fetch(url, {
    method: "POST",
    body: formData
  });

  if (!res.ok) throw new Error("Error subiendo archivo");

  const data = await res.json();
  return data.secure_url;
}
