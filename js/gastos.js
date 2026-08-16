// =========================================================================
// VENTAFÁCIL · gastos.js
// 🔐 Registro de gastos:
//    - Formulario simple: Concepto y Monto.
//    - Se guarda en la colección "expenses", vinculado al userId de la
//      vendedora, igual que en Inventario.
//    - La lista se puede filtrar entre "Hoy" y "Este mes" (el filtrado
//      por fecha se hace en el navegador para no depender de índices
//      compuestos de Firestore).
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

// ---------------------- Referencias al DOM ----------------------
const expenseForm = document.getElementById("expenseForm");
const expenseError = document.getElementById("expenseError");
const expenseSubmitBtn = document.getElementById("expenseSubmitBtn");

const inputConcept = document.getElementById("inputConcept");
const inputAmount = document.getElementById("inputAmount");

const rangeButtons = document.querySelectorAll(".segmented-control__btn");
const expenseSummaryLabel = document.getElementById("expenseSummaryLabel");
const expenseSummaryTotal = document.getElementById("expenseSummaryTotal");

const expenseList = document.getElementById("expenseList");
const expenseEmpty = document.getElementById("expenseEmpty");

let allExpenses = []; // todos los gastos de la vendedora, ya ordenados por fecha
let currentRange = "today"; // "today" | "month"
let unsubscribeExpenses = null;

// ---------------------- Guardar un gasto (submit del formulario) ----------------------
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

  try {
    // 🔐 Guarda el gasto en Firestore, vinculado al userId de la vendedora
    await addDoc(collection(db, "expenses"), {
      userId: user.uid,
      concept,
      amount,
      createdAt: serverTimestamp(),
    });
    expenseForm.reset();
  } catch (error) {
    console.error(error);
    showError("No se pudo guardar el gasto. Inténtalo de nuevo.");
  } finally {
    expenseSubmitBtn.disabled = false;
    expenseSubmitBtn.textContent = "Agregar gasto";
  }
});

function showError(message) {
  expenseError.textContent = message;
  expenseError.hidden = false;
}

function hideError() {
  expenseError.hidden = true;
  expenseError.textContent = "";
}

// ---------------------- Selector Hoy / Este mes ----------------------
rangeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    currentRange = btn.dataset.range;
    rangeButtons.forEach((b) => b.classList.toggle("is-active", b === btn));
    expenseSummaryLabel.textContent =
      currentRange === "today" ? "Total gastado hoy" : "Total gastado este mes";
    renderExpenses();
  });
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

function formatDate(date) {
  return date.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------- Dibujar una fila de gasto ----------------------
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

// ---------------------- Filtrar y pintar la lista según Hoy / Este mes ----------------------
function renderExpenses() {
  const now = new Date();

  const filtered = allExpenses.filter((item) => {
    if (!item.date) return false;
    return currentRange === "today"
      ? isSameDay(item.date, now)
      : isSameMonth(item.date, now);
  });

  expenseList.innerHTML = "";

  if (filtered.length === 0) {
    expenseEmpty.hidden = false;
  } else {
    expenseEmpty.hidden = true;
    filtered.forEach((item) => {
      expenseList.appendChild(renderExpenseRow(item.id, item, item.date));
    });
  }

  const total = filtered.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  );
  expenseSummaryTotal.textContent = `S/ ${total.toFixed(2)}`;
}

// ---------------------- Escuchar los gastos de la vendedora en tiempo real ----------------------
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
        // createdAt puede tardar un instante en llegar del servidor; si aún no está, usamos "ahora"
        date: data.createdAt ? data.createdAt.toDate() : new Date(),
      };
    });
    renderExpenses();
  });
}

// ---------------------- Activar / desactivar la escucha según la sesión ----------------------
onAuthStateChanged(auth, (user) => {
  if (unsubscribeExpenses) {
    unsubscribeExpenses();
    unsubscribeExpenses = null;
  }

  if (user) {
    listenToExpenses(user.uid);
  } else {
    allExpenses = [];
    expenseList.innerHTML = "";
  }
});
