// Bump the version number so the browser knows to update the cache
const CACHE_NAME = 'testify-v1'; 

const ASSETS_TO_CACHE = [
    // Core Root Files
    './',
    'index.html',
    'style.css',
    'manifest.json',
    'logotestify.png',
    'logo.png',
    'main.js',
  
    // Core JS Logic
    'js/auth.js',
    'js/database.js',
    'js/dbSeed.js',
    'js/examEngine.js',
    'js/firebase.js',
    'js/utils.js',
  
    // Dashboard
    'dashboard/dashboard.html',
    'dashboard/dashboard.css',
    'dashboard/dashboard.js',
  
    // Exam Engine & Tests
    'exam/exam.html',
    'exam/exam.css',
    'exam/exam.js',
    'tests/tests.html',
    'tests/tests.css',
    'tests/tests.js',
  
    // Interactive Modules
    'polling/polling.html',
    'polling/polling.css',
    'polling/polling.js',
    'upload/upload.html',
    'upload/upload.css',
    'upload/upload.js',
    'chat/chat.html',
    'chat/chat.css',
    'chat/chat.js',
    'leaderboard/leaderboard.html',
    'leaderboard/leaderboard.css',
    'leaderboard/leaderboard.js',
  
    // Data & Others
    'analytics/analytics.html',
    'analytics/analytics.css',
    'analytics/analytics.js',
    'tutorial/tutorial.html',
    'mobile/mobile.css',
    'mobile/mobile.js'
  ];
// ... (Keep the rest of the install, activate, and fetch events exactly the same) ...

// Install Event - Cache Core Static Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean Up Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Network First Strategy
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests (like Firebase WebSockets / unpkg Analytics)
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // If valid network response, clone it into cache
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // If network fails, serve from local cache
        return caches.match(event.request);
      })
  );
});