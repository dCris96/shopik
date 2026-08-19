// =========================================================================
// SHOPIK · firebaseConfig.js
// 🔐 Este archivo conecta la app con tu proyecto de Firebase.
// Usa el Firebase Web SDK v10+ en su versión modular, cargado desde el CDN
// oficial de Google (no requiere instalar nada ni usar npm).
//
// 🔧 Nota: se decidió NO implementar modo offline (ni ahora ni a futuro),
// así que Firestore se inicializa de forma simple con getFirestore(), sin
// caché persistente. La app siempre requiere conexión a internet.
// =========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// -------------------------------------------------------------------------
// 🔧 QUÉ DEBO CAMBIAR:
// Reemplaza estos valores con los de TU proyecto de Firebase.
// Los obtienes en: Consola de Firebase → ⚙️ Configuración del proyecto →
// "Tus apps" → ícono Web (</>) → "Configuración del SDK".
// -------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyALQTmJu4kiHZyaDA02BRHTafo_J-D3fM4",
  authDomain: "app-ventas-4f42e.firebaseapp.com",
  projectId: "app-ventas-4f42e",
  storageBucket: "app-ventas-4f42e.firebasestorage.app",
  messagingSenderId: "877479152719",
  appId: "1:877479152719:web:c6244f7dc1446177cdee3a",
  measurementId: "G-HM589N8ZR5",
};

// 🔐 Inicializa la app de Firebase con la configuración anterior
const firebaseApp = initializeApp(firebaseConfig);

// 🔐 Firestore (sin caché offline, ver nota arriba)
const db = getFirestore(firebaseApp);

// 🔐 Autenticación
const auth = getAuth(firebaseApp);
setPersistence(auth, browserLocalPersistence); // Mantiene la sesión iniciada entre visitas

// -------------------------------------------------------------------------
// Exportamos las instancias para usarlas en el resto de archivos JS
// (app.js, auth.js, inventario.js, gastos.js, dashboard.js, etc.)
// -------------------------------------------------------------------------
export { firebaseApp, auth, db };
