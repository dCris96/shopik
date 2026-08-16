// =========================================================================
// VENTAFÁCIL · auth.js
// 🔐 Maneja todo el flujo de autenticación con Firebase Auth:
//    - Registro de nuevas vendedoras (crea también su documento de perfil)
//    - Inicio de sesión
//    - Mantener la sesión activa (onAuthStateChanged)
//    - Cerrar sesión
// Cada vendedora solo verá su propia información porque todo el resto de
// la app (Fases 3, 4 y 5) consulta las colecciones filtrando por su
// auth.currentUser.uid.
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
const authScreen = document.getElementById("authScreen");
const appRoot = document.getElementById("appRoot");

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
    authForm.reset();
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

// ---------------------- Mantener sesión activa ----------------------
// Se ejecuta automáticamente cada vez que cambia el estado de autenticación:
// al cargar la app, al iniciar sesión, al registrarse y al cerrar sesión.
onAuthStateChanged(auth, (user) => {
  if (user) {
    // Sesión activa: muestra la app y oculta la pantalla de login/registro
    authScreen.hidden = true;
    appRoot.hidden = false;

    const displayName = user.displayName || user.email || "Vendedora";
    userInitial.textContent = displayName.trim().charAt(0).toUpperCase();
  } else {
    // Sin sesión: muestra login/registro y oculta la app
    appRoot.hidden = true;
    authScreen.hidden = false;
    setMode("login");
  }
});
