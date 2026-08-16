// =========================================================================
// VENTAFÁCIL · firebaseConfig.js
// 🔐 Este archivo conecta la app con tu proyecto de Firebase.
// Usa el Firebase Web SDK v10+ en su versión modular, cargado desde el CDN
// oficial de Google (no requiere instalar nada ni usar npm).
// =========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

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

// -------------------------------------------------------------------------
// 🔐 FIRESTORE con persistencia offline habilitada.
// Esto permite que la vendedora siga registrando ventas, gastos y productos
// aunque se quede sin señal dentro del centro comercial; Firestore
// sincroniza automáticamente en cuanto vuelve la conexión.
// (Usamos persistentLocalCache, que es el equivalente moderno de
// enableIndexedDbPersistence en el SDK v10+)
// -------------------------------------------------------------------------
const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({
    tabManager: persistentSingleTabManager({}),
  }),
});

// 🔐 Autenticación (se configura a fondo en la FASE 2)
const auth = getAuth(firebaseApp);
setPersistence(auth, browserLocalPersistence); // Mantiene la sesión iniciada entre visitas

// 🔐 Storage: aquí se guardarán las fotos de los productos (Fase 3)
const storage = getStorage(firebaseApp);

// -------------------------------------------------------------------------
// Exportamos las instancias para usarlas en el resto de archivos JS
// (app.js, auth.js, inventario.js, gastos.js, dashboard.js, etc.)
// -------------------------------------------------------------------------
export { firebaseApp, auth, db, storage };
