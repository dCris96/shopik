// =========================================================================
// SHOPIK · gastos.js
// 🔐 Sección Gastos, con dos vistas:
//    - "Gastos": formulario simple (Concepto y Monto) + lista de gastos.
//    - "Ganancia neta": Ventas, Gastos y Ganancia neta del rango elegido,
//      con la lista de movimientos combinados (solo lectura).
//    En ambas vistas se puede elegir el rango de fechas: Hoy, 7 días,
//    Este mes, o un rango Personalizado (Desde/Hasta).
//    El filtrado por fecha se hace en el navegador para no depender de
//    índices compuestos de Firestore.
// =========================================================================

import { auth, db } from "./firebaseConfig.js";
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

// ---------------------- Referencias al DOM: formulario ----------------------
const expenseForm = document.getElementById("expenseForm");
const expenseError = document.getElementById("expenseError");
const expenseSubmitBtn = document.getElementById("expenseSubmitBtn");
const inputConcept = document.getElementById("inputConcept");
const inputAmount = document.getElementById("inputAmount");

// ---------------------- Referencias al DOM: selector de métrica y rango ----------------------
const metricButtons = document.querySelectorAll(
  "#metricControl .segmented-control__btn",
);
const rangeChips = document.querySelectorAll(".range-chip");
const customRange = document.getElementById("customRange");
const rangeFrom = document.getElementById("rangeFrom");
const rangeTo = document.getElementById("rangeTo");
const applyCustomRange = document.getElementById("applyCustomRange");

// ---------------------- Referencias al DOM: vista "Gastos" ----------------------
const summaryExpenses = document.getElementById("summaryExpenses");
const expenseSummaryLabel = document.getElementById("expenseSummaryLabel");
const expenseSummaryTotal = document.getElementById("expenseSummaryTotal");
const expenseList = document.getElementById("expenseList");
const expenseEmpty = document.getElementById("expenseEmpty");

// ---------------------- Referencias al DOM: vista "Ganancia neta" ----------------------
const summaryProfit = document.getElementById("summaryProfit");
const profitSales = document.getElementById("profitSales");
const profitExpenses = document.getElementById("profitExpenses");
const profitNet = document.getElementById("profitNet");
const rangeMovementsList = document.getElementById("rangeMovementsList");
const rangeMovementsEmpty = document.getElementById("rangeMovementsEmpty");

let allExpenses = []; // todos los gastos de la vendedora (con fecha ya convertida)
let allSales = []; // todas las ventas de la vendedora (con fecha ya convertida)
let currentMetric = "expenses"; // "expenses" | "profit"
let currentRange = "today"; // "today" | "week" | "month" | "custom"
let customFromDate = null;
let customToDate = null;
let unsubscribeExpenses = null;
let unsubscribeSales = null;

// =========================================================================
// GUARDAR UN GASTO (submit del formulario)
// =========================================================================
expenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideError();

  const user = auth.currentUser;
  if (!user) return;

  const concept = inputConcept.value.trim();
  const amount = parseFloat(inputAmount.value);

  if (!concept || isNaN(amount) || amount <= 0) {
    showError("Escribe un concepto y un monto válido.");
    return;
  }

  expenseSubmitBtn.disabled = true;
  expenseSubmitBtn.textContent = "Guardando...";

  // 🔧 No esperamos (await) la confirmación del servidor: con persistencia
  // offline activa, esa promesa no se resuelve hasta que hay conexión, y el
  // botón se quedaría en "Guardando..." indefinidamente sin buena señal.
  // El gasto ya se refleja al instante gracias al caché local de Firestore.
  addDoc(collection(db, "expenses"), {
    userId: user.uid,
    concept,
    amount,
    createdAt: serverTimestamp(),
  }).catch((error) => {
    console.error("No se pudo sincronizar el gasto con el servidor:", error);
  });

  expenseForm.reset();
  expenseSubmitBtn.disabled = false;
  expenseSubmitBtn.textContent = "Agregar gasto";
});

function showError(message) {
  expenseError.textContent = message;
  expenseError.hidden = false;
}
function hideError() {
  expenseError.hidden = true;
  expenseError.textContent = "";
}

// =========================================================================
// SELECTOR DE MÉTRICA: Gastos | Ganancia neta
// =========================================================================
metricButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    currentMetric = btn.dataset.metric;
    metricButtons.forEach((b) => b.classList.toggle("is-active", b === btn));

    const isProfit = currentMetric === "profit";

    // Vista "Gastos": formulario + resumen simple + lista de gastos
    expenseForm.hidden = isProfit;
    summaryExpenses.hidden = isProfit;
    expenseList.hidden = isProfit;
    expenseEmpty.hidden = isProfit ? true : expenseEmpty.hidden;

    // Vista "Ganancia neta": resumen de 3 columnas + lista combinada (solo lectura)
    summaryProfit.hidden = !isProfit;
    rangeMovementsList.hidden = !isProfit;
    rangeMovementsEmpty.hidden = !isProfit ? true : rangeMovementsEmpty.hidden;

    renderAll();
  });
});

// =========================================================================
// SELECTOR DE RANGO: Hoy | 7 días | Este mes | Personalizado
// =========================================================================
rangeChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    currentRange = chip.dataset.range;
    rangeChips.forEach((c) => c.classList.toggle("is-active", c === chip));

    customRange.hidden = currentRange !== "custom";

    const labels = {
      today: "hoy",
      week: "en los últimos 7 días",
      month: "este mes",
      custom: "en el rango elegido",
    };
    expenseSummaryLabel.textContent = `Total gastado ${labels[currentRange]}`;

    // El rango "Personalizado" espera a que la vendedora toque "Aplicar rango"
    if (currentRange !== "custom") renderAll();
  });
});

applyCustomRange.addEventListener("click", () => {
  if (!rangeFrom.value || !rangeTo.value) {
    alert("Elige una fecha de inicio y de fin.");
    return;
  }
  customFromDate = new Date(`${rangeFrom.value}T00:00:00`);
  customToDate = new Date(`${rangeTo.value}T23:59:59`);
  renderAll();
});

// ---------------------- Utilidades de fecha ----------------------
function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function isWithinLastDays(date, days) {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  cutoff.setHours(0, 0, 0, 0);
  return date >= cutoff && date <= now;
}

// 🔧 Filtro central de fechas: aquí se decide qué entra según el rango elegido
function isInSelectedRange(date) {
  if (!date) return false;
  const now = new Date();

  switch (currentRange) {
    case "today":
      return isSameDay(date, now);
    case "week":
      return isWithinLastDays(date, 7);
    case "month":
      return isSameMonth(date, now);
    case "custom":
      if (!customFromDate || !customToDate) return false;
      return date >= customFromDate && date <= customToDate;
    default:
      return false;
  }
}

function formatDate(date) {
  return date.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// =========================================================================
// VISTA "GASTOS": lista simple + total
// =========================================================================
function renderExpenseRow(expenseId, expense, date) {
  const row = document.createElement("div");
  row.className = "expense-row";

  row.innerHTML = `
    <div class="expense-row__icon">💸</div>
    <div class="expense-row__info">
      <div class="expense-row__concept">${expense.concept}</div>
      <div class="expense-row__date">${formatDate(date)}</div>
    </div>
    <div class="expense-row__amount">-S/ ${Number(expense.amount).toFixed(2)}</div>
    <button class="expense-row__delete" type="button" aria-label="Eliminar gasto">✕</button>
  `;

  row
    .querySelector(".expense-row__delete")
    .addEventListener("click", async () => {
      const confirmDelete = confirm(`¿Eliminar el gasto "${expense.concept}"?`);
      if (!confirmDelete) return;
      try {
        await deleteDoc(doc(db, "expenses", expenseId));
      } catch (error) {
        console.error(error);
        alert("No se pudo eliminar el gasto.");
      }
    });

  return row;
}

function renderExpensesView(filteredExpenses) {
  expenseList.innerHTML = "";

  if (filteredExpenses.length === 0) {
    expenseEmpty.hidden = false;
  } else {
    expenseEmpty.hidden = true;
    filteredExpenses.forEach((item) => {
      expenseList.appendChild(renderExpenseRow(item.id, item, item.date));
    });
  }

  const total = filteredExpenses.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  );
  expenseSummaryTotal.textContent = `S/ ${total.toFixed(2)}`;
}

// =========================================================================
// VISTA "GANANCIA NETA": Ventas, Gastos, Ganancia + movimientos combinados
// =========================================================================
function renderProfitView(filteredExpenses, filteredSales) {
  const salesTotal = filteredSales.reduce(
    (sum, s) => sum + Number(s.total || 0),
    0,
  );
  const expensesTotal = filteredExpenses.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0,
  );
  const net = salesTotal - expensesTotal;

  profitSales.textContent = `S/ ${salesTotal.toFixed(2)}`;
  profitExpenses.textContent = `S/ ${expensesTotal.toFixed(2)}`;
  profitNet.textContent = `S/ ${net.toFixed(2)}`;
  profitNet.style.color =
    net < 0 ? "var(--color-danger)" : "var(--color-success)";

  const movements = [
    ...filteredSales.map((s) => ({
      type: "sale",
      date: s.date,
      title: s.productName,
      amount: s.total,
    })),
    ...filteredExpenses.map((e) => ({
      type: "expense",
      date: e.date,
      title: e.concept,
      amount: e.amount,
    })),
  ].sort((a, b) => b.date - a.date);

  rangeMovementsList.innerHTML = "";

  if (movements.length === 0) {
    rangeMovementsEmpty.hidden = false;
    return;
  }
  rangeMovementsEmpty.hidden = true;

  movements.forEach((m) => {
    const isSale = m.type === "sale";
    const row = document.createElement("div");
    row.className = "movement-row";
    row.innerHTML = `
      <div class="movement-row__icon movement-row__icon--${m.type}">${isSale ? "💰" : "💸"}</div>
      <div class="movement-row__info">
        <div class="movement-row__title">${m.title}</div>
        <div class="movement-row__time">${formatDate(m.date)}</div>
      </div>
      <div class="movement-row__amount movement-row__amount--${m.type}">
        ${isSale ? "+" : "-"}S/ ${Number(m.amount).toFixed(2)}
      </div>
    `;
    rangeMovementsList.appendChild(row);
  });
}

// ---------------------- Aplica el filtro de rango y dibuja la vista activa ----------------------
function renderAll() {
  const filteredExpenses = allExpenses.filter((e) => isInSelectedRange(e.date));

  if (currentMetric === "expenses") {
    renderExpensesView(filteredExpenses);
  } else {
    const filteredSales = allSales.filter((s) => isInSelectedRange(s.date));
    renderProfitView(filteredExpenses, filteredSales);
  }
}

// =========================================================================
// ESCUCHAS EN TIEMPO REAL
// =========================================================================
function listenToExpenses(uid) {
  const expensesQuery = query(
    collection(db, "expenses"),
    where("userId", "==", uid),
    orderBy("createdAt", "desc"),
  );
  unsubscribeExpenses = onSnapshot(expensesQuery, (snapshot) => {
    allExpenses = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        date: data.createdAt ? data.createdAt.toDate() : new Date(),
      };
    });
    renderAll();
  });
}

function listenToSales(uid) {
  const salesQuery = query(
    collection(db, "sales"),
    where("userId", "==", uid),
    orderBy("createdAt", "desc"),
  );
  unsubscribeSales = onSnapshot(salesQuery, (snapshot) => {
    allSales = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        date: data.createdAt ? data.createdAt.toDate() : new Date(),
      };
    });
    if (currentMetric === "profit") renderAll();
  });
}

// ---------------------- Activar / desactivar la escucha según la sesión ----------------------
onAuthStateChanged(auth, (user) => {
  if (unsubscribeExpenses) {
    unsubscribeExpenses();
    unsubscribeExpenses = null;
  }
  if (unsubscribeSales) {
    unsubscribeSales();
    unsubscribeSales = null;
  }

  if (user) {
    listenToExpenses(user.uid);
    listenToSales(user.uid);
  } else {
    allExpenses = [];
    allSales = [];
    expenseList.innerHTML = "";
    rangeMovementsList.innerHTML = "";
  }
});
