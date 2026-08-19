// =========================================================================
// SHOPIK · sw.js
// 🔧 Service Worker MÍNIMO, a propósito.
//
// Por pedido explícito, esta app NO implementa modo offline: no hay
// cachés, no hay estrategias de "cache-first" ni página de respaldo sin
// conexión. Este archivo existe únicamente porque Chrome/Android exigen
// un Service Worker activo (con un listener de "fetch") como uno de los
// requisitos técnicos para poder mostrar el aviso de "Instalar app".
//
// En otras palabras: la app YA es instalable gracias a este archivo,
// pero solo funcionará con conexión a internet.
// =========================================================================

// Activa el Service Worker inmediatamente, sin esperar a que se cierren
// las pestañas antiguas.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

// 🔧 Listener de "fetch" vacío/transparente: deja pasar cada petición
// directo a la red, sin interceptarla ni guardarla en caché.
// Existe solo para cumplir el criterio de instalabilidad; si se quita,
// algunos navegadores dejan de ofrecer "Instalar app".
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
