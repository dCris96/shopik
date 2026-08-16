// =========================================================================
// VENTAFÁCIL · app.js
// Lógica general de navegación entre las 3 secciones principales.
// En las fases siguientes, cada sección importará su propio módulo
// (dashboard.js, gastos.js, inventario.js) para manejar sus datos con Firebase.
// =========================================================================

const navButtons = document.querySelectorAll(".bottom-nav__item");
const screens = document.querySelectorAll(".screen");
const headerTitle = document.getElementById("headerTitle");
const addProductBtn = document.getElementById("addProductBtn");

// 🎨 Título del header según la sección activa (personalizable)
const titlesByScreen = {
  principal: "Principal",
  gastos: "Gastos",
  inventario: "Inventario",
};

/**
 * Cambia la sección visible de la app.
 * @param {string} targetScreen - id de la sección ("principal" | "gastos" | "inventario")
 */
function showScreen(targetScreen) {
  // Oculta todas las secciones y muestra solo la seleccionada
  screens.forEach((screen) => {
    const isTarget = screen.dataset.screen === targetScreen;
    screen.hidden = !isTarget;
  });

  // Actualiza el estado visual (círculo coral) de los botones de navegación
  navButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.target === targetScreen);
  });

  // Actualiza el título del header
  headerTitle.textContent = titlesByScreen[targetScreen] ?? "";

  // 🎨 El botón flotante "+" solo tiene sentido en la sección Inventario
  addProductBtn.hidden = targetScreen !== "inventario";
}

// Escucha los clics en cada botón de la barra inferior
navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    showScreen(btn.dataset.target);
  });
});

// 🔧 Sección inicial al abrir la app (personalizable)
showScreen("principal");
