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