// =========================================================================
// SHOPIK · inventario.js
// 🔐 Gestión de productos:
//    - Formulario: foto (cámara o galería, comprimida), nombre, talla,
//      color, costo, precio, stock.
//    - Sube la foto comprimida a Cloudinary y guarda el producto en
//      Firestore, SIEMPRE vinculado al userId de la vendedora.
//    - Escucha en tiempo real (onSnapshot) solo los productos de esa
//      vendedora, así cada una ve únicamente su propio inventario.
// =========================================================================

import { auth, db } from "./firebaseConfig.js";
import { uploadProductPhoto } from "./cloudinary.js";
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

// ---------------------- Referencias al DOM ----------------------
const addProductBtn = document.getElementById("addProductBtn");
const productModal = document.getElementById("productModal");
const closeProductModal = document.getElementById("closeProductModal");

const productForm = document.getElementById("productForm");
const productError = document.getElementById("productError");
const productSubmitBtn = document.getElementById("productSubmitBtn");

const photoPreview = document.getElementById("photoPreview");
const photoPlaceholder = document.getElementById("photoPlaceholder");
const photoCameraBtn = document.getElementById("photoCameraBtn");
const photoGalleryBtn = document.getElementById("photoGalleryBtn");
const inputPhotoCamera = document.getElementById("inputPhotoCamera");
const inputPhotoGallery = document.getElementById("inputPhotoGallery");

const inputProductName = document.getElementById("inputProductName");
const inputSize = document.getElementById("inputSize");
const inputColor = document.getElementById("inputColor");
const inputCost = document.getElementById("inputCost");
const inputPrice = document.getElementById("inputPrice");
const inputStock = document.getElementById("inputStock");

const productsGrid = document.getElementById("productsGrid");
const productsEmpty = document.getElementById("productsEmpty");
const productsNoResults = document.getElementById("productsNoResults");
const productsCount = document.getElementById("productsCount");
const productSearchInput = document.getElementById("productSearchInput");

let selectedPhotoFile = null;
let unsubscribeProducts = null; // guarda la función para dejar de escuchar Firestore al cerrar sesión
let allProducts = []; // caché local de todos los productos, para poder filtrar sin volver a leer Firestore
let searchQuery = "";

// ---------------------- Abrir / cerrar el modal (animado desde abajo) ----------------------
function openModal() {
  productModal.classList.add("is-open");
}

function closeModal() {
  productModal.classList.remove("is-open");
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

// ---------------------- Selección de foto: Cámara o Galería ----------------------
// 🔧 Cada botón dispara su propio input de archivo oculto:
//    - inputPhotoCamera tiene capture="environment" → abre la cámara directo.
//    - inputPhotoGallery no tiene "capture" → abre el selector normal.
photoCameraBtn.addEventListener("click", () => inputPhotoCamera.click());
photoGalleryBtn.addEventListener("click", () => inputPhotoGallery.click());

function handlePhotoSelected(file) {
  if (!file) return;
  selectedPhotoFile = file;

  // 🎨 Vista previa inmediata de la foto elegida (antes de comprimir/subir)
  const reader = new FileReader();
  reader.onload = () => {
    photoPreview.src = reader.result;
    photoPreview.hidden = false;
    photoPlaceholder.hidden = true;
  };
  reader.readAsDataURL(file);
}

inputPhotoCamera.addEventListener("change", () =>
  handlePhotoSelected(inputPhotoCamera.files[0]),
);
inputPhotoGallery.addEventListener("change", () =>
  handlePhotoSelected(inputPhotoGallery.files[0]),
);

// ---------------------- Búsqueda: filtra al instante por nombre, talla o color ----------------------
productSearchInput.addEventListener("input", () => {
  searchQuery = productSearchInput.value.trim().toLowerCase();
  renderProducts();
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
  productSubmitBtn.textContent = "Comprimiendo foto...";

  try {
    // 🔐 1) Comprime la foto en el celular y la sube a Cloudinary (esto sí es
    // una petición HTTP real que conviene esperar antes de continuar)
    const photoURL = await uploadProductPhoto(selectedPhotoFile);

    productSubmitBtn.textContent = "Guardando...";

    // 🔧 2) Guarda el producto en Firestore SIN esperar la confirmación del
    // servidor. Con persistencia offline activa, la promesa de addDoc() no
    // se resuelve hasta que hay conexión y el servidor confirma — si la
    // esperáramos aquí, el botón se quedaría en "Guardando..." para siempre
    // sin buena señal. El producto ya se ve al instante gracias al caché
    // local (por eso aparecía en pantalla aunque el botón no reaccionara),
    // y Firestore lo sincroniza solo en cuanto vuelve la conexión.
    addDoc(collection(db, "products"), {
      userId: user.uid,
      name,
      size,
      color,
      cost,
      price,
      stock,
      photoURL,
      createdAt: serverTimestamp(),
    }).catch((error) => {
      console.error(
        "No se pudo sincronizar el producto con el servidor:",
        error,
      );
    });

    closeModal();
  } catch (error) {
    console.error(error);
    showError(
      "No se pudo subir la foto. Verifica tu conexión e inténtalo de nuevo.",
    );
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

  // 🔐 Eliminar producto. Nota: la foto queda en Cloudinary (borrarla requiere
  // una petición firmada desde un backend, ya que el preset "unsigned" solo
  // permite subir, no eliminar, por seguridad). Puedes limpiar fotos huérfanas
  // desde el propio panel de Cloudinary cuando quieras.
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
      } catch (error) {
        console.error(error);
        alert("No se pudo eliminar el producto.");
      }
    });

  return card;
}

// ---------------------- Filtrar por búsqueda y dibujar la grilla ----------------------
function renderProducts() {
  const filtered = searchQuery
    ? allProducts.filter((p) => {
        const haystack = `${p.name} ${p.size} ${p.color}`.toLowerCase();
        return haystack.includes(searchQuery);
      })
    : allProducts;

  productsGrid.innerHTML = "";

  if (allProducts.length === 0) {
    // Sin productos en absoluto todavía
    productsEmpty.hidden = false;
    productsNoResults.hidden = true;
  } else if (filtered.length === 0) {
    // Hay productos, pero ninguno coincide con la búsqueda
    productsEmpty.hidden = true;
    productsNoResults.hidden = false;
  } else {
    productsEmpty.hidden = true;
    productsNoResults.hidden = true;
    filtered.forEach((product) => {
      productsGrid.appendChild(renderProductCard(product.id, product));
    });
  }

  productsCount.textContent = `${filtered.length} producto${filtered.length === 1 ? "" : "s"}`;
}

// ---------------------- Escuchar los productos de la vendedora en tiempo real ----------------------
function listenToProducts(uid) {
  const productsQuery = query(
    collection(db, "products"),
    where("userId", "==", uid),
    orderBy("createdAt", "desc"),
  );

  unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
    allProducts = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    renderProducts();
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
    allProducts = [];
    searchQuery = "";
    productSearchInput.value = "";
    productsGrid.innerHTML = "";
  }
});
