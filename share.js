// Shared Notes Page JavaScript
// currentUser is managed by firebase-config.js
let invitations = [];
let sharedNotes = [];

// Translations
const translations = {
  en: {
    noInvitations: "No pending invitations",
    noSharedNotes: "No shared notes yet",
    invitationAccepted: "Invitation accepted",
    invitationDeclined: "Invitation declined",
    errorAccepting: "Error accepting invitation",
    errorDeclining: "Error declining invitation",
    errorLoading: "Error loading data",
    offlineWarning: "This feature requires internet connection",
    signInRequired: "Please sign in to view shared notes"
  }
};

let currentLanguage = localStorage.getItem("language") || "en";

function t(key) {
  return translations[currentLanguage]?.[key] || translations.en[key] || key;
}

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
  initializePage();
});

function initializePage() {
  // Wait for Firebase to be ready
  function waitForFirebase() {
    return new Promise((resolve) => {
      const checkFirebase = () => {
        if (window.auth && window.database && window.authFunctions) {
          resolve();
        } else {
          setTimeout(checkFirebase, 100);
        }
      };
      checkFirebase();
    });
  }

  waitForFirebase().then(() => {
    console.log("Firebase ready for share page");
    
    // Always setup event listeners first
    setupEventListeners();
    
    // Listen for auth state changes first, then check current state
    if (window.auth) {
      window.auth.onAuthStateChanged((user) => {
        console.log("Share page auth state changed:", user);
        window.currentUser = user;
        const isGuest = window.authFunctions.isUserGuest();
        
        if (isGuest || !user) {
          showSignInRequired();
        } else {
          loadSharedContent();
        }
      });
    }
    
    // Check current auth state after a delay to ensure auth is loaded
    setTimeout(() => {
      const currentUser = window.auth?.currentUser || window.authFunctions?.getCurrentUser();
      const isGuest = window.authFunctions?.isUserGuest();
      
      console.log("Share page delayed check - currentUser:", currentUser, "isGuest:", isGuest);
      console.log("Firebase auth currentUser:", window.auth?.currentUser);
      
      if (currentUser && !isGuest) {
        console.log("User is authenticated, loading shared content");
        loadSharedContent();
      } else {
        console.log("User not authenticated, showing sign in required");
        showSignInRequired();
      }
    }, 500);
  });
}

function setupEventListeners() {
  // Hamburger menu
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const sidebar = document.getElementById("sidebar");
  const sidebarClose = document.getElementById("sidebarClose");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  if (hamburgerBtn) {
    hamburgerBtn.addEventListener("click", toggleSidebar);
  }
  if (sidebarClose) {
    sidebarClose.addEventListener("click", closeSidebar);
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", closeSidebar);
  }

  // Navigation links
  const navNotes = document.getElementById("navNotes");
  const navCategories = document.getElementById("navCategories");
  const navSettings = document.getElementById("navSettings");
  const navSignIn = document.getElementById("navSignIn");

  if (navNotes) {
    navNotes.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "index.html";
    });
  }

  if (navCategories) {
    navCategories.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "category.html";
    });
  }

  if (navSettings) {
    navSettings.addEventListener("click", (e) => {
      e.preventDefault();
      // Show settings or navigate as needed
    });
  }

  if (navSignIn) {
    navSignIn.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "login.html";
    });
  }
}

// Sidebar functions
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  
  console.log("Toggle sidebar clicked"); // Debug log
  
  if (sidebar && hamburgerBtn) {
    sidebar.classList.toggle("open");
    hamburgerBtn.classList.toggle("active");
  }
}

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  
  if (sidebar && hamburgerBtn) {
    sidebar.classList.remove("open");
    hamburgerBtn.classList.remove("active");
  }
}

function showSignInRequired() {
  const container = document.querySelector('.shared-container');
  container.innerHTML = `
    <div class="empty-state">
      <i class="fas fa-sign-in-alt"></i>
      <p>${t("signInRequired")}</p>
      <a href="login.html" class="btn btn-primary" style="margin-top: 1rem;">Sign In</a>
    </div>
  `;
}

async function loadSharedContent() {
  const currentUser = window.authFunctions?.getCurrentUser();
  if (!currentUser) return;

  try {
    await loadInvitations();
    renderInvitations();
    
  } catch (error) {
    console.error("Error loading shared content:", error);
    showToast(t("errorLoading"), "error");
  }
}

async function loadInvitations() {
  const currentUser = window.authFunctions?.getCurrentUser();
  if (!currentUser) return;

  try {
    console.log("Loading invitations for user:", currentUser.uid);
    
    // Query invitations where 'to' field matches current user's uid
    const snapshot = await window.database.ref('invitations').orderByChild('to').equalTo(currentUser.uid).once('value');
    const invitationsData = snapshot.val() || {};
    
    console.log("Raw invitations data:", invitationsData);
    
    invitations = Object.values(invitationsData).filter(inv => inv.status === 'pending');
    
    console.log("Filtered pending invitations:", invitations);
    
    // Cache in localStorage for offline access
    localStorage.setItem('cachedInvitations', JSON.stringify(invitations));
    
  } catch (error) {
    console.error("Error loading invitations:", error);
    
    // Try to load from cache if offline
    const cached = localStorage.getItem('cachedInvitations');
    if (cached) {
      invitations = JSON.parse(cached);
    }
  }
}



function renderInvitations() {
  const invitationsList = document.getElementById('invitationsList');
  const invitationsEmpty = document.getElementById('invitationsEmpty');
  
  if (!invitationsList || !invitationsEmpty) {
    console.error("Required DOM elements not found for invitations");
    return;
  }
  
  if (!invitations || invitations.length === 0) {
    invitationsList.innerHTML = '';
    invitationsEmpty.style.display = 'flex';
    return;
  }
  
  invitationsEmpty.style.display = 'none';
  
  invitationsList.innerHTML = invitations.map(invitation => `
    <div class="invitation-card">
      <div class="invitation-header">
        <div class="invitation-title">
          <i class="fas fa-sticky-note"></i>
          ${invitation.noteTitle || 'Untitled Note'}
        </div>
        <div class="invitation-date">${new Date(invitation.createdAt).toLocaleDateString()}</div>
      </div>
      <div class="invitation-from">
        <i class="fas fa-user-circle"></i>
        <span><strong>From:</strong> ${invitation.fromName || 'Unknown'}</span>
      </div>
      <div class="invitation-actions">
        <button class="btn btn-success" onclick="acceptInvitation('${invitation.id}', '${invitation.sharedId}')" 
                ${!navigator.onLine ? 'disabled title="Requires internet connection"' : ''}
                data-invitation-id="${invitation.id}" data-shared-id="${invitation.sharedId}">
          <i class="fas fa-check"></i>
          Accept
        </button>
        <button class="btn btn-secondary" onclick="declineInvitation('${invitation.id}')"
                ${!navigator.onLine ? 'disabled title="Requires internet connection"' : ''}
                data-invitation-id="${invitation.id}">
          <i class="fas fa-times"></i>
          Decline
        </button>
      </div>
    </div>
  `).join('');
}



async function acceptInvitation(invitationId, sharedId) {
  if (!navigator.onLine) {
    showToast("Internet connection required");
    return;
  }

  if (!currentUser) {
    showToast("Please sign in to accept invitations");
    return;
  }

  try {
    console.log("Accepting invitation:", invitationId, "for shared note:", sharedId);
    
    const button = event.target.closest('button');
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Accepting...';

    // Update invitation status to 'accepted' in main invitations collection
    console.log("Updating invitation status to accepted...");
    await window.database.ref(`invitations/${invitationId}`).update({ 
      status: 'accepted',
      acceptedAt: Date.now()
    });
    console.log("Invitation status updated successfully");
    
    // Add user to shared note collaborators if not already there
    console.log("Adding user to shared note collaborators...");
    const sharedNoteRef = window.database.ref(`sharedNotes/${sharedId}`);
    const snapshot = await sharedNoteRef.once('value');
    const sharedNote = snapshot.val();
    
    if (sharedNote) {
      if (!sharedNote.collaborators) {
        sharedNote.collaborators = {};
      }
      
      if (!sharedNote.collaborators[currentUser.uid]) {
        sharedNote.collaborators[currentUser.uid] = {
          role: 'editor',
          joinedAt: Date.now(),
          name: currentUser.displayName || currentUser.email.split('@')[0]
        };
        await sharedNoteRef.update({ collaborators: sharedNote.collaborators });
        console.log("User added to collaborators successfully");
      }
      
      // Add shared note to user's local notes collection
      console.log("Adding shared note to user's notes...");
      const localNote = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        title: sharedNote.title || 'Untitled Note',
        content: sharedNote.content || '',
        categories: sharedNote.categories || [],
        images: sharedNote.images || [],
        listSections: sharedNote.listSections || [],
        // Keep legacy list for backwards compatibility
        list: sharedNote.list || [],
        listType: sharedNote.listType || 'bulleted',
        voiceNotes: sharedNote.voiceNotes || [],
        createdAt: sharedNote.createdAt || Date.now(),
        updatedAt: sharedNote.updatedAt || Date.now(),
        lastModified: sharedNote.lastModified || Date.now(),
        sharedId: sharedId,
        isShared: true,
        collaborators: sharedNote.collaborators || {},
        ownerId: sharedNote.ownerId || sharedNote.owner
      };
      
      // Add to user's notes in Firebase
      const userNotesRef = window.database.ref(`users/${currentUser.uid}/notes`);
      const userNotesSnapshot = await userNotesRef.once('value');
      const userNotes = userNotesSnapshot.val() || [];
      
      // Check if note already exists
      const noteExists = userNotes.find(note => note.sharedId === sharedId);
      if (!noteExists) {
        userNotes.push(localNote);
        await userNotesRef.set(userNotes);
        console.log("Shared note added to user's notes collection");
      }
      
    } else {
      console.error("Shared note not found:", sharedId);
    }
    
    // Refresh the page to remove accepted invitation and reload notes
    console.log("Refreshing invitation list and reloading user data...");
    await loadSharedContent();
    
    // Reload user data to get the new shared note
    if (window.authFunctions && typeof window.authFunctions.loadUserData === 'function') {
      await window.authFunctions.loadUserData(currentUser);
    }
    
    showToast("Invitation accepted! You can now collaborate on this note.");
    
  } catch (error) {
    console.error("Error accepting invitation:", error);
    showToast("Error accepting invitation. Please try again.");
    
    // Re-enable button on error
    const button = event.target.closest('button');
    if (button) {
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-check"></i> Accept';
    }
  }
}

async function declineInvitation(invitationId) {
  if (!navigator.onLine) {
    showToast("Internet connection required");
    return;
  }

  if (!currentUser) {
    showToast("Please sign in to decline invitations");
    return;
  }

  try {
    console.log("Declining invitation:", invitationId);
    
    const button = event.target.closest('button');
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Declining...';

    // Update invitation status to 'declined' in main invitations collection
    console.log("Updating invitation status to declined...");
    await window.database.ref(`invitations/${invitationId}`).update({ 
      status: 'declined',
      declinedAt: Date.now()
    });
    console.log("Invitation status updated successfully");
    
    // Refresh invitations to remove declined invitation
    console.log("Refreshing invitation list...");
    await loadSharedContent();
    
    showToast("Invitation declined.");
    
  } catch (error) {
    console.error("Error declining invitation:", error);
    showToast("Error declining invitation. Please try again.");
    
    // Re-enable button on error
    const button = event.target.closest('button');
    if (button) {
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-times"></i> Decline';
    }
  }
}

function openSharedNote(sharedId) {
  // Find the shared note
  const sharedNote = sharedNotes.find(note => note.id === sharedId);
  if (!sharedNote) return;

  // Create a note object compatible with the main app
  const noteForEditor = {
    id: sharedNote.noteId || sharedId,
    title: sharedNote.title || '',
    content: sharedNote.content || '',
    categories: sharedNote.categories || [],
    images: sharedNote.images || [],
    listItems: sharedNote.listItems || [],
    listType: sharedNote.listType || 'bulleted',
    password: '', // Shared notes don't use passwords
    createdAt: sharedNote.createdAt,
    updatedAt: sharedNote.updatedAt,
    isShared: true,
    sharedId: sharedId
  };

  // Store in localStorage for the main app to pick up
  localStorage.setItem('openSharedNote', JSON.stringify(noteForEditor));
  
  // Navigate to main app
  window.location.href = 'index.html';
}

function manageSharedNote(sharedId) {
  // TODO: Implement shared note management (add/remove collaborators, etc.)
  showToast("Management features coming soon");
}

// Global functions for inline event handlers
window.acceptInvitation = acceptInvitation;
window.declineInvitation = declineInvitation;
window.openSharedNote = openSharedNote;
window.manageSharedNote = manageSharedNote;

// Utility functions
function showToast(message, type = 'default') {
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toastMessage");
  
  if (!toast || !toastMessage) return;
  
  toastMessage.textContent = message;
  toast.className = `toast show ${type}`;
  
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

// Check for offline status
window.addEventListener('online', () => {
  if (currentUser && !isGuest) {
    loadSharedContent();
  }
});

window.addEventListener('offline', () => {
  showToast("You're offline. Some features may not be available.");
});
