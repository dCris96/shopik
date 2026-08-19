// =========================================================================
// SHOPIK · auth.js
// 🔐 Maneja todo el flujo de autenticación con Firebase Auth:
//    - Registro de nuevas vendedoras (crea también su documento de perfil)
//    - Inicio de sesión
//    - Mantener la sesión activa (onAuthStateChanged)
//    - Cerrar sesión
// 🎨 También coordina dos animaciones:
//    - El splash screen al abrir la app (mientras Firebase resuelve si ya
//      había una sesión guardada).
//    - El check de "¡Listo!" que aparece un instante justo después de que
//      el login o registro se confirman con éxito.
// Cada vendedora solo verá su propia información porque todo el resto de
// la app consulta las colecciones filtrando por su auth.currentUser.uid.
// =========================================================================

import { auth, db } from "./firebaseConfig.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ---------------------- Referencias al DOM ----------------------
const splashScreen = document.getElementById("splashScreen");
const authScreen = document.getElementById("authScreen");
const appRoot = document.getElementById("appRoot");
const authSuccessOverlay = document.getElementById("authSuccessOverlay");

const authForm = document.getElementById("authForm");
const authError = document.getElementById("authError");
const authSubmitBtn = document.getElementById("authSubmitBtn");

const tabButtons = document.querySelectorAll(".auth-tabs__btn");
const fieldName = document.getElementById("fieldName");
const inputName = document.getElementById("inputName");
const inputEmail = document.getElementById("inputEmail");
const inputPassword = document.getElementById("inputPassword");

const authSwitchText = document.getElementById("authSwitchText");
const authSwitchBtn = document.getElementById("authSwitchBtn");

const userInitial = document.getElementById("userInitial");
const logoutBtn = document.getElementById("logoutBtn");

// "login" | "register" — controla qué hace el formulario al enviarse
let currentMode = "login";

// 🎨 Coordinación de animaciones ---------------------------------------
const SPLASH_MIN_TIME = 700; // ms mínimos que se ve el splash, para que no "parpadee"
const SUCCESS_ANIM_TIME = 750; // ms que dura la animación de bienvenida tras iniciar sesión
const splashStartedAt = Date.now();
let isFirstAuthCheck = true; // true solo la primera vez que Firebase resuelve el estado de sesión
let justAuthenticated = false; // true justo después de un login/registro exitoso desde el formulario

// ---------------------- Alternar entre pestañas Login / Registro ----------------------
function setMode(mode) {
  currentMode = mode;
  hideError();

  tabButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.mode === mode);
  });

  const isRegister = mode === "register";
  fieldName.hidden = !isRegister;
  inputName.required = isRegister;

  authSubmitBtn.textContent = isRegister ? "Crear cuenta" : "Iniciar sesión";
  authSwitchText.textContent = isRegister
    ? "¿Ya tienes cuenta?"
    : "¿No tienes cuenta?";
  authSwitchBtn.textContent = isRegister ? "Iniciar sesión" : "Crear una";
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

authSwitchBtn.addEventListener("click", () => {
  setMode(currentMode === "login" ? "register" : "login");
});

// ---------------------- Manejo de errores en pantalla ----------------------
function showError(message) {
  authError.textContent = message;
  authError.hidden = false;
}

function hideError() {
  authError.hidden = true;
  authError.textContent = "";
}

// 🎨 Traduce los códigos de error técnicos de Firebase a mensajes claros para la vendedora
function translateAuthError(error) {
  const map = {
    "auth/invalid-email": "El correo no es válido.",
    "auth/missing-password": "Escribe una contraseña.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/email-already-in-use":
      "Ese correo ya tiene una cuenta. Inicia sesión.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/wrong-password": "Correo o contraseña incorrectos.",
    "auth/user-not-found": "No existe una cuenta con ese correo.",
    "auth/too-many-requests":
      "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
  };
  return map[error.code] || "Ocurrió un error. Inténtalo de nuevo.";
}

// ---------------------- Envío del formulario (Login o Registro) ----------------------
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideError();

  const email = inputEmail.value.trim();
  const password = inputPassword.value;
  const name = inputName.value.trim();

  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = "Un momento...";

  try {
    if (currentMode === "register") {
      // 🔐 Crea la cuenta en Firebase Auth
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );

      // Guarda el nombre en el perfil de Auth
      await updateProfile(credential.user, { displayName: name });

      // 🔐 Crea el documento de perfil en Firestore, en la colección "sellers"
      // Cada documento usa el UID como ID, así queda vinculado 1 a 1 con la vendedora
      await setDoc(doc(db, "sellers", credential.user.uid), {
        name,
        email,
        createdAt: serverTimestamp(),
      });
    } else {
      // 🔐 Inicia sesión con una cuenta existente
      await signInWithEmailAndPassword(auth, email, password);
    }

    // 🎨 Login/registro exitosos: dispara la animación de bienvenida.
    // onAuthStateChanged ya se disparó (o está por dispararse) con el nuevo
    // usuario, pero justAuthenticated=true hace que ESPERE a mostrar la app
    // hasta que termine esta animación, en vez de cortarla de golpe.
    justAuthenticated = true;
    authSuccessOverlay.classList.add("is-visible");
    authForm.reset();

    setTimeout(() => {
      authSuccessOverlay.classList.remove("is-visible");
      justAuthenticated = false;
      revealAppIfAuthenticated();
    }, SUCCESS_ANIM_TIME);
  } catch (error) {
    showError(translateAuthError(error));
  } finally {
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent =
      currentMode === "register" ? "Crear cuenta" : "Iniciar sesión";
  }
});

// ---------------------- Cerrar sesión ----------------------
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

// ---------------------- Splash screen ----------------------
// 🎨 Se oculta cuando Firebase ya resolvió el primer estado de sesión Y ya
// pasó el tiempo mínimo, para que la animación no se sienta como un parpadeo.
function hideSplash() {
  const elapsed = Date.now() - splashStartedAt;
  const remaining = Math.max(0, SPLASH_MIN_TIME - elapsed);
  setTimeout(() => splashScreen.classList.add("is-hidden"), remaining);
}

// ---------------------- Mostrar la app o el login, según corresponda ----------------------
function revealAppIfAuthenticated() {
  const user = auth.currentUser;
  if (user) {
    authScreen.hidden = true;
    appRoot.hidden = false;
    const displayName = user.displayName || user.email || "Vendedora";
    userInitial.textContent = displayName.trim().charAt(0).toUpperCase();
  } else {
    appRoot.hidden = true;
    authScreen.hidden = false;
    setMode("login");
  }
}

// ---------------------- Mantener sesión activa ----------------------
// Se ejecuta automáticamente cada vez que cambia el estado de autenticación:
// al cargar la app, al iniciar sesión, al registrarse y al cerrar sesión.
onAuthStateChanged(auth, (user) => {
  if (isFirstAuthCheck) {
    isFirstAuthCheck = false;
    hideSplash();
  }

  // 🎨 Si el cambio vino de un login/registro recién hecho desde el
  // formulario, dejamos que termine su animación de bienvenida antes de
  // cambiar de pantalla (lo hace revealAppIfAuthenticated() en el setTimeout).
  if (justAuthenticated) return;

  revealAppIfAuthenticated();
});
