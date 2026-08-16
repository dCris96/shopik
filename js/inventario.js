// =========================================================================
// VENTAFÁCIL · inventario.js
// 🔐 Gestión de productos:
//    - Formulario: foto, nombre, talla, color, costo, precio, stock
//    - Sube la foto a Firebase Storage y guarda el producto en Firestore,
//      SIEMPRE vinculado al userId de la vendedora que inició sesión.
//    - Escucha en tiempo real (onSnapshot) solo los productos de esa
//      vendedora, así cada una ve únicamente su propio inventario.
// =========================================================================

import { auth, db, storage } from "./firebaseConfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

// ---------------------- Referencias al DOM ----------------------
const addProductBtn = document.getElementById("addProductBtn");
const productModal = document.getElementById("productModal");
const closeProductModal = document.getElementById("closeProductModal");

const productForm = document.getElementById("productForm");
const productError = document.getElementById("productError");
const productSubmitBtn = document.getElementById("productSubmitBtn");

const photoPicker = document.getElementById("photoPicker");
const inputPhoto = document.getElementById("inputPhoto");
const photoPreview = document.getElementById("photoPreview");
const photoPlaceholder = document.getElementById("photoPlaceholder");

const inputProductName = document.getElementById("inputProductName");
const inputSize = document.getElementById("inputSize");
const inputColor = document.getElementById("inputColor");
const inputCost = document.getElementById("inputCost");
const inputPrice = document.getElementById("inputPrice");
const inputStock = document.getElementById("inputStock");

const productsGrid = document.getElementById("productsGrid");
const productsEmpty = document.getElementById("productsEmpty");
const productsCount = document.getElementById("productsCount");

let selectedPhotoFile = null;
let unsubscribeProducts = null; // guarda la función para dejar de escuchar Firestore al cerrar sesión

// ---------------------- Abrir / cerrar el modal ----------------------
function openModal() {
  productModal.hidden = false;
}

function closeModal() {
  productModal.hidden = true;
  resetForm();
}

addProductBtn.addEventListener("click", openModal);
closeProductModal.addEventListener("click", closeModal);

// Cierra el modal si se toca fuera de la hoja (en el fondo oscuro)
productModal.addEventListener("click", (event) => {
  if (event.target === productModal) closeModal();
});

function resetForm() {
  productForm.reset();
  selectedPhotoFile = null;
  photoPreview.hidden = true;
  photoPreview.src = "";
  photoPlaceholder.hidden = false;
  hideError();
}

function showError(message) {
  productError.textContent = message;
  productError.hidden = false;
}

function hideError() {
  productError.hidden = true;
  productError.textContent = "";
}

// ---------------------- Selección de foto (cámara o galería) ----------------------
inputPhoto.addEventListener("change", () => {
  const file = inputPhoto.files[0];
  if (!file) return;

  selectedPhotoFile = file;

  // 🎨 Vista previa inmediata de la foto elegida
  const reader = new FileReader();
  reader.onload = () => {
    photoPreview.src = reader.result;
    photoPreview.hidden = false;
    photoPlaceholder.hidden = true;
  };
  reader.readAsDataURL(file);
});

// ---------------------- Guardar producto (submit del formulario) ----------------------
productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideError();

  const user = auth.currentUser;
  if (!user) return; // seguridad extra: no debería pasar porque el form solo es visible logueado

  if (!selectedPhotoFile) {
    showError("Agrega una foto del producto.");
    return;
  }

  const name = inputProductName.value.trim();
  const size = inputSize.value.trim();
  const color = inputColor.value.trim();
  const cost = parseFloat(inputCost.value);
  const price = parseFloat(inputPrice.value);
  const stock = parseInt(inputStock.value, 10);

  productSubmitBtn.disabled = true;
  productSubmitBtn.textContent = "Guardando...";

  try {
    // 🔐 1) Sube la foto a Storage en una carpeta exclusiva de esta vendedora
    const filePath = `products/${user.uid}/${Date.now()}_${selectedPhotoFile.name}`;
    const storageRef = ref(storage, filePath);
    await uploadBytes(storageRef, selectedPhotoFile);
    const photoURL = await getDownloadURL(storageRef);

    // 🔐 2) Guarda el producto en Firestore, vinculado al userId de la vendedora
    await addDoc(collection(db, "products"), {
      userId: user.uid,
      name,
      size,
      color,
      cost,
      price,
      stock,
      photoURL,
      photoPath: filePath, // se guarda para poder borrar la foto de Storage si se elimina el producto
      createdAt: serverTimestamp(),
    });

    closeModal();
  } catch (error) {
    console.error(error);
    showError("No se pudo guardar el producto. Inténtalo de nuevo.");
  } finally {
    productSubmitBtn.disabled = false;
    productSubmitBtn.textContent = "Guardar producto";
  }
});

// ---------------------- Dibujar una tarjeta de producto ----------------------
function renderProductCard(productId, product) {
  const card = document.createElement("div");
  card.className = "product-card";

  const isLowStock = product.stock <= 3;

  card.innerHTML = `
    <span class="product-card__stock ${isLowStock ? "is-low" : ""}">
      ${product.stock} en stock
    </span>
    <button class="product-card__delete" type="button" aria-label="Eliminar producto">✕</button>
    <div class="product-card__photo-wrap">
      <img class="product-card__photo" src="${product.photoURL}" alt="${product.name}" loading="lazy" />
    </div>
    <div class="product-card__body">
      <div class="product-card__name">${product.name}</div>
      <div class="product-card__tags">Talla ${product.size} · ${product.color}</div>
      <div class="product-card__price">S/ ${Number(product.price).toFixed(2)}</div>
    </div>
  `;

  // 🔐 Eliminar producto (borra también la foto en Storage)
  card
    .querySelector(".product-card__delete")
    .addEventListener("click", async (event) => {
      event.stopPropagation();
      const confirmDelete = confirm(
        `¿Eliminar "${product.name}" del inventario?`,
      );
      if (!confirmDelete) return;

      try {
        await deleteDoc(doc(db, "products", productId));
        if (product.photoPath) {
          await deleteObject(ref(storage, product.photoPath)).catch(() => {});
        }
      } catch (error) {
        console.error(error);
        alert("No se pudo eliminar el producto.");
      }
    });

  return card;
}

// ---------------------- Escuchar los productos de la vendedora en tiempo real ----------------------
function listenToProducts(uid) {
  const productsQuery = query(
    collection(db, "products"),
    where("userId", "==", uid),
    orderBy("createdAt", "desc"),
  );

  unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
    productsGrid.innerHTML = "";

    if (snapshot.empty) {
      productsEmpty.hidden = false;
    } else {
      productsEmpty.hidden = true;
      snapshot.forEach((docSnap) => {
        productsGrid.appendChild(renderProductCard(docSnap.id, docSnap.data()));
      });
    }

    productsCount.textContent = `${snapshot.size} producto${snapshot.size === 1 ? "" : "s"}`;
  });
}

// ---------------------- Activar / desactivar la escucha según la sesión ----------------------
onAuthStateChanged(auth, (user) => {
  if (unsubscribeProducts) {
    unsubscribeProducts();
    unsubscribeProducts = null;
  }

  if (user) {
    listenToProducts(user.uid);
  } else {
    productsGrid.innerHTML = "";
  }
});
