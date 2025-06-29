// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyALzgRMGUZFSbiCIf_Bo--iYFuzF7q6WNM",
  authDomain: "note-11065.firebaseapp.com",
  databaseURL: "https://note-11065-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "note-11065",
  storageBucket: "note-11065.firebasestorage.app",
  messagingSenderId: "727662778690",
  appId: "1:727662778690:web:74c986343364d6244850db",
  measurementId: "G-679ZR5YNSL",
}

// Declare Firebase variable
const firebase = window.firebase

// Initialize Firebase when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  if (typeof firebase !== "undefined") {
    // Initialize Firebase
    firebase.initializeApp(firebaseConfig)

    // Get Firebase services
    window.auth = firebase.auth()
    window.database = firebase.database()
    window.googleProvider = new firebase.auth.GoogleAuthProvider()

    console.log("Firebase initialized successfully")

    // Initialize auth state listener
    initializeAuth()
  } else {
    console.error("Firebase not loaded")
  }
})

// Auth state management
let currentUser = null
let isGuest = false

function initializeAuth() {
  // Set auth persistence to LOCAL (stays logged in until explicit logout)
  window.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).then(() => {
    console.log("Auth persistence set to LOCAL")
  }).catch((error) => {
    console.error("Error setting auth persistence:", error)
  })

  // Check if user was in guest mode
  if (localStorage.getItem("isGuest") === "true") {
    isGuest = true
    updateUIForGuest()
    return
  }

  // Listen for auth state changes
  window.auth.onAuthStateChanged((user) => {
    console.log("Auth state changed:", user)

    if (user) {
      currentUser = user
      isGuest = false
      localStorage.removeItem("isGuest")

      // Check if user needs to set username (for Google sign-in users)
      checkUsernameRequired(user)

      // Update UI for logged in user
      updateUIForUser(user)

      // Migrate guest data if exists
      migrateGuestDataToUser(user)

      // Load user data from Firebase
      loadUserData(user)
    } else {
      currentUser = null
      if (!isGuest) {
        updateUIForSignedOut()
      }
    }
  })
}

async function checkUsernameRequired(user) {
  try {
    // Check if username is already saved in localStorage
    const savedUsername = localStorage.getItem(`username_${user.uid}`)
    if (savedUsername) {
      console.log("Username already saved, skipping modal")
      return
    }

    const userSnapshot = await window.database.ref(`users/${user.uid}`).once('value')
    const userData = userSnapshot.val()
    
    if (!userData || !userData.username) {
      // Show username modal for users without username
      if (typeof window.showUsernameModal === 'function') {
        window.showUsernameModal()
      }
    } else {
      // Save username to localStorage to avoid future prompts
      localStorage.setItem(`username_${user.uid}`, userData.username)
    }
  } catch (error) {
    console.error("Error checking username:", error)
  }
}

function updateUIForUser(user) {
  const headerTitle = document.getElementById("headerTitle")
  const signInBtn = document.getElementById("signInBtn")
  const userSettings = document.getElementById("userSettings")

  if (headerTitle && headerTitle.textContent === "NOTES") {
    headerTitle.textContent = `Hello, ${user.displayName || user.email.split("@")[0]}`
  }

  if (signInBtn) {
    signInBtn.style.display = "none"
  }

  if (userSettings) {
    userSettings.style.display = "block"
    // Update user name in settings
    const userNameDisplay = document.getElementById("userNameDisplay")
    if (userNameDisplay) {
      userNameDisplay.textContent = user.displayName || user.email
    }
  }
}

function updateUIForGuest() {
  const headerTitle = document.getElementById("headerTitle")
  const signInBtn = document.getElementById("signInBtn")
  const userSettings = document.getElementById("userSettings")

  if (headerTitle && headerTitle.textContent === "NOTES") {
    headerTitle.textContent = "NOTES (Guest)"
  }

  if (signInBtn) {
    signInBtn.style.display = "block"
  }

  if (userSettings) {
    userSettings.style.display = "none"
  }
}

function updateUIForSignedOut() {
  const headerTitle = document.getElementById("headerTitle")
  const signInBtn = document.getElementById("signInBtn")
  const userSettings = document.getElementById("userSettings")

  if (headerTitle && headerTitle.textContent.startsWith("Hello")) {
    headerTitle.textContent = "NOTES"
  }

  if (signInBtn) {
    signInBtn.style.display = "block"
  }

  if (userSettings) {
    userSettings.style.display = "none"
  }
}

// Data migration and synchronization
function migrateGuestDataToUser(user) {
  // Check if migration has already been done for this user
  const migrationKey = `migrated_${user.uid}`;
  if (localStorage.getItem(migrationKey)) {
    return; // Already migrated, skip
  }

  const guestNotes = JSON.parse(localStorage.getItem("notes")) || []
  const guestCategories = JSON.parse(localStorage.getItem("categories")) || []

  // Only migrate if there's actual guest data and user doesn't have Firebase data
  if (guestNotes.length > 0 || guestCategories.length > 1) {
    const userRef = window.database.ref(`users/${user.uid}`)
    
    // Check if user already has data in Firebase
    userRef.once('value').then(snapshot => {
      const userData = snapshot.val();
      
      // Only migrate if user has no data in Firebase
      if (!userData || (!userData.notes && !userData.categories)) {
        console.log("Migrating guest data to user account...")

        userRef
          .update({
            notes: guestNotes,
            categories: guestCategories,
            migratedAt: Date.now(),
          })
          .then(() => {
            console.log("Guest data migrated successfully")
            // Mark migration as complete
            localStorage.setItem(migrationKey, 'true');
            // Clear local storage after successful migration
            localStorage.removeItem("notes")
            localStorage.removeItem("categories")
          })
          .catch((error) => {
            console.error("Error migrating data:", error)
          })
      } else {
        // User already has Firebase data, just mark migration as done
        localStorage.setItem(migrationKey, 'true');
        localStorage.removeItem("notes")
        localStorage.removeItem("categories")
      }
    });
  } else {
    // No guest data to migrate, mark as done
    localStorage.setItem(migrationKey, 'true');
  }
}

function loadUserData(user) {
  console.log("Loading user data from Firebase...")

  const userRef = window.database.ref(`users/${user.uid}`)

  userRef
    .once("value")
    .then((snapshot) => {
      const userData = snapshot.val()

      if (userData) {
        // Always ensure arrays exist and are properly populated
        const userNotes = userData.notes || [];
        const firebaseCategories = userData.categories || [{ id: "all", name: "All" }];
        
        // Get current local categories and modification timestamp
        const localCategories = JSON.parse(localStorage.getItem("categories")) || [{ id: "all", name: "All" }];
        const lastLocalModified = parseInt(localStorage.getItem("categoriesLastModified")) || 0;
        const firebaseLastModified = userData.categoriesLastModified || 0;
        
        // Check if we have recent local changes (within last 10 minutes)
        const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
        const hasRecentLocalChanges = lastLocalModified > tenMinutesAgo;
        
        console.log("Local categories:", localCategories.length, "items");
        console.log("Firebase categories:", firebaseCategories.length, "items");
        console.log("Has recent local changes:", hasRecentLocalChanges);
        
        // Always use Firebase as source of truth, but preserve local if it has more items
        let finalCategories;
        if (localCategories.length > firebaseCategories.length) {
          finalCategories = localCategories;
          console.log("Using local categories (more items) and syncing to Firebase");
          // Immediately save to Firebase
          setTimeout(() => {
            const userRef = window.database.ref(`users/${user.uid}`);
            userRef.update({
              categories: localCategories,
              categoriesLastModified: Date.now()
            });
          }, 100);
        } else {
          finalCategories = firebaseCategories;
          console.log("Using Firebase categories");
        }

        // Force update global arrays - always preserve note category assignments
        const existingNotes = JSON.parse(localStorage.getItem("notes")) || [];
        
        // Always merge Firebase notes with local category assignments - preserve all category data
        let finalNotes = [];
        
        // First, process Firebase notes
        userNotes.forEach(firebaseNote => {
          // Ensure note has categories array
          if (!Array.isArray(firebaseNote.categories)) {
            firebaseNote.categories = [];
          }
          
          // Check if we have this note locally with categories
          const localNote = existingNotes.find(note => note.id === firebaseNote.id);
          if (localNote) {
            // Always prefer local categories if they exist, otherwise use Firebase categories
            const mergedNote = {
              ...firebaseNote,
              categories: Array.isArray(localNote.categories) && localNote.categories.length > 0 
                ? localNote.categories 
                : firebaseNote.categories
            };
            finalNotes.push(mergedNote);
          } else {
            // New note from Firebase
            finalNotes.push(firebaseNote);
          }
        });
        
        // Then, add any local-only notes that aren't in Firebase yet
        existingNotes.forEach(localNote => {
          if (!finalNotes.find(note => note.id === localNote.id)) {
            // Ensure categories array exists
            if (!Array.isArray(localNote.categories)) {
              localNote.categories = [];
            }
            finalNotes.push(localNote);
          }
        });
        
        console.log("Merged notes with preserved categories:", finalNotes.length, "notes processed");
        
        if (window.notes) {
          window.notes.length = 0;
          window.notes.push(...finalNotes);
        } else {
          window.notes = finalNotes;
        }

        // Only update global categories if we're using Firebase data or if global is empty
        if (window.categories) {
          if (finalCategories === firebaseCategories || window.categories.length <= 1) {
            window.categories.length = 0;
            window.categories.push(...finalCategories);
            console.log("Updated global categories to:", window.categories);
          } else {
            console.log("Preserving existing global categories:", window.categories);
          }
        } else {
          window.categories = finalCategories;
        }

        // Update localStorage with final notes (preserving categories)
        localStorage.setItem("notes", JSON.stringify(finalNotes));
        
        // Always update localStorage with final categories
        localStorage.setItem("categories", JSON.stringify(finalCategories));
        
        // Update CategoryManager if it exists
        if (window.CategoryManager && window.CategoryManager._initialized) {
          const currentCategories = window.CategoryManager.getCategories();
          if (finalCategories.length > currentCategories.length) {
            // Firebase has more categories, update CategoryManager
            window.CategoryManager.updateCategories(finalCategories);
            console.log("Updated CategoryManager with Firebase categories:", finalCategories.length);
          } else if (currentCategories.length > finalCategories.length) {
            console.log("Local has more categories, saving to Firebase:", currentCategories.length);
            // Local has more categories, update finalCategories and save to Firebase
            finalCategories.length = 0;
            finalCategories.push(...currentCategories);
            localStorage.setItem("categories", JSON.stringify(finalCategories));
            
            // Save to Firebase immediately
            setTimeout(() => {
              if (window.CategoryManager && typeof window.CategoryManager._saveToFirebase === 'function') {
                window.CategoryManager._saveToFirebase();
              }
            }, 500);
          }
        }
        
        // Always save the final notes and categories to Firebase to ensure persistence
        setTimeout(() => {
          saveUserData();
        }, 1000);

        // Set data loaded flag
        window.dataLoaded = true;
        
        // Force UI refresh with delay to ensure DOM is ready
        setTimeout(() => {
          if (typeof window.renderNotes === "function") {
            window.renderNotes()
          }
          if (typeof window.renderCategories === "function") {
            window.renderCategories()
          }
          if (typeof window.updateFilterChips === "function") {
            window.updateFilterChips()
          }
        }, 50);

        console.log("User data loaded successfully")
        
        // Refresh CategoryManager with loaded data
        if (window.CategoryManager) {
          window.CategoryManager.refreshFromFirebase().then(() => {
            // Re-render categories after refresh
            if (typeof window.renderCategories === "function") {
              window.renderCategories()
            }
          });
        }
      } else {
        // First time user - initialize with default data
        const defaultCategories = [{ id: "all", name: "All" }]
        userRef.set({
          name: user.displayName || user.email.split("@")[0],
          email: user.email,
          notes: [],
          categories: defaultCategories,
          createdAt: Date.now(),
          lastLogin: Date.now(),
        })
      }
    })
    .catch((error) => {
      console.error("Error loading user data:", error)
      showToast("Error loading your data. Please refresh the page.")
    })
}

function saveUserData() {
  if (currentUser && !isGuest) {
    const localNotes = JSON.parse(localStorage.getItem("notes")) || []
    const categories = JSON.parse(localStorage.getItem("categories")) || []
    const categoriesLastModified = localStorage.getItem("categoriesLastModified") || Date.now()

    // Ensure all notes have proper category arrays before saving
    const notesToSave = localNotes.map(note => ({
      ...note,
      categories: Array.isArray(note.categories) ? note.categories : [],
      images: Array.isArray(note.images) ? note.images : [],
      listSections: Array.isArray(note.listSections) ? note.listSections : []
    }));

    const userRef = window.database.ref(`users/${currentUser.uid}`)

    userRef
      .update({
        notes: notesToSave,
        categories: categories,
        categoriesLastModified: parseInt(categoriesLastModified),
        lastUpdated: Date.now(),
      })
      .then(() => {
        console.log("User data saved to Firebase with", notesToSave.length, "notes");
      })
      .catch((error) => {
        console.error("Error saving user data:", error)
      })
  }
}

// Auth functions
function continueAsGuest() {
  console.log("Continuing as guest")
  isGuest = true
  localStorage.setItem("isGuest", "true")
  updateUIForGuest()
  window.location.href = "index.html"
}

function signInWithGoogle() {
  return window.auth.signInWithPopup(window.googleProvider).then((result) => {
    const user = result.user
    console.log("Google sign-in successful:", user)

    // Update user info in database
    window.database.ref(`users/${user.uid}`).update({
      name: user.displayName,
      email: user.email,
      lastLogin: Date.now(),
      photoURL: user.photoURL,
    })

    return user
  })
}

function signUpWithEmail(email, password, name, username) {
  return window.auth.createUserWithEmailAndPassword(email, password).then((userCredential) => {
    const user = userCredential.user

    // Update user profile
    return user
      .updateProfile({
        displayName: name,
      })
      .then(() => {
        // Reserve username
        return window.database.ref(`usernames/${username}`).set(user.uid)
      })
      .then(() => {
        // Save user info to database
        return window.database.ref(`users/${user.uid}`).set({
          name: name,
          email: email,
          username: username,
          createdAt: Date.now(),
          lastLogin: Date.now(),
          notes: [],
          categories: [{ id: "all", name: "All" }],
        })
      })
      .then(() => user)
  })
}

function signInWithEmail(email, password) {
  return window.auth.signInWithEmailAndPassword(email, password).then((userCredential) => {
    const user = userCredential.user

    // Update last login
    window.database.ref(`users/${user.uid}`).update({
      lastLogin: Date.now(),
    })

    return user
  })
}

function signOutUser() {
  return window.auth.signOut().then(() => {
    currentUser = null
    isGuest = false
    localStorage.removeItem("isGuest")
    localStorage.removeItem("notes")
    localStorage.removeItem("categories")
    localStorage.removeItem("cachedInvitations")
    localStorage.removeItem("cachedSharedNotes")
    
    // Clear all username cache to prevent future prompts
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('username_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    console.log("User signed out successfully")
    window.location.href = "index.html"
  })
}

function updateUserName(newName) {
  if (!currentUser) return Promise.reject("No user logged in")

  return currentUser
    .updateProfile({
      displayName: newName,
    })
    .then(() => {
      // Update in database
      return window.database.ref(`users/${currentUser.uid}`).update({
        name: newName,
        lastUpdated: Date.now(),
      })
    })
    .then(() => {
      updateUIForUser(currentUser)
      showToast("Name updated successfully!")
    })
}

// Sharing functions
async function getInvitations() {
  if (!currentUser) return []

  try {
    const snapshot = await window.database.ref(`users/${currentUser.uid}/invitations`).once('value')
    const invitations = snapshot.val() || {}
    return Object.values(invitations).filter(inv => inv.status === 'pending')
  } catch (error) {
    console.error("Error fetching invitations:", error)
    return []
  }
}

async function acceptInvitation(invitationId, sharedId) {
  if (!currentUser) throw new Error("No user logged in")

  // Remove invitation
  await window.database.ref(`users/${currentUser.uid}/invitations/${invitationId}`).remove()
  
  // Add user to shared note collaborators
  const sharedNoteRef = window.database.ref(`sharedNotes/${sharedId}`)
  const snapshot = await sharedNoteRef.once('value')
  const sharedNote = snapshot.val()
  
  if (sharedNote) {
    const collaborators = sharedNote.collaborators || []
    if (!collaborators.includes(currentUser.uid)) {
      collaborators.push(currentUser.uid)
      await sharedNoteRef.update({ collaborators })
    }
  }
}

async function declineInvitation(invitationId) {
  if (!currentUser) throw new Error("No user logged in")

  await window.database.ref(`users/${currentUser.uid}/invitations/${invitationId}`).remove()
}

async function getSharedNotes() {
  if (!currentUser) return []

  try {
    const snapshot = await window.database.ref('sharedNotes').once('value')
    const sharedNotes = snapshot.val() || {}
    
    return Object.entries(sharedNotes)
      .filter(([id, note]) => 
        note.ownerId === currentUser.uid || 
        (note.collaborators && note.collaborators.includes(currentUser.uid))
      )
      .map(([id, note]) => ({ id, ...note }))
  } catch (error) {
    console.error("Error fetching shared notes:", error)
    return []
  }
}

async function updateSharedNote(sharedId, updates) {
  if (!currentUser) throw new Error("No user logged in")

  // Clean undefined values from updates to prevent Firebase validation errors
  function cleanObject(obj) {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) {
      return obj.filter(item => item !== undefined && item !== null);
    }
    if (typeof obj === 'object') {
      const cleaned = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined && value !== null) {
          cleaned[key] = cleanObject(value);
        }
      }
      return cleaned;
    }
    return obj;
  }

  const cleanedUpdates = cleanObject(updates);
  const updateData = {
    ...cleanedUpdates,
    lastEditedBy: currentUser.uid,
    lastEditedByName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Unknown',
    updatedAt: Date.now(),
    lastModified: Date.now()
  }

  console.log('Updating shared note:', sharedId, 'with data:', updateData);
  
  try {
    await window.database.ref(`sharedNotes/${sharedId}`).set(updateData);
    console.log('Shared note updated successfully in Firebase');
  } catch (error) {
    console.error('Error updating shared note:', error);
    throw error;
  }
}

async function updatePresence(sharedId, data) {
  if (!currentUser || !sharedId) return

  try {
    const presenceRef = window.database.ref(`sharedNotes/${sharedId}/activeUsers/${currentUser.uid}`)
    
    const presenceData = {
      name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Anonymous',
      email: currentUser.email || '',
      lastActive: Date.now(),
      status: data?.status || 'editing',
      currentField: data?.currentField || null,
      ...data
    }
    
    await presenceRef.set(presenceData)

    // Remove presence on disconnect
    presenceRef.onDisconnect().remove()
    
    // Setup heartbeat to maintain presence
    if (!window.presenceInterval) {
      window.presenceInterval = setInterval(() => {
        if (currentUser && sharedId) {
          presenceRef.update({ lastActive: Date.now() }).catch(() => {
            // Silently handle errors
          });
        }
      }, 10000); // Update every 10 seconds
    }
    
    console.log('Presence updated for user:', currentUser.uid, 'in note:', sharedId);
  } catch (error) {
    console.error('Error updating presence:', error);
  }
}

// Utility functions
function showToast(message) {
  const toast = document.getElementById("toast")
  const toastMessage = document.getElementById("toastMessage")

  if (toast && toastMessage) {
    toastMessage.textContent = message
    toast.classList.add("open")
    setTimeout(() => {
      toast.classList.remove("open")
    }, 3000)
  }
}

function getCurrentUser() {
  return currentUser
}

function isUserGuest() {
  return isGuest
}

// Export functions globally
window.authFunctions = {
  continueAsGuest,
  signInWithGoogle,
  signUpWithEmail,
  signInWithEmail,
  signOutUser,
  updateUserName,
  getCurrentUser,
  isUserGuest,
  saveUserData,
  getInvitations,
  acceptInvitation,
  declineInvitation,
  getSharedNotes,
  updateSharedNote,
  updatePresence,
}

// For module compatibility
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    auth: null,
    database: null,
    googleProvider: null,
    signInWithPopup: () => Promise.reject(new Error("Firebase not initialized")),
    createUserWithEmailAndPassword: () => Promise.reject(new Error("Firebase not initialized")),
    signInWithEmailAndPassword: () => Promise.reject(new Error("Firebase not initialized")),
    signOut: () => Promise.reject(new Error("Firebase not initialized")),
    onAuthStateChanged: () => () => {},
    updateProfile: () => Promise.reject(new Error("Firebase not initialized")),
    ref: () => null,
    set: () => Promise.reject(new Error("Firebase not initialized")),
  }
}
