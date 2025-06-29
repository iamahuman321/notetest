// Service Worker for Notes App PWA
const CACHE_NAME = 'notes-app-v1.3.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/firebase-config.js',
  '/firebase-exports.js',
  '/category.html',
  '/category.js',
  '/share.html',
  '/share.js',
  '/signin.html',
  '/signup.html',
  '/login.html',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('Failed to cache resources:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip Firebase requests
  if (event.request.url.includes('firebaseapp.com') || 
      event.request.url.includes('googleapis.com') ||
      event.request.url.includes('gstatic.com/firebasejs')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version if available
        if (response) {
          return response;
        }

        // Clone the request for network fetch
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response for caching
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        }).catch(() => {
          // If network fails, try to serve cached version
          return caches.match('/index.html');
        });
      })
  );
});

// Background sync for shared notes
self.addEventListener('sync', (event) => {
  console.log('Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-shared-notes') {
    event.waitUntil(syncSharedNotes());
  }
  
  if (event.tag === 'sync-invitations') {
    event.waitUntil(syncInvitations());
  }
});

// Sync shared notes when online
async function syncSharedNotes() {
  try {
    console.log('Syncing shared notes...');
    
    // Get queued actions from IndexedDB or localStorage
    const queuedActions = JSON.parse(localStorage.getItem('queuedSharedActions') || '[]');
    
    if (queuedActions.length === 0) {
      return;
    }

    // Process each queued action
    for (const action of queuedActions) {
      try {
        await processQueuedAction(action);
      } catch (error) {
        console.error('Failed to process queued action:', error);
      }
    }
    
    // Clear the queue after successful sync
    localStorage.removeItem('queuedSharedActions');
    console.log('Shared notes synced successfully');
    
  } catch (error) {
    console.error('Error syncing shared notes:', error);
  }
}

// Sync invitations when online
async function syncInvitations() {
  try {
    console.log('Syncing invitations...');
    
    const queuedInvitations = JSON.parse(localStorage.getItem('queuedInvitations') || '[]');
    
    if (queuedInvitations.length === 0) {
      return;
    }

    for (const invitation of queuedInvitations) {
      try {
        await processQueuedInvitation(invitation);
      } catch (error) {
        console.error('Failed to process queued invitation:', error);
      }
    }
    
    localStorage.removeItem('queuedInvitations');
    console.log('Invitations synced successfully');
    
  } catch (error) {
    console.error('Error syncing invitations:', error);
  }
}

// Process queued action (placeholder - would need actual Firebase integration)
async function processQueuedAction(action) {
  // This would normally make Firebase calls to sync the data
  console.log('Processing queued action:', action);
  
  // Example structure:
  // action = {
  //   type: 'shareNote' | 'updateSharedNote' | 'acceptInvitation' | 'declineInvitation',
  //   data: { ... action-specific data ... },
  //   timestamp: Date.now()
  // }
  
  // For now, just log the action
  return Promise.resolve();
}

// Process queued invitation (placeholder)
async function processQueuedInvitation(invitation) {
  console.log('Processing queued invitation:', invitation);
  return Promise.resolve();
}

// Message handling for triggering sync
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_SHARED_NOTES') {
    // Register background sync
    self.registration.sync.register('sync-shared-notes').catch((error) => {
      console.error('Failed to register background sync:', error);
    });
  }
  
  if (event.data && event.data.type === 'SYNC_INVITATIONS') {
    self.registration.sync.register('sync-invitations').catch((error) => {
      console.error('Failed to register background sync:', error);
    });
  }
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Push notification handling (for future collaboration features)
self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  const data = event.data.json();
  const title = data.title || 'Notes App';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'general',
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data;
  let url = '/';

  // Determine URL based on notification type
  if (data.type === 'shared_note') {
    url = `/?sharedNote=${data.sharedId}`;
  } else if (data.type === 'invitation') {
    url = '/share.html';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clients) => {
      // Check if there's already a window/tab open with the target URL
      for (const client of clients) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }

      // If not, open a new window/tab
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Handle offline/online status
self.addEventListener('online', () => {
  console.log('Device is online');
  // Trigger sync when device comes online
  self.registration.sync.register('sync-shared-notes').catch(console.error);
  self.registration.sync.register('sync-invitations').catch(console.error);
});

self.addEventListener('offline', () => {
  console.log('Device is offline');
});

// Cleanup old data periodically
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'cleanup-old-data') {
    event.waitUntil(cleanupOldData());
  }
});

async function cleanupOldData() {
  try {
    // Clean up old cached invitations and shared notes
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    // Clean localStorage items older than maxAge
    const cachedInvitations = JSON.parse(localStorage.getItem('cachedInvitations') || '[]');
    const recentInvitations = cachedInvitations.filter(inv => 
      (now - inv.createdAt) < maxAge
    );
    localStorage.setItem('cachedInvitations', JSON.stringify(recentInvitations));

    const cachedSharedNotes = JSON.parse(localStorage.getItem('cachedSharedNotes') || '[]');
    const recentSharedNotes = cachedSharedNotes.filter(note => 
      (now - note.updatedAt) < maxAge
    );
    localStorage.setItem('cachedSharedNotes', JSON.stringify(recentSharedNotes));

    console.log('Old data cleaned up successfully');
  } catch (error) {
    console.error('Error cleaning up old data:', error);
  }
}
