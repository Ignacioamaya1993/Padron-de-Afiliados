// scripts/cloudinary.js

async function comprimirImagen(file){

  if(!file.type.startsWith("image/")) return file;

  const img = await createImageBitmap(file);

  const canvas = document.createElement("canvas");

  const maxSize = 1920;

  let width = img.width;
  let height = img.height;

  if(width > maxSize || height > maxSize){

    if(width > height){
      height = Math.round((height * maxSize) / width);
      width = maxSize;
    }else{
      width = Math.round((width * maxSize) / height);
      height = maxSize;
    }

  }

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img,0,0,width,height);

  return new Promise(resolve=>{
    canvas.toBlob(blob=>{
      resolve(new File([blob],file.name,{type:"image/jpeg"}));
    },"image/jpeg",0.85);
  });

}

async function imagenAPdf(file){

  const { jsPDF } = window.jspdf;

  const img = await createImageBitmap(file);

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img,0,0);

  const dataURL = canvas.toDataURL("image/jpeg",0.9);

  const pdf = new jsPDF({
    orientation: img.width > img.height ? "l" : "p",
    unit: "px",
    format: [img.width,img.height]
  });

  pdf.addImage(dataURL,"JPEG",0,0,img.width,img.height);

  const blob = pdf.output("blob");

  return new File([blob],file.name.replace(/\.[^/.]+$/,"")+".pdf",{
    type:"application/pdf"
  });

}

export async function subirArchivoCloudinary(file, carpeta=""){

  if(!file) throw new Error("No se seleccionó ningún archivo");

  const esPdf = file.type === "application/pdf";

  if(!esPdf){

    file = await comprimirImagen(file);
    file = await imagenAPdf(file);

  }

  const endpoint = "https://api.cloudinary.com/v1_1/daegaptwk/raw/upload";

  const formData = new FormData();
  formData.append("file",file);
  formData.append("upload_preset","lyfolavarria");

  if(carpeta){
    formData.append("folder",carpeta);
  }

  const res = await fetch(endpoint,{
    method:"POST",
    body:formData
  });

  if(!res.ok){

    const text = await res.text();
    console.error("Error Cloudinary:",text);
    throw new Error("Error subiendo archivo");

  }

  const data = await res.json();
  return data.secure_url;

}

// Las fotos de perfil se suben como imágenes para conservar miniaturas y
// transformaciones de Cloudinary; los adjuntos documentales siguen usando raw.
export async function subirImagenPerfilCloudinary(file, carpeta="") {
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("Seleccioná una imagen válida.");
  }

  const limiteBytes = 5 * 1024 * 1024;
  let imagen = file;

  if (file.size > limiteBytes) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const contexto = canvas.getContext("2d");
    if (!contexto) throw new Error("No se pudo procesar la imagen en este navegador.");

    let escala = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    let calidad = 0.9;
    let blob = null;

    // Primero baja la calidad y luego las dimensiones, conservando la proporción.
    for (let intento = 0; intento < 18; intento++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * escala));
      canvas.height = Math.max(1, Math.round(bitmap.height * escala));
      contexto.fillStyle = "#fff";
      contexto.fillRect(0, 0, canvas.width, canvas.height);
      contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", calidad));
      if (!blob) break;
      if (blob.size <= limiteBytes) break;

      if (calidad > 0.5) calidad = Math.max(0.5, calidad - 0.1);
      else {
        escala *= 0.78;
        calidad = 0.82;
      }
    }

    bitmap.close();
    if (!blob || blob.size > limiteBytes) {
      throw new Error("No se pudo comprimir la imagen por debajo de 5 MB.");
    }

    const nombreBase = file.name.replace(/\.[^.]+$/, "") || "foto-perfil";
    imagen = new File([blob], `${nombreBase}.jpg`, { type: "image/jpeg" });
  }

  const formData = new FormData();
  formData.append("file", imagen);
  formData.append("upload_preset", "lyfolavarria");
  if (carpeta) formData.append("folder", carpeta);

  const res = await fetch("https://api.cloudinary.com/v1_1/daegaptwk/image/upload", {
    method: "POST",
    body: formData
  });

  if (!res.ok) {
    console.error("Error Cloudinary:", await res.text());
    throw new Error("No se pudo subir la imagen.");
  }

  const data = await res.json();
  return data.secure_url;
}
