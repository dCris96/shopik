// =========================================================================
// SHOPIK · cloudinary.js
// 🔐 Comprime las fotos en el propio celular (antes de subirlas) y las sube
// a Cloudinary usando un "unsigned upload preset", que permite subir
// imágenes directamente desde el navegador sin exponer ninguna clave secreta.
// =========================================================================

// -------------------------------------------------------------------------
// 🔧 QUÉ DEBO CAMBIAR:
// Reemplaza estos dos valores con los de TU cuenta de Cloudinary.
// -------------------------------------------------------------------------
const CLOUDINARY_CLOUD_NAME = "dbal2qcrz"; // Dashboard de Cloudinary → esquina superior derecha
const CLOUDINARY_UPLOAD_PRESET = "shopik"; // Settings → Upload → Upload presets (modo "Unsigned")

const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

// -------------------------------------------------------------------------
// 🎨 Comprime una imagen en el navegador antes de subirla:
// la redimensiona a un ancho máximo y la reexporta como JPEG con calidad
// reducida. Esto acelera muchísimo la subida en redes lentas del celular
// y ahorra espacio/costo en Cloudinary.
// -------------------------------------------------------------------------
function compressImage(file, { maxWidth = 1000, quality = 0.72 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // Calcula el nuevo tamaño manteniendo la proporción original
      const scale = Math.min(1, maxWidth / img.width);
      const targetWidth = Math.round(img.width * scale);
      const targetHeight = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("No se pudo comprimir la imagen."));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo leer la imagen."));
    };

    img.src = objectUrl;
  });
}

// -------------------------------------------------------------------------
// 🔐 Comprime y sube una foto a Cloudinary.
// Devuelve la URL segura (https) de la imagen ya alojada, lista para
// guardarse en el documento del producto en Firestore.
// -------------------------------------------------------------------------
export async function uploadProductPhoto(file) {
  const compressedBlob = await compressImage(file);

  const formData = new FormData();
  formData.append("file", compressedBlob);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", "shopik/products"); // 🎨 organiza las fotos en una carpeta dentro de Cloudinary

  const response = await fetch(CLOUDINARY_UPLOAD_URL, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Cloudinary rechazó la subida de la imagen.");
  }

  const data = await response.json();
  return data.secure_url; // URL https lista para usar como <img src="...">
}
