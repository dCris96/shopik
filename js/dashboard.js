// =========================================================================
// SHOPIK · dashboard.js
// 🔐 Cerebro de la pantalla Principal:
//    - Registrar Venta: elige un producto del inventario, descuenta stock
//      y guarda la venta en la colección "sales".
//    - Registrar Gasto: mini formulario que usa la misma colección
//      "expenses" que la sección Gastos (Fase 4).
//    - Agregar Producto: reutiliza el modal ya construido en Inventario
//      (Fase 3), así no duplicamos ese formulario.
//    - Resumen en tiempo real: Ventas de hoy, Gastos de hoy y Ganancia
//      neta, más la lista de últimos movimientos del día.
// =========================================================================

import { auth, db } from "./firebaseConfig.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  collection,
  addDoc,
  doc,
  updateDoc,
  increment,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ---------------------- Referencias al DOM: resumen ----------------------
const salesTodayEl = document.getElementById("salesToday");
const expensesTodayEl = document.getElementById("expensesToday");
const netProfitTodayEl = document.getElementById("netProfitToday");
const movementsList = document.getElementById("movementsList");
const movementsEmpty = document.getElementById("movementsEmpty");

// ---------------------- Referencias al DOM: acciones rápidas ----------------------
const quickSaleBtn = document.getElementById("quickSaleBtn");
const quickExpenseBtn = document.getElementById("quickExpenseBtn");
const quickProductBtn = document.getElementById("quickProductBtn");

// ---------------------- Referencias al DOM: modal Registrar Venta ----------------------
const saleModal = document.getElementById("saleModal");
const closeSaleModal = document.getElementById("closeSaleModal");
const saleForm = document.getElementById("saleForm");
const saleError = document.getElementById("saleError");
const saleSubmitBtn = document.getElementById("saleSubmitBtn");
const saleProductSelect = document.getElementById("saleProductSelect");
const saleQuantity = document.getElementById("saleQuantity");
const saleTotalPreview = document.getElementById("saleTotalPreview");

// ---------------------- Referencias al DOM: mini-modal Gasto rápido ----------------------
const quickExpenseModal = document.getElementById("quickExpenseModal");
const closeQuickExpenseModal = document.getElementById(
  "closeQuickExpenseModal",
);
const quickExpenseForm = document.getElementById("quickExpenseForm");
const quickExpenseError = document.getElementById("quickExpenseError");
const quickExpenseSubmitBtn = document.getElementById("quickExpenseSubmitBtn");
const quickExpenseConcept = document.getElementById("quickExpenseConcept");
const quickExpenseAmount = document.getElementById("quickExpenseAmount");

let productsCache = []; // productos disponibles de la vendedora, para el selector de venta
let todaySales = [];
let todayExpenses = [];
let unsubscribers = []; // guarda todos los onSnapshot activos para limpiarlos al cerrar sesión

// =========================================================================
// ACCIONES RÁPIDAS: abrir cada modal
// =========================================================================
quickSaleBtn.addEventListener("click", () => {
  if (productsCache.length === 0) {
    alert("Primero agrega al menos un producto en Inventario.");
    return;
  }
  saleModal.classList.add("is-open");
  updateSaleTotalPreview();
});

quickExpenseBtn.addEventListener("click", () => {
  quickExpenseModal.classList.add("is-open");
});

// 🎨 Reutiliza el modal de "Agregar producto" ya construido en inventario.js (Fase 3)
quickProductBtn.addEventListener("click", () => {
  document.getElementById("addProductBtn").click();
});

closeSaleModal.addEventListener("click", () => {
  saleModal.classList.remove("is-open");
  saleForm.reset();
  hideError(saleError);
});
saleModal.addEventListener("click", (e) => {
  if (e.target === saleModal) closeSaleModal.click();
});

closeQuickExpenseModal.addEventListener("click", () => {
  quickExpenseModal.classList.remove("is-open");
  quickExpenseForm.reset();
  hideError(quickExpenseError);
});
quickExpenseModal.addEventListener("click", (e) => {
  if (e.target === quickExpenseModal) closeQuickExpenseModal.click();
});

function showError(el, message) {
  el.textContent = message;
  el.hidden = false;
}
function hideError(el) {
  el.hidden = true;
  el.textContent = "";
}

// =========================================================================
// REGISTRAR VENTA
// =========================================================================

// Rellena el selector de productos con el inventario disponible (con stock > 0)
function populateSaleProductSelect() {
  const previousValue = saleProductSelect.value;
  saleProductSelect.innerHTML = "";

  productsCache
    .filter((p) => p.stock > 0)
    .forEach((product) => {
      const option = document.createElement("option");
      option.value = product.id;
      option.textContent = `${product.name} · S/ ${Number(product.price).toFixed(2)} (${product.stock} disp.)`;
      saleProductSelect.appendChild(option);
    });

  if (previousValue) saleProductSelect.value = previousValue;
  updateSaleTotalPreview();
}

function getSelectedProduct() {
  return productsCache.find((p) => p.id === saleProductSelect.value);
}

function updateSaleTotalPreview() {
  const product = getSelectedProduct();
  const qty = parseInt(saleQuantity.value, 10) || 0;
  const total = product ? product.price * qty : 0;
  saleTotalPreview.textContent = `S/ ${total.toFixed(2)}`;
}

saleProductSelect.addEventListener("change", updateSaleTotalPreview);
saleQuantity.addEventListener("input", updateSaleTotalPreview);

saleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideError(saleError);

  const user = auth.currentUser;
  if (!user) return;

  const product = getSelectedProduct();
  const quantity = parseInt(saleQuantity.value, 10);

  if (!product) {
    showError(saleError, "Selecciona un producto.");
    return;
  }
  if (!quantity || quantity <= 0) {
    showError(saleError, "Ingresa una cantidad válida.");
    return;
  }
  if (quantity > product.stock) {
    showError(
      saleError,
      `Solo tienes ${product.stock} unidad(es) de este producto.`,
    );
    return;
  }

  const total = product.price * quantity;

  saleSubmitBtn.disabled = true;
  saleSubmitBtn.textContent = "Guardando...";

  // 🔧 No esperamos (await) la confirmación del servidor de estas dos
  // escrituras: con persistencia offline activa, esas promesas no se
  // resuelven hasta que hay conexión, y el botón se quedaría en
  // "Guardando..." para siempre sin buena señal. Ambas ya se aplican al
  // instante en el caché local (la venta se ve en el dashboard y el stock
  // se descuenta de inmediato), y se sincronizan solas al recuperar señal.
  addDoc(collection(db, "sales"), {
    userId: user.uid,
    productId: product.id,
    productName: product.name,
    unitPrice: product.price,
    quantity,
    total,
    createdAt: serverTimestamp(),
  }).catch((error) => {
    console.error("No se pudo sincronizar la venta con el servidor:", error);
  });

  updateDoc(doc(db, "products", product.id), {
    stock: increment(-quantity),
  }).catch((error) => {
    console.error("No se pudo sincronizar el descuento de stock:", error);
  });

  saleModal.classList.remove("is-open");
  saleForm.reset();
  saleQuantity.value = 1;
  saleSubmitBtn.disabled = false;
  saleSubmitBtn.textContent = "Confirmar venta";
});

// =========================================================================
// GASTO RÁPIDO (mismo destino que la sección Gastos: colección "expenses")
// =========================================================================
quickExpenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideError(quickExpenseError);

  const user = auth.currentUser;
  if (!user) return;

  const concept = quickExpenseConcept.value.trim();
  const amount = parseFloat(quickExpenseAmount.value);

  if (!concept || isNaN(amount) || amount <= 0) {
    showError(quickExpenseError, "Escribe un concepto y un monto válido.");
    return;
  }

  quickExpenseSubmitBtn.disabled = true;
  quickExpenseSubmitBtn.textContent = "Guardando...";

  // 🔧 Mismo motivo que en los otros dos formularios: no esperamos la
  // confirmación del servidor para no dejar el botón colgado sin conexión.
  addDoc(collection(db, "expenses"), {
    userId: user.uid,
    concept,
    amount,
    createdAt: serverTimestamp(),
  }).catch((error) => {
    console.error("No se pudo sincronizar el gasto con el servidor:", error);
  });

  quickExpenseModal.classList.remove("is-open");
  quickExpenseForm.reset();
  quickExpenseSubmitBtn.disabled = false;
  quickExpenseSubmitBtn.textContent = "Guardar gasto";
});

// =========================================================================
// RESUMEN EN TIEMPO REAL: Ventas de hoy, Gastos de hoy, Ganancia neta
// =========================================================================
function isToday(date) {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function formatTime(date) {
  return date.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderSummary() {
  const salesTotal = todaySales.reduce(
    (sum, s) => sum + Number(s.total || 0),
    0,
  );
  const expensesTotal = todayExpenses.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0,
  );
  const net = salesTotal - expensesTotal;

  salesTodayEl.textContent = `S/ ${salesTotal.toFixed(2)}`;
  expensesTodayEl.textContent = `S/ ${expensesTotal.toFixed(2)}`;
  netProfitTodayEl.textContent = `S/ ${net.toFixed(2)}`;
  netProfitTodayEl.style.color =
    net < 0 ? "var(--color-danger)" : "var(--color-text)";

  renderMovements();
}

// Combina ventas y gastos de hoy en una sola lista ordenada por hora
function renderMovements() {
  const movements = [
    ...todaySales.map((s) => ({
      type: "sale",
      date: s.date,
      title: s.productName,
      amount: s.total,
    })),
    ...todayExpenses.map((e) => ({
      type: "expense",
      date: e.date,
      title: e.concept,
      amount: e.amount,
    })),
  ].sort((a, b) => b.date - a.date);

  movementsList.innerHTML = "";

  if (movements.length === 0) {
    movementsEmpty.hidden = false;
    return;
  }
  movementsEmpty.hidden = true;

  movements.forEach((m) => {
    const row = document.createElement("div");
    row.className = "movement-row";
    const isSale = m.type === "sale";

    row.innerHTML = `
      <div class="movement-row__icon movement-row__icon--${m.type}">${isSale ? "💰" : "💸"}</div>
      <div class="movement-row__info">
        <div class="movement-row__title">${m.title}</div>
        <div class="movement-row__time">${formatTime(m.date)}</div>
      </div>
      <div class="movement-row__amount movement-row__amount--${m.type}">
        ${isSale ? "+" : "-"}S/ ${Number(m.amount).toFixed(2)}
      </div>
    `;
    movementsList.appendChild(row);
  });
}

// ---------------------- Escuchas en tiempo real ----------------------
function listenToProducts(uid) {
  const productsQuery = query(
    collection(db, "products"),
    where("userId", "==", uid),
  );
  const unsub = onSnapshot(productsQuery, (snapshot) => {
    productsCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    populateSaleProductSelect();
  });
  unsubscribers.push(unsub);
}

function listenToSales(uid) {
  const salesQuery = query(
    collection(db, "sales"),
    where("userId", "==", uid),
    orderBy("createdAt", "desc"),
  );
  const unsub = onSnapshot(salesQuery, (snapshot) => {
    todaySales = snapshot.docs
      .map((d) => {
        const data = d.data();
        return {
          ...data,
          date: data.createdAt ? data.createdAt.toDate() : new Date(),
        };
      })
      .filter((s) => isToday(s.date));
    renderSummary();
  });
  unsubscribers.push(unsub);
}

function listenToExpensesToday(uid) {
  const expensesQuery = query(
    collection(db, "expenses"),
    where("userId", "==", uid),
    orderBy("createdAt", "desc"),
  );
  const unsub = onSnapshot(expensesQuery, (snapshot) => {
    todayExpenses = snapshot.docs
      .map((d) => {
        const data = d.data();
        return {
          ...data,
          date: data.createdAt ? data.createdAt.toDate() : new Date(),
        };
      })
      .filter((e) => isToday(e.date));
    renderSummary();
  });
  unsubscribers.push(unsub);
}

// ---------------------- Activar / desactivar todo según la sesión ----------------------
onAuthStateChanged(auth, (user) => {
  unsubscribers.forEach((unsub) => unsub());
  unsubscribers = [];

  if (user) {
    listenToProducts(user.uid);
    listenToSales(user.uid);
    listenToExpensesToday(user.uid);
  } else {
    productsCache = [];
    todaySales = [];
    todayExpenses = [];
    movementsList.innerHTML = "";
  }
});
