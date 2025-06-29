// Notes App Main JavaScript
// Global variables
let notes = JSON.parse(localStorage.getItem("notes")) || [];
let categories = [{ id: "all", name: "All" }];
let currentNote = null;
let currentFilter = "all";
let currentListType = "bulleted";
let autoSaveTimeout = null; // Define autoSaveTimeout variable
let isAutoSave = false; // Flag to distinguish auto-save from manual save
// currentUser is managed by firebase-config.js
let sharedNoteListeners = new Map(); // Track Firebase listeners for shared notes
let isReceivingUpdate = false; // Prevent infinite loops during real-time updates
let collaborativeEditingEnabled = false;
let homePageSyncInterval = null; // Track home page sync interval
let shoppingLists = JSON.parse(localStorage.getItem("shoppingLists")) || {
  grocery: [],
  pharmacy: [],
  other: []
};
let currentShoppingCategory = null;
let searchQuery = "";
let filteredNotes = [];

// Connection and error handling
let isOnline = navigator.onLine;
let connectionStatus = 'online';
let retryAttempts = 0;
let maxRetryAttempts = 3;

// Translations
const translations = {
  en: {
    noteAdded: "Note added",
    noteUpdated: "Note updated",
    noteDeleted: "Note deleted",
    categoryAdded: "Category added",
    categoryDeleted: "Category deleted",
    passwordSet: "Password set",
    passwordRemoved: "Password removed",
    incorrectPassword: "Incorrect password",
    emptyNote: "Note cannot be empty",
    noteShared: "Note shared successfully",
    invitationSent: "Invitation sent",
    invitationAccepted: "Invitation accepted",
    invitationDeclined: "Invitation declined",
    userNotFound: "User not found",
    shareNote: "Share Note",
    searchUsers: "Search users...",
    accept: "Accept",
    decline: "Decline",
    userEditing: "is editing...",
    changesWillSync: "Changes will sync when online",
    guestCannotShare: "Sign in to share notes",
    usernameTaken: "Username is already taken",
    enterUsername: "Please enter a username",
    usernameInvalid: "Username must be 4-20 characters, letters, numbers, and underscores only",
    offlineWarning: "This feature requires internet connection"
  }
};

let currentLanguage = localStorage.getItem("language") || "en";

function t(key) {
  return translations[currentLanguage]?.[key] || translations.en[key] || key;
}

// Global initialization flag
let appInitialized = false;

// Initialize app
document.addEventListener("DOMContentLoaded", function() {
  initializeApp();
});

function initializeApp() {
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

  waitForFirebase().then(async () => {
    console.log("Firebase ready for main app");
    
    // Initialize CategoryManager first
    if (window.CategoryManager) {
      try {
        await window.CategoryManager.init();
        categories = window.CategoryManager.getCategories();
        console.log("Categories initialized via CategoryManager:", categories.length);
      } catch (error) {
        console.error("Error initializing CategoryManager:", error);
        categories = JSON.parse(localStorage.getItem("categories")) || [{ id: "all", name: "All" }];
      }
    }
    
    // Clear search on page load
    clearSearch();
    
    // Initialize UI first
    setupEventListeners();
    loadSettings();
    
    // Wait for auth state to be determined before rendering anything
    let authStateResolved = false;
    let initialDataLoaded = false;
    
    function checkAndRender() {
      if (authStateResolved && initialDataLoaded && !appInitialized) {
        console.log("Both auth and data ready, rendering UI");
        appInitialized = true;
        renderNotes();
        renderCategories();
        updateFilterChips();
        updateShareButtonVisibility();
        updateSidebarAuth();
      }
    }
    
    // Listen for auth state changes and load data accordingly
    if (window.auth) {
      window.auth.onAuthStateChanged(async (user) => {
        console.log("Auth state changed:", user ? "signed in" : "signed out");
        window.currentUser = user;
        authStateResolved = true;
        
        // Load data after auth state is determined
        if (user && window.authFunctions && !window.authFunctions.isUserGuest()) {
          // Authenticated user - wait for Firebase data to load
          console.log("Loading user data from Firebase...");
          
          // Wait for data to be loaded by firebase-config
          const waitForFirebaseData = () => {
            return new Promise((resolve) => {
              const checkData = () => {
                if (window.dataLoaded || notes.length > 0) {
                  // Sync categories from CategoryManager after Firebase data loads
                  if (window.CategoryManager) {
                    categories = window.CategoryManager.getCategories();
                  }
                  console.log("Firebase data loaded successfully");
                  resolve();
                } else {
                  setTimeout(checkData, 100);
                }
              };
              checkData();
            });
          };
          
          await waitForFirebaseData();
          initialDataLoaded = true;
        } else {
          // Guest user - load local data immediately
          console.log("Loading local data for guest user");
          loadLocalData();
          initialDataLoaded = true;
        }
        
        // Load shared shopping lists for all users
        loadSharedShoppingLists();
        
        // Check for shared note to open
        checkForSharedNoteToOpen();
        
        // Check if we can render now
        checkAndRender();
      });
    } else {
      // No auth system, load local data
      console.log("No auth system, loading local data");
      loadLocalData();
      authStateResolved = true;
      initialDataLoaded = true;
      checkAndRender();
    }
  });
}

function loadLocalData() {
  // Load notes from localStorage
  const savedNotes = localStorage.getItem("notes");
  if (savedNotes) {
    try {
      const parsedNotes = JSON.parse(savedNotes);
      notes = Array.isArray(parsedNotes) ? parsedNotes : [];
    } catch (error) {
      console.error("Error parsing saved notes:", error);
      notes = [];
    }
  } else {
    notes = [];
  }
  
  // Load categories from localStorage with fallback protection
  const savedCategories = localStorage.getItem("categories");
  if (savedCategories) {
    try {
      const parsedCategories = JSON.parse(savedCategories);
      if (Array.isArray(parsedCategories) && parsedCategories.length > 0) {
        categories = parsedCategories;
        // Store categories in a backup location to prevent loss
        sessionStorage.setItem("categoriesBackup", JSON.stringify(parsedCategories));
      } else {
        categories = [{ id: "all", name: "All" }];
      }
    } catch (error) {
      console.error("Error parsing saved categories:", error);
      // Try to recover from backup
      const backup = sessionStorage.getItem("categoriesBackup");
      if (backup) {
        try {
          categories = JSON.parse(backup);
        } catch {
          categories = [{ id: "all", name: "All" }];
        }
      } else {
        categories = [{ id: "all", name: "All" }];
      }
    }
  } else {
    // Try to recover from backup
    const backup = sessionStorage.getItem("categoriesBackup");
    if (backup) {
      try {
        categories = JSON.parse(backup);
      } catch {
        categories = [{ id: "all", name: "All" }];
      }
    } else {
      categories = [{ id: "all", name: "All" }];
    }
  }
  
  // Load settings from localStorage
  const savedFilter = localStorage.getItem("currentFilter");
  if (savedFilter) {
    currentFilter = savedFilter;
  }
  
  console.log("Local data loaded - notes:", notes.length, "categories:", categories.length);
}

function checkForSharedNoteToOpen() {
  const sharedNoteData = localStorage.getItem('openSharedNote');
  if (sharedNoteData) {
    try {
      const sharedNote = JSON.parse(sharedNoteData);
      
      // Ensure proper list structure - convert legacy format to new format
      if (sharedNote.listItems && !sharedNote.listSections) {
        sharedNote.listSections = [{
          id: generateId(),
          type: sharedNote.listType || 'bulleted',
          items: sharedNote.listItems
        }];
      }
      
      // Ensure all required properties exist
      sharedNote.categories = sharedNote.categories || [];
      sharedNote.images = sharedNote.images || [];
      sharedNote.listSections = sharedNote.listSections || [];
      
      // Force reload from Firebase to get latest data
      if (sharedNote.sharedId && window.database) {
        const sharedNoteRef = window.database.ref(`sharedNotes/${sharedNote.sharedId}`);
        sharedNoteRef.once('value').then((snapshot) => {
          const latestData = snapshot.val();
          if (latestData) {
            // Update with latest Firebase data
            Object.assign(sharedNote, {
              title: latestData.title || '',
              content: latestData.content || '',
              categories: latestData.categories || [],
              images: latestData.images || [],
              listSections: latestData.listSections || [],
              updatedAt: latestData.updatedAt
            });
            
            // Handle legacy list format from Firebase
            if (latestData.list && !latestData.listSections) {
              sharedNote.listSections = [{
                id: generateId(),
                type: latestData.listType || 'bulleted',
                items: latestData.list
              }];
            }
          }
          
          // Open the note in editor
          editNote(sharedNote);
          localStorage.removeItem('openSharedNote');
        }).catch((error) => {
          console.error("Error loading latest shared note data:", error);
          // Fallback to cached data
          editNote(sharedNote);
          localStorage.removeItem('openSharedNote');
        });
      } else {
        // No Firebase or sharedId, use cached data
        editNote(sharedNote);
        localStorage.removeItem('openSharedNote');
      }
    } catch (error) {
      console.error("Error parsing shared note data:", error);
      localStorage.removeItem('openSharedNote');
    }
  }
}

function setupEventListeners() {

  // Hamburger menu
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const sidebar = document.getElementById("sidebar");
  const sidebarClose = document.getElementById("sidebarClose");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  if (hamburgerBtn) hamburgerBtn.addEventListener("click", toggleSidebar);
  if (sidebarClose) sidebarClose.addEventListener("click", closeSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener("click", closeSidebar);

  // Navigation
  const addNoteBtn = document.getElementById("addNoteBtn");
  const backBtn = document.getElementById("backBtn");
  const navNotes = document.getElementById("navNotes");
  const navSettings = document.getElementById("navSettings");
  const navSignOut = document.getElementById("navSignOut");
  const signInBtn = document.getElementById("signInBtn");

  if (addNoteBtn) addNoteBtn.addEventListener("click", createNewNote);
  if (backBtn) backBtn.addEventListener("click", () => {
    // Handle different back navigation contexts
    const shoppingCategoryPage = document.getElementById("shoppingCategoryPage");
    const recipeEditorPage = document.getElementById("recipeEditorPage");
    const recipeViewerPage = document.getElementById("recipeViewerPage");
    
    if (shoppingCategoryPage && shoppingCategoryPage.classList.contains("active")) {
      showShoppingPage();
    } else if (recipeEditorPage && recipeEditorPage.classList.contains("active")) {
      showRecipesPage();
    } else if (recipeViewerPage && recipeViewerPage.classList.contains("active")) {
      showRecipesPage();
    } else {
      showNotesPage();
    }
  });

  // Search functionality
  const searchInput = document.getElementById("searchInput");
  const searchBtn = document.getElementById("searchBtn");
  const searchVoiceBtn = document.getElementById("searchVoiceBtn");
  const searchClear = document.getElementById("searchClear");

  if (searchInput) {
    searchInput.addEventListener("input", handleSearch);
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSearch();
      }
    });
  }
  if (searchBtn) searchBtn.addEventListener("click", showAdvancedSearchModal);
  if (searchVoiceBtn) searchVoiceBtn.addEventListener("click", startVoiceSearch);
  if (searchClear) searchClear.addEventListener("click", clearSearch);
  if (navNotes) navNotes.addEventListener("click", (e) => {
    e.preventDefault();
    showNotesPage();
    closeSidebar();
  });
  if (navSettings) navSettings.addEventListener("click", (e) => {
    e.preventDefault();
    showSettingsPage();
    closeSidebar();
  });
  
  // Shopping Lists Navigation
  const navShopping = document.getElementById("navShopping");
  if (navShopping) navShopping.addEventListener("click", (e) => {
    e.preventDefault();
    showShoppingPage();
    closeSidebar();
  });

  // Recipes Navigation
  const navRecipes = document.getElementById("navRecipes");
  if (navRecipes) navRecipes.addEventListener("click", (e) => {
    e.preventDefault();
    showRecipesPage();
    closeSidebar();
  });
  if (navSignOut) navSignOut.addEventListener("click", (e) => {
    e.preventDefault();
    if (window.authFunctions) {
      window.authFunctions.signOutUser();
    }
    closeSidebar();
  });
  if (signInBtn) signInBtn.addEventListener("click", () => window.location.href = "login.html");

  // Editor
  const titleInput = document.getElementById("titleInput");
  const contentTextarea = document.getElementById("contentTextarea");
  
  // Auto-save with debounce for regular editing
  function autoSaveWrapper() {
    isAutoSave = true;
    saveCurrentNote();
    isAutoSave = false;
  }
  
  if (titleInput) titleInput.addEventListener("input", debounce(autoSaveWrapper, 500));
  if (contentTextarea) contentTextarea.addEventListener("input", debounce(autoSaveWrapper, 500));
  
  // Note: Toolbar buttons are now set up in setupToolbarButtons() function

  // Categories
  const addCategoryBtn = document.getElementById("addCategoryBtn");
  if (addCategoryBtn) addCategoryBtn.addEventListener("click", showCategoryModal);

  // Image upload
  const imageUpload = document.getElementById("imageUpload");
  if (imageUpload) imageUpload.addEventListener("change", processImageUpload);

  // Settings
  const themeSelect = document.getElementById("themeSelect");
  const languageSelect = document.getElementById("languageSelect");
  const editNameBtn = document.getElementById("editNameBtn");
  const signOutBtn = document.getElementById("signOutBtn");

  if (themeSelect) themeSelect.addEventListener("change", handleThemeChange);
  if (languageSelect) languageSelect.addEventListener("change", handleLanguageChange);
  if (editNameBtn) editNameBtn.addEventListener("click", showNameModal);
  if (signOutBtn) signOutBtn.addEventListener("click", () => {
    if (window.authFunctions) {
      window.authFunctions.signOutUser();
    }
  });

  // Modals
  setupModalEventListeners();
}

function setupModalEventListeners() {
  // Share modal
  const shareModalClose = document.getElementById("shareModalClose");
  const sendInvitesBtn = document.getElementById("sendInvitesBtn");
  const cancelShareBtn = document.getElementById("cancelShareBtn");
  const userSearchInput = document.getElementById("userSearchInput");

  if (shareModalClose) shareModalClose.addEventListener("click", hideShareModal);
  if (sendInvitesBtn) sendInvitesBtn.addEventListener("click", sendInvitations);
  if (cancelShareBtn) cancelShareBtn.addEventListener("click", hideShareModal);
  if (userSearchInput) {
    userSearchInput.addEventListener("input", debounce((e) => searchUsers(e.target.value), 300));
    userSearchInput.addEventListener("focus", () => {
      if (userSearchInput.value.length >= 2) {
        searchUsers(userSearchInput.value);
      }
    });
  }

  // Username modal
  const saveUsernameBtn = document.getElementById("saveUsernameBtn");
  if (saveUsernameBtn) saveUsernameBtn.addEventListener("click", saveUsername);

  // Name modal
  const nameModalClose = document.getElementById("nameModalClose");
  const saveNameBtn = document.getElementById("saveNameBtn");
  const cancelNameBtn = document.getElementById("cancelNameBtn");

  if (nameModalClose) nameModalClose.addEventListener("click", hideNameModal);
  if (saveNameBtn) saveNameBtn.addEventListener("click", saveName);
  if (cancelNameBtn) cancelNameBtn.addEventListener("click", hideNameModal);

  // Category modal
  const categoryModalClose = document.getElementById("categoryModalClose");
  const saveCategoriesBtn = document.getElementById("saveCategoriesBtn");

  if (categoryModalClose) categoryModalClose.addEventListener("click", hideCategoryModal);
  if (saveCategoriesBtn) saveCategoriesBtn.addEventListener("click", saveNoteCategories);

  // Password modal
  const passwordModalClose = document.getElementById("passwordModalClose");
  const savePasswordBtn = document.getElementById("savePasswordBtn");
  const removePasswordBtn = document.getElementById("removePasswordBtn");

  if (passwordModalClose) passwordModalClose.addEventListener("click", hidePasswordModal);
  if (savePasswordBtn) savePasswordBtn.addEventListener("click", savePassword);
  if (removePasswordBtn) removePasswordBtn.addEventListener("click", removePassword);

  // List type modal
  const listTypeModalClose = document.getElementById("listTypeModalClose");
  if (listTypeModalClose) listTypeModalClose.addEventListener("click", hideListTypeModal);

  const listTypeBtns = document.querySelectorAll(".list-type-btn");
  listTypeBtns.forEach(btn => {
    btn.addEventListener("click", selectListType);
  });

  // Delete modal
  const deleteModalClose = document.getElementById("deleteModalClose");
  const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
  const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");

  if (deleteModalClose) deleteModalClose.addEventListener("click", hideDeleteModal);
  if (confirmDeleteBtn) confirmDeleteBtn.addEventListener("click", confirmDelete);
  if (cancelDeleteBtn) cancelDeleteBtn.addEventListener("click", hideDeleteModal);

  // Image viewer modal
  const imageViewerClose = document.getElementById("imageViewerClose");
  const imageViewerOverlay = document.getElementById("imageViewerOverlay");
  const downloadImageBtn = document.getElementById("downloadImageBtn");

  if (imageViewerClose) imageViewerClose.addEventListener("click", closeImageViewer);
  if (imageViewerOverlay) imageViewerOverlay.addEventListener("click", closeImageViewer);
  if (downloadImageBtn) downloadImageBtn.addEventListener("click", downloadImage);

  // Close image viewer with Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const modal = document.getElementById("imageViewerModal");
      if (modal && modal.classList.contains("open")) {
        closeImageViewer();
      }
    }
  });

  // Shopping Lists
  const groceryBtn = document.getElementById("groceryBtn");
  const pharmacyBtn = document.getElementById("pharmacyBtn");
  const otherBtn = document.getElementById("otherBtn");
  const addShoppingItemBtn = document.getElementById("addShoppingItemBtn");

  if (groceryBtn) groceryBtn.addEventListener("click", () => showShoppingCategoryPage("grocery"));
  if (pharmacyBtn) pharmacyBtn.addEventListener("click", () => showShoppingCategoryPage("pharmacy"));
  if (otherBtn) otherBtn.addEventListener("click", () => showShoppingCategoryPage("other"));
  if (addShoppingItemBtn) addShoppingItemBtn.addEventListener("click", () => {
    if (currentShoppingCategory) {
      addShoppingItem(currentShoppingCategory);
    }
  });

  // Recipes
  const addRecipeBtn = document.getElementById("addRecipeBtn");
  const saveRecipeBtn = document.getElementById("saveRecipeBtn");
  const cancelRecipeBtn = document.getElementById("cancelRecipeBtn");
  const editRecipeBtn = document.getElementById("editRecipeBtn");
  const addIngredientBtn = document.getElementById("addIngredientBtn");
  const addStepBtn = document.getElementById("addStepBtn");
  const addRecipeImageBtn = document.getElementById("addRecipeImageBtn");
  const recipeImageUpload = document.getElementById("recipeImageUpload");

  if (addRecipeBtn) addRecipeBtn.addEventListener("click", createNewRecipe);
  if (saveRecipeBtn) saveRecipeBtn.addEventListener("click", saveRecipe);
  if (cancelRecipeBtn) cancelRecipeBtn.addEventListener("click", cancelRecipeEditing);
  if (editRecipeBtn) editRecipeBtn.addEventListener("click", editCurrentRecipe);
  if (addIngredientBtn) addIngredientBtn.addEventListener("click", addRecipeIngredient);
  if (addStepBtn) addStepBtn.addEventListener("click", addRecipeStep);
  if (addRecipeImageBtn) addRecipeImageBtn.addEventListener("click", () => {
    if (recipeImageUpload) recipeImageUpload.click();
  });
  if (recipeImageUpload) recipeImageUpload.addEventListener("change", processRecipeImageUpload);

  // Close modals on overlay click
  document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.remove("open");
      }
    });
  });
}

// Sidebar functions
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  
  sidebar.classList.toggle("open");
  hamburgerBtn.classList.toggle("active");
}

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  
  sidebar.classList.remove("open");
  hamburgerBtn.classList.remove("active");
}

function updateSidebarAuth() {
  const navSignIn = document.getElementById("navSignIn");
  const navSignOut = document.getElementById("navSignOut");
  const currentUser = window.authFunctions?.getCurrentUser();
  const isGuest = window.authFunctions?.isUserGuest();
  
  if (currentUser && !isGuest) {
    if (navSignIn) navSignIn.classList.add("hidden");
    if (navSignOut) navSignOut.classList.remove("hidden");
  } else {
    if (navSignIn) navSignIn.classList.remove("hidden");
    if (navSignOut) navSignOut.classList.add("hidden");
  }
}

// Note management
function createNewNote() {
  currentNote = {
    id: generateId(),
    title: "",
    content: "",
    categories: [],
    images: [],
    list: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  showEditorPage();
  updateEditorContent();
}

function editNote(note) {
  if (note.password) {
    verifyNotePassword(note);
    return;
  }
  
  // Create a deep copy of the note to prevent reference issues
  currentNote = {
    ...note,
    categories: Array.isArray(note.categories) ? [...note.categories] : [],
    images: Array.isArray(note.images) ? note.images.map(img => ({...img})) : [],
    listSections: Array.isArray(note.listSections) ? note.listSections.map(section => ({
      ...section,
      items: Array.isArray(section.items) ? section.items.map(item => ({...item})) : []
    })) : []
  };
  
  // Ensure proper list structure before editing
  if (!currentNote.listSections && currentNote.listItems) {
    // Convert legacy format
    currentNote.listSections = [{
      id: generateId(),
      type: currentNote.listType || 'bulleted',
      items: Array.isArray(currentNote.listItems) ? currentNote.listItems.map(item => ({...item})) : []
    }];
  }
  
  showEditorPage();
  updateEditorContent();
  
  // Force update list section after a brief delay to ensure DOM is ready
  setTimeout(() => {
    updateListSection();
  }, 100);
}

function verifyNotePassword(note) {
  const password = prompt("Enter note password:");
  if (password === note.password) {
    currentNote = note;
    showEditorPage();
    updateEditorContent();
  } else {
    showToast(t("incorrectPassword"), "error");
  }
}

function saveCurrentNote() {
  if (!currentNote || isReceivingUpdate) return; // Don't save during real-time updates
  
  try {
    const titleInput = document.getElementById("titleInput");
    const contentTextarea = document.getElementById("contentTextarea");
    
    if (titleInput) currentNote.title = titleInput.value;
    if (contentTextarea) currentNote.content = contentTextarea.value;
    
    // Save the current list type with the note
    if (currentNote.list && currentNote.list.length > 0) {
      currentNote.listType = currentListType;
    }
    
    currentNote.updatedAt = Date.now();
    
    if (currentNote.isShared && currentNote.sharedId) {
      console.log("Saving shared note:", currentNote.sharedId);
      saveSharedNote();
    } else {
      console.log("Saving local note:", currentNote.id);
      saveLocalNote();
    }
  } catch (error) {
    console.error("Error saving note:", error);
    showToast("Failed to save note. Please try again.", "error");
  }
}

function saveLocalNote() {
  const existingIndex = notes.findIndex(n => n.id === currentNote.id);
  
  // Preserve existing categories from the notes array if they exist
  const existingNote = existingIndex >= 0 ? notes[existingIndex] : null;
  const preservedCategories = existingNote && Array.isArray(existingNote.categories) && existingNote.categories.length > 0 
    ? existingNote.categories 
    : (Array.isArray(currentNote.categories) ? currentNote.categories : []);
  
  // Create a deep copy of the current note to prevent reference issues
  const noteToSave = {
    ...currentNote,
    categories: [...preservedCategories], // Always preserve existing categories
    images: Array.isArray(currentNote.images) ? currentNote.images.map(img => ({...img})) : [],
    listSections: Array.isArray(currentNote.listSections) ? currentNote.listSections.map(section => ({
      ...section,
      items: Array.isArray(section.items) ? section.items.map(item => ({...item})) : []
    })) : []
  };
  
  if (existingIndex >= 0) {
    notes[existingIndex] = noteToSave;
  } else {
    notes.push(noteToSave);
  }
  
  localStorage.setItem("notes", JSON.stringify(notes));
  
  // Save to Firebase if user is authenticated
  if (window.authFunctions && typeof window.authFunctions.saveUserData === 'function') {
    window.authFunctions.saveUserData();
  }
}

function saveSharedNote() {
  if (!currentNote.sharedId) return;
  
  const currentUser = window.authFunctions?.getCurrentUser();
  if (currentUser && window.database) {
    try {
      // Get current values from DOM to ensure latest content
      const titleInput = document.getElementById("titleInput");
      const contentTextarea = document.getElementById("contentTextarea");
      
      const updateData = {
        title: titleInput ? titleInput.value : (currentNote.title || ''),
        content: contentTextarea ? contentTextarea.value : (currentNote.content || ''),
        categories: currentNote.categories || [],
        images: currentNote.images || [],
        listSections: currentNote.listSections || [],
        list: currentNote.list || [],
        listType: currentNote.listType || 'bulleted',
        lastEditedBy: currentUser.uid,
        lastEditedByName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Unknown',
        updatedAt: Date.now(),
        lastModified: Date.now()
      };
      
      // Update currentNote with latest values
      currentNote.title = updateData.title;
      currentNote.content = updateData.content;
      currentNote.updatedAt = updateData.updatedAt;
      currentNote.lastModified = updateData.lastModified;
      
      // Update Firebase directly for consistency
      window.database.ref(`sharedNotes/${currentNote.sharedId}`).set(updateData)
        .then(() => {
          console.log('Shared note saved successfully to Firebase');
          
          // Update local note
          const existingIndex = notes.findIndex(n => n.id === currentNote.id);
          if (existingIndex >= 0) {
            notes[existingIndex] = { ...currentNote };
            localStorage.setItem("notes", JSON.stringify(notes));
          }
        })
        .catch((error) => {
          console.error('Error saving shared note:', error);
        });
      
    } catch (error) {
      console.error("Error saving shared note:", error);
    }
  }
}

function deleteNote(noteId) {
  const note = notes.find(n => n.id === noteId);
  if (note && note.password) {
    showDeleteModal(note);
  } else {
    confirmDeleteNote(noteId);
  }
}

function confirmDeleteNote(noteId) {
  notes = notes.filter(n => n.id !== noteId);
  localStorage.setItem("notes", JSON.stringify(notes));
  
  if (window.authFunctions && typeof window.authFunctions.saveUserData === 'function') {
    window.authFunctions.saveUserData();
  }
  
  showToast(t("noteDeleted"), "success");
  showNotesPage();
  renderNotes();
}

// Rendering functions
function renderNotes() {
  // Don't render if app isn't fully initialized
  if (!appInitialized && !window.dataLoaded) {
    console.log("Skipping renderNotes - app not initialized");
    return;
  }
  
  const notesContainer = document.getElementById("notesContainer");
  if (!notesContainer) return;

  // Apply both search and filter
  let filteredNotes = getFilteredNotes();
  
  // Additional safety check
  if (!Array.isArray(filteredNotes)) {
    console.error("getFilteredNotes returned non-array:", filteredNotes);
    filteredNotes = [];
  }

  if (filteredNotes.length === 0) {
    let emptyMessage;
    if (searchQuery) {
      emptyMessage = { icon: "fas fa-search", title: `No results for "${searchQuery}"`, text: "Try different search terms" };
    } else if (currentFilter === "shared") {
      emptyMessage = { icon: "fas fa-users", title: "No shared notes", text: "Notes shared with others will appear here" };
    } else {
      emptyMessage = { icon: "fas fa-sticky-note", title: "No notes yet", text: "Tap the + button to create your first note" };
    }
    
    notesContainer.innerHTML = `
      <div class="empty-state">
        <i class="${emptyMessage.icon}"></i>
        <h3>${emptyMessage.title}</h3>
        <p>${emptyMessage.text}</p>
      </div>
    `;
    return;
  }
  
  try {
    notesContainer.innerHTML = `
      <div class="notes-grid">
        ${filteredNotes.map(note => {
          if (!note) return '';
          
          const preview = note.content ? (note.content.length > 100 ? note.content.substring(0, 100) + "..." : note.content) : "No content";
          const dateStr = formatDate(note.updatedAt || note.createdAt || Date.now());
          
          const categoryTags = Array.isArray(note.categories) ? note.categories.map(catId => {
            const category = Array.isArray(categories) ? categories.find(c => c.id === catId) : null;
            return category ? `<span class="category-chip">${category.name}</span>` : "";
          }).join("") : "";

          const isShared = note.sharedId || (note.collaborators && Object.keys(note.collaborators).length > 0);
          const collaboratorCount = note.collaborators ? Object.keys(note.collaborators).length : 0;

          // Highlight search terms
          const highlightedTitle = highlightSearchTerms(note.title || "Untitled", searchQuery);
          const highlightedPreview = highlightSearchTerms(preview, searchQuery);

          return `
            <div class="note-card-container" data-note-id="${note.id}">
              <div class="note-card-swipe-actions">
                <div class="swipe-action delete-action" onclick="deleteNote('${note.id}'); event.stopPropagation();">
                  <i class="fas fa-trash"></i>
                  <span>Delete</span>
                </div>
                <div class="swipe-action duplicate-action" onclick="duplicateNote('${note.id}'); event.stopPropagation();">
                  <i class="fas fa-copy"></i>
                  <span>Duplicate</span>
                </div>
                <div class="swipe-action share-action" onclick="shareNote('${note.id}'); event.stopPropagation();">
                  <i class="fas fa-share-alt"></i>
                  <span>Share</span>
                </div>
                <div class="swipe-action category-action" onclick="editNoteCategories('${note.id}'); event.stopPropagation();">
                  <i class="fas fa-folder"></i>
                  <span>Category</span>
                </div>
              </div>
              <div class="note-card" onclick="editNote(notes.find(n => n.id === '${note.id}'))">
                <div class="note-title">
                  ${highlightedTitle}
                  ${isShared ? `<i class="fas fa-users share-icon" title="Shared with ${collaboratorCount} people"></i>` : ""}
                </div>
                <div class="note-preview">${highlightedPreview}</div>
                <div class="note-meta">
                  <span>${dateStr}</span>
                  ${note.categories && note.categories.length > 0 ? `<span>${note.categories.length} categories</span>` : ""}
                  ${isShared ? `<span class="shared-indicator"><i class="fas fa-share-alt"></i> Shared</span>` : ""}
                </div>
                ${categoryTags ? `<div class="category-chips">${categoryTags}</div>` : ""}
              </div>
            </div>
          `;
        }).filter(html => html !== '').join("")}
      </div>
    `;
    
    // Initialize swipe functionality after rendering
    setTimeout(() => setupSwipeToReveal(), 100);
  } catch (error) {
    console.error("Error rendering notes:", error);
    notesContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Error loading notes</h3>
        <p>Please refresh the page</p>
      </div>
    `;
  }
}

function renderCategories() {
  // Don't render if app isn't fully initialized
  if (!appInitialized && !window.dataLoaded) {
    console.log("Skipping renderCategories - app not initialized");
    return;
  }
  
  // Sync categories from CategoryManager if available
  if (window.CategoryManager) {
    categories = window.CategoryManager.getCategories();
  }
  updateFilterChips();
}

function updateFilterChips() {
  const filterChips = document.getElementById("filterChips");
  if (!filterChips) return;
  
  // Always include "All" and "Shared" filters
  let chips = [
    { id: 'all', name: 'All' },
    { id: 'shared', name: 'Shared' }
  ];
  
  // Add category filters (excluding "All" to avoid duplication)
  const categoryFilters = categories.filter(cat => cat.id !== 'all');
  chips = chips.concat(categoryFilters);
  
  filterChips.innerHTML = chips.map(chip => `
    <button class="filter-chip ${currentFilter === chip.id ? 'active' : ''}" 
            data-filter="${chip.id}">
      ${chip.name}
    </button>
  `).join("");
  
  // Add event listeners to filter chips
  filterChips.querySelectorAll('.filter-chip').forEach(chipEl => {
    chipEl.addEventListener('click', (e) => {
      currentFilter = e.target.dataset.filter;
      localStorage.setItem("currentFilter", currentFilter);
      
      // Update active state
      filterChips.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      
      renderNotes();
    });
  });
}

// UI functions
function showNotesPage() {
  // Clean up any active collaborative editing listeners
  if (currentNote && currentNote.isShared && currentNote.sharedId) {
    cleanupRealtimeCollaboration(currentNote.sharedId);
  }
  
  // Save current note before leaving editor
  if (currentNote) {
    // Don't set isAutoSave for manual save when leaving editor
    saveCurrentNote();
    
    // Show toast notification for manual save when leaving editor
    showToast("Note saved", "success");
  }
  
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  const notesPage = document.getElementById("notesPage");
  if (notesPage) notesPage.classList.add("active");
  
  const headerTitle = document.getElementById("headerTitle");
  if (headerTitle) headerTitle.textContent = "NOTES";
  
  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.classList.add("hidden");
  
  const fab = document.getElementById("addNoteBtn");
  if (fab) fab.classList.remove("hidden");
  
  // Search section is now part of notes page, so it shows automatically
  
  // Force refresh the notes view to show latest changes
  setTimeout(() => {
    renderNotes();
    updateFilterChips();
  }, 100);
  
  // Setup real-time sync for home page to show shared note updates
  setupHomePageSync();
}

function showEditorPage() {
  // Clean up home page sync when leaving notes page
  cleanupHomePageSync();
  
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  const editorPage = document.getElementById("editorPage");
  if (editorPage) editorPage.classList.add("active");
  
  const headerTitle = document.getElementById("headerTitle");
  if (headerTitle) headerTitle.textContent = "EDIT NOTE";
  
  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.classList.remove("hidden");
  
  const fab = document.getElementById("addNoteBtn");
  if (fab) fab.classList.add("hidden");
  
  // Setup toolbar buttons when editor page is shown
  setupToolbarButtons();
  
  // Setup real-time collaboration if note is shared
  if (currentNote && currentNote.isShared && currentNote.sharedId) {
    setupRealtimeCollaboration(currentNote.sharedId);
  }
}

function setupToolbarButtons() {
  // Remove any existing event listeners by cloning buttons
  const imageBtn = document.getElementById("imageBtn");
  const voiceNoteBtn = document.getElementById("voiceNoteBtn");
  const listBtn = document.getElementById("listBtn");
  const passwordBtn = document.getElementById("passwordBtn");
  const shareBtn = document.getElementById("shareBtn");
  const deleteBtn = document.getElementById("deleteBtn");
  
  console.log("Setting up toolbar buttons:", {
    imageBtn: !!imageBtn,
    voiceNoteBtn: !!voiceNoteBtn,
    listBtn: !!listBtn,
    passwordBtn: !!passwordBtn,
    shareBtn: !!shareBtn,
    deleteBtn: !!deleteBtn
  });
  
  if (imageBtn) {
    // Clone button to remove existing listeners
    const newImageBtn = imageBtn.cloneNode(true);
    imageBtn.parentNode.replaceChild(newImageBtn, imageBtn);
    newImageBtn.addEventListener("click", (e) => {
      console.log("Image button clicked");
      e.preventDefault();
      handleImageUpload();
    });
  }
  
  if (voiceNoteBtn) {
    const newVoiceBtn = voiceNoteBtn.cloneNode(true);
    voiceNoteBtn.parentNode.replaceChild(newVoiceBtn, voiceNoteBtn);
    newVoiceBtn.addEventListener("click", (e) => {
      console.log("Voice button clicked");
      e.preventDefault();
      toggleVoiceRecording();
    });
  }
  
  if (listBtn) {
    const newListBtn = listBtn.cloneNode(true);
    listBtn.parentNode.replaceChild(newListBtn, listBtn);
    newListBtn.addEventListener("click", (e) => {
      console.log("List button clicked");
      e.preventDefault();
      console.log("Calling showListTypeModal function");
      if (typeof showListTypeModal === 'function') {
        showListTypeModal();
      } else {
        console.error("showListTypeModal function not found!");
      }
    });
  }
  
  if (passwordBtn) {
    const newPasswordBtn = passwordBtn.cloneNode(true);
    passwordBtn.parentNode.replaceChild(newPasswordBtn, passwordBtn);
    newPasswordBtn.addEventListener("click", (e) => {
      console.log("Password button clicked");
      e.preventDefault();
      console.log("Calling showPasswordModal function");
      if (typeof showPasswordModal === 'function') {
        showPasswordModal();
      } else {
        console.error("showPasswordModal function not found!");
      }
    });
  }
  
  if (shareBtn) {
    const newShareBtn = shareBtn.cloneNode(true);
    shareBtn.parentNode.replaceChild(newShareBtn, shareBtn);
    newShareBtn.addEventListener("click", (e) => {
      console.log("Share button clicked");
      e.preventDefault();
      showShareModal();
    });
  }
  
  if (deleteBtn) {
    const newDeleteBtn = deleteBtn.cloneNode(true);
    deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
    newDeleteBtn.addEventListener("click", (e) => {
      console.log("Delete button clicked");
      e.preventDefault();
      if (currentNote) showDeleteModal(currentNote);
    });
  }
}

function showSettingsPage() {
  // Clean up home page sync when leaving notes page
  cleanupHomePageSync();
  
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  const settingsPage = document.getElementById("settingsPage");
  if (settingsPage) settingsPage.classList.add("active");
  
  const headerTitle = document.getElementById("headerTitle");
  if (headerTitle) headerTitle.textContent = "SETTINGS";
  
  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.classList.remove("hidden");
  
  const fab = document.getElementById("addNoteBtn");
  if (fab) fab.classList.add("hidden");
  
  updateSettingsContent();
}

function showShoppingPage() {
  // Clean up home page sync when leaving notes page
  cleanupHomePageSync();
  
  // Force refresh shopping lists from Firebase to prevent stale data
  loadSharedShoppingLists();
  
  // Setup real-time shopping list sync
  setupShoppingListSync();
  
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  const shoppingPage = document.getElementById("shoppingPage");
  if (shoppingPage) shoppingPage.classList.add("active");
  
  const headerTitle = document.getElementById("headerTitle");
  if (headerTitle) headerTitle.textContent = "SHOPPING LISTS";
  
  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.classList.add("hidden");
  
  const fab = document.getElementById("addNoteBtn");
  if (fab) fab.classList.add("hidden");
}

function showShoppingCategoryPage(category) {
  currentShoppingCategory = category;
  
  // Force refresh from Firebase before showing category
  if (window.database) {
    window.database.ref('sharedNotes/family_shopping_lists').once('value')
      .then((snapshot) => {
        const data = snapshot.val();
        if (data && data.shoppingLists) {
          shoppingLists = data.shoppingLists;
          localStorage.setItem("shoppingLists", JSON.stringify(shoppingLists));
        }
        renderShoppingList(category);
      })
      .catch((error) => {
        console.error("Error refreshing shopping list:", error);
        renderShoppingList(category);
      });
  } else {
    renderShoppingList(category);
  }
  
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  const shoppingCategoryPage = document.getElementById("shoppingCategoryPage");
  if (shoppingCategoryPage) shoppingCategoryPage.classList.add("active");
  
  const headerTitle = document.getElementById("headerTitle");
  const categoryTitle = document.getElementById("shoppingCategoryTitle");
  const displayName = category.toUpperCase();
  
  if (headerTitle) headerTitle.textContent = displayName;
  if (categoryTitle) categoryTitle.textContent = displayName;
  
  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.classList.remove("hidden");
  
  const fab = document.getElementById("addNoteBtn");
  if (fab) fab.classList.add("hidden");
}

function renderShoppingList(category) {
  const shoppingListItems = document.getElementById("shoppingListItems");
  if (!shoppingListItems) return;
  
  const items = shoppingLists[category] || [];
  
  shoppingListItems.innerHTML = items.map((item, index) => `
    <div class="shopping-item ${item.completed ? 'completed' : ''}">
      <input type="checkbox" ${item.completed ? 'checked' : ''} 
             onchange="toggleShoppingItem('${category}', ${index})" />
      <input type="text" value="${escapeHtml(item.text)}" 
             onchange="updateShoppingItem('${category}', ${index}, this.value)" 
             placeholder="Add item..." />
      <button class="btn-icon" onclick="deleteShoppingItem('${category}', ${index})">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join('');
}

function addShoppingItem(category) {
  if (!shoppingLists[category]) shoppingLists[category] = [];
  
  shoppingLists[category].push({
    text: "",
    completed: false
  });
  
  forceSyncShoppingLists();
  renderShoppingList(category);
}

function updateShoppingItem(category, index, text) {
  if (shoppingLists[category] && index >= 0 && index < shoppingLists[category].length && shoppingLists[category][index]) {
    shoppingLists[category][index].text = text;
    forceSyncShoppingLists();
  }
}

function toggleShoppingItem(category, index) {
  if (shoppingLists[category] && index >= 0 && index < shoppingLists[category].length && shoppingLists[category][index]) {
    shoppingLists[category][index].completed = !shoppingLists[category][index].completed;
    forceSyncShoppingLists();
    renderShoppingList(category);
  }
}

function deleteShoppingItem(category, index) {
  if (shoppingLists[category] && index >= 0 && index < shoppingLists[category].length) {
    shoppingLists[category].splice(index, 1);
    forceSyncShoppingLists();
    renderShoppingList(category);
  }
}

function saveShoppingLists() {
  localStorage.setItem("shoppingLists", JSON.stringify(shoppingLists));
  
  // Save to Firebase with a universal shared shopping list ID
  const currentUser = window.authFunctions?.getCurrentUser();
  if (currentUser && window.authFunctions?.updateSharedNote) {
    try {
      // Use a universal shopping list ID that all users share
      const universalShoppingListId = "family_shopping_lists";
      window.authFunctions.updateSharedNote(universalShoppingListId, {
        shoppingLists: shoppingLists,
        type: 'shoppingList',
        updatedAt: Date.now(),
        lastUpdatedBy: currentUser.displayName || currentUser.email
      });
    } catch (error) {
      console.error("Error saving shopping lists to Firebase:", error);
    }
  }
}

// Debounced sync to prevent overwhelming Firebase
let shoppingSyncTimeout = null;

// Force immediate sync with retry mechanism for shopping lists
function forceSyncShoppingLists(retryCount = 0) {
  const maxRetries = 3;
  
  // Record timestamp of local change
  const now = Date.now();
  localStorage.setItem("lastShoppingListUpdate", now.toString());
  
  // Always save to local storage first
  localStorage.setItem("shoppingLists", JSON.stringify(shoppingLists));
  
  // Clear any pending sync
  if (shoppingSyncTimeout) {
    clearTimeout(shoppingSyncTimeout);
  }
  
  // For critical operations (delete, toggle), sync immediately
  // For text updates, use short debounce
  const isTextUpdate = new Error().stack.includes('updateShoppingItem');
  const delay = isTextUpdate ? 200 : 0;
  
  shoppingSyncTimeout = setTimeout(() => {
    performShoppingSyncWithRetry(retryCount, now);
  }, delay);
}

function performShoppingSyncWithRetry(retryCount = 0, timestamp) {
  const maxRetries = 3;
  
  const currentUser = window.authFunctions?.getCurrentUser();
  if (!currentUser || !window.authFunctions?.updateSharedNote) {
    // If no user or Firebase not available, try again in 1 second
    if (retryCount < maxRetries) {
      setTimeout(() => performShoppingSyncWithRetry(retryCount + 1, timestamp), 1000);
    }
    return;
  }
  
  const universalShoppingListId = "family_shopping_lists";
  const syncData = {
    shoppingLists: shoppingLists,
    type: 'shoppingList',
    updatedAt: timestamp || Date.now(),
    lastUpdatedBy: currentUser.displayName || currentUser.email,
    syncAttempt: retryCount + 1
  };
  
  try {
    // Force immediate Firebase update
    const promise = window.authFunctions.updateSharedNote(universalShoppingListId, syncData);
    
    // If updateSharedNote returns a promise, handle it
    if (promise && typeof promise.then === 'function') {
      promise.then(() => {
        console.log("Shopping list synced successfully");
      }).catch((error) => {
        console.error(`Shopping list sync failed (attempt ${retryCount + 1}):`, error);
        if (retryCount < maxRetries) {
          setTimeout(() => performShoppingSyncWithRetry(retryCount + 1, timestamp), 2000);
        }
      });
    }
    
  } catch (error) {
    console.error(`Shopping list sync error (attempt ${retryCount + 1}):`, error);
    if (retryCount < maxRetries) {
      setTimeout(() => performShoppingSyncWithRetry(retryCount + 1, timestamp), 2000);
    }
  }
}

let shoppingListListener = null;

function setupShoppingListSync() {
  if (!window.database) {
    // Retry setup if database not ready
    setTimeout(setupShoppingListSync, 1000);
    return;
  }
  
  // Clean up existing listener
  if (shoppingListListener) {
    cleanupShoppingListSync();
  }
  
  const shoppingListRef = window.database.ref('sharedNotes/family_shopping_lists');
  
  shoppingListListener = shoppingListRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (data && data.shoppingLists && data.updatedAt) {
      // Only update if Firebase data is newer than our last local change
      const lastLocalUpdate = localStorage.getItem("lastShoppingListUpdate");
      const localUpdateTime = lastLocalUpdate ? parseInt(lastLocalUpdate) : 0;
      
      // If Firebase data is newer than our last local change, accept it
      if (data.updatedAt > localUpdateTime + 500) { // 500ms buffer to prevent race conditions
        const currentDataString = JSON.stringify(shoppingLists);
        const newDataString = JSON.stringify(data.shoppingLists);
        
        if (currentDataString !== newDataString) {
          shoppingLists = data.shoppingLists;
          localStorage.setItem("shoppingLists", JSON.stringify(shoppingLists));
          
          // Re-render current shopping category if user is viewing one
          if (currentShoppingCategory) {
            renderShoppingList(currentShoppingCategory);
          }
          
          console.log("Shopping lists updated from Firebase:", data.lastUpdatedBy || 'Unknown user');
        }
      }
    } else if (!data) {
      // Initialize empty shopping lists if none exist
      const defaultShoppingLists = {
        grocery: [],
        pharmacy: [],
        other: []
      };
      
      // Only initialize if current lists are also empty
      const hasAnyItems = Object.values(shoppingLists).some(list => list.length > 0);
      if (!hasAnyItems) {
        shoppingLists = defaultShoppingLists;
        localStorage.setItem("shoppingLists", JSON.stringify(shoppingLists));
        forceSyncShoppingLists(); // Create the shared list in Firebase
      }
    }
  }, (error) => {
    console.error("Shopping list sync error:", error);
    // Retry connection after error
    setTimeout(setupShoppingListSync, 3000);
  });
}

function cleanupShoppingListSync() {
  if (shoppingListListener && window.database) {
    window.database.ref('sharedNotes/family_shopping_lists').off('value', shoppingListListener);
    shoppingListListener = null;
  }
}

// Load shared shopping lists for all users with forced refresh
function loadSharedShoppingLists() {
  if (window.database) {
    // Clear local timestamp to force accept of Firebase data
    localStorage.removeItem("lastShoppingListUpdate");
    
    window.database.ref('sharedNotes/family_shopping_lists').once('value')
      .then((snapshot) => {
        const data = snapshot.val();
        if (data && data.shoppingLists) {
          // Always accept Firebase data on fresh load
          shoppingLists = data.shoppingLists;
          localStorage.setItem("shoppingLists", JSON.stringify(shoppingLists));
          console.log("Fresh shopping lists loaded from Firebase");
        } else {
          // Initialize empty shopping lists if none exist
          const defaultShoppingLists = {
            grocery: [],
            pharmacy: [],
            other: []
          };
          
          // Save default lists to Firebase for all users to access
          const currentUser = window.authFunctions?.getCurrentUser();
          if (currentUser && window.authFunctions?.updateSharedNote) {
            const now = Date.now();
            localStorage.setItem("lastShoppingListUpdate", now.toString());
            window.authFunctions.updateSharedNote("family_shopping_lists", {
              shoppingLists: defaultShoppingLists,
              type: 'shoppingList',
              createdAt: now,
              updatedAt: now,
              createdBy: currentUser.displayName || currentUser.email
            });
          }
          
          shoppingLists = defaultShoppingLists;
          localStorage.setItem("shoppingLists", JSON.stringify(shoppingLists));
        }
      })
      .catch((error) => {
        console.error("Error loading shared shopping lists:", error);
        // Fallback to local storage if Firebase fails
        const localShoppingLists = localStorage.getItem("shoppingLists");
        if (localShoppingLists) {
          shoppingLists = JSON.parse(localShoppingLists);
        }
      });
  }
}

function updateEditorContent() {
  if (!currentNote) return;
  
  const titleInput = document.getElementById("titleInput");
  const contentTextarea = document.getElementById("contentTextarea");
  const dateInfo = document.getElementById("dateInfo");
  
  if (titleInput) titleInput.value = currentNote.title || "";
  if (contentTextarea) contentTextarea.value = currentNote.content || "";
  if (dateInfo) {
    const created = formatDate(currentNote.createdAt);
    const updated = formatDate(currentNote.updatedAt);
    dateInfo.textContent = `Created: ${created} | Updated: ${updated}`;
  }
  
  // Handle migration from old single list to new multiple list sections
  if (currentNote.list && !currentNote.listSections) {
    const hasCheckboxes = currentNote.list.some(item => item.hasOwnProperty('completed'));
    currentNote.listSections = [{
      id: generateId(),
      type: hasCheckboxes ? 'checklist' : 'bulleted',
      items: currentNote.list
    }];
    delete currentNote.list;
    delete currentNote.listType;
    saveCurrentNote(); // Save the migration
  }
  
  updateCategoryChips();
  updateShareButtonVisibility();
  updateListSection();
  updateImagesSection();
  updateVoiceNotesSection();
  updatePasswordButton();
  
  // Ensure list section is visible if there are list sections
  const listSection = document.getElementById("listSection");
  if (listSection && currentNote.listSections && currentNote.listSections.length > 0) {
    listSection.classList.remove("hidden");
  }
}

function updateCategoryChips() {
  const categoryChips = document.getElementById("categoryChips");
  if (!categoryChips || !currentNote) return;
  
  categoryChips.innerHTML = "";
  
  if (currentNote.categories) {
    currentNote.categories.forEach(categoryId => {
      const category = categories.find(c => c.id === categoryId);
      if (category) {
        const chip = document.createElement("span");
        chip.className = "category-chip selected";
        chip.innerHTML = `
          ${category.name}
          <i class="fas fa-times" onclick="toggleNoteCategory('${categoryId}')"></i>
        `;
        categoryChips.appendChild(chip);
      }
    });
  }
}

function updateShareButtonVisibility() {
  const shareBtn = document.getElementById("shareBtn");
  if (!shareBtn) return;
  
  const currentUser = window.authFunctions?.getCurrentUser();
  const isGuest = window.authFunctions?.isUserGuest();
  
  if (currentUser && !isGuest) {
    shareBtn.style.display = "flex";
    shareBtn.classList.remove("hidden");
  } else {
    shareBtn.style.display = "flex";
    shareBtn.classList.add("disabled");
    shareBtn.title = "Sign in to share notes";
  }
}

function updateSettingsContent() {
  const currentUser = window.authFunctions?.getCurrentUser();
  const isGuest = window.authFunctions?.isUserGuest();
  
  const userSettings = document.getElementById("userSettings");
  const userNameDisplay = document.getElementById("userNameDisplay");
  const userEmailDisplay = document.getElementById("userEmailDisplay");
  const signInBtn = document.getElementById("signInBtn");
  const signOutBtn = document.getElementById("signOutBtn");
  
  if (currentUser && !isGuest) {
    if (userSettings) userSettings.style.display = "flex";
    if (userNameDisplay) userNameDisplay.textContent = currentUser.displayName || "No name";
    if (userEmailDisplay) userEmailDisplay.textContent = currentUser.email;
    if (signInBtn) signInBtn.style.display = "none";
    if (signOutBtn) signOutBtn.style.display = "block";
  } else {
    if (userSettings) userSettings.style.display = "none";
    if (signInBtn) signInBtn.style.display = "block";
    if (signOutBtn) signOutBtn.style.display = "none";
  }
}

// Modal functions
function showShareModal() {
  const currentUser = window.authFunctions?.getCurrentUser();
  const isGuest = window.authFunctions?.isUserGuest();
  
  if (isGuest || !currentUser) {
    showToast("Sign in required to share notes", "warning");
    return;
  }
  
  const shareModal = document.getElementById("shareModal");
  if (shareModal) {
    shareModal.classList.add("open");
    
    // Load current collaborators
    loadCurrentCollaborators();
    
    // Clear previous selections
    const selectedUsers = document.getElementById("selectedUsers");
    const searchResults = document.getElementById("searchResults");
    const userSearchInput = document.getElementById("userSearchInput");
    const sendBtn = document.getElementById("sendInvitesBtn");
    
    if (selectedUsers) selectedUsers.innerHTML = "";
    if (searchResults) searchResults.classList.remove("open");
    if (userSearchInput) userSearchInput.value = "";
    if (sendBtn) sendBtn.disabled = true;
  }
}

function hideShareModal() {
  const shareModal = document.getElementById("shareModal");
  if (shareModal) shareModal.classList.remove("open");
}

function showCategoryModal() {
  // Sync categories from CategoryManager if available
  if (window.CategoryManager) {
    categories = window.CategoryManager.getCategories();
  }
  
  const categoryModal = document.getElementById("categoryModal");
  if (categoryModal) {
    categoryModal.classList.add("open");
  }
  renderModalCategories();
}

function hideCategoryModal() {
  const categoryModal = document.getElementById("categoryModal");
  if (categoryModal) categoryModal.classList.remove("open");
}

function showPasswordModal() {
  const passwordModal = document.getElementById("passwordModal");
  const passwordInput = document.getElementById("notePasswordInput");
  const removeBtn = document.getElementById("removePasswordBtn");
  
  console.log("showPasswordModal called, modal element:", !!passwordModal);
  if (passwordModal) {
    passwordModal.classList.add("open");
    console.log("Added 'open' class to passwordModal");
    console.log("Modal classes:", passwordModal.className);
    console.log("Modal display style:", window.getComputedStyle(passwordModal).display);
    
    // Show/hide remove button based on whether note has password
    if (removeBtn) {
      removeBtn.style.display = (currentNote && currentNote.password) ? "inline-block" : "none";
    }
    
    // Clear and focus password input
    if (passwordInput) {
      passwordInput.value = "";
      setTimeout(() => passwordInput.focus(), 100);
    }
  }
  updatePasswordButton();
}

function hidePasswordModal() {
  const passwordModal = document.getElementById("passwordModal");
  if (passwordModal) passwordModal.classList.remove("open");
}

function showListTypeModal() {
  const listTypeModal = document.getElementById("listTypeModal");
  console.log("showListTypeModal called, modal element:", !!listTypeModal);
  if (listTypeModal) {
    listTypeModal.classList.add("open");
    console.log("Added 'open' class to listTypeModal");
    console.log("Modal classes:", listTypeModal.className);
    console.log("Modal display style:", window.getComputedStyle(listTypeModal).display);
  }
}

function hideListTypeModal() {
  const listTypeModal = document.getElementById("listTypeModal");
  if (listTypeModal) listTypeModal.classList.remove("open");
}

function showDeleteModal(note) {
  const deleteModal = document.getElementById("deleteModal");
  if (deleteModal) deleteModal.classList.add("open");
  
  const deletePasswordContainer = document.getElementById("deletePasswordContainer");
  if (note.password && deletePasswordContainer) {
    deletePasswordContainer.classList.remove("hidden");
  } else if (deletePasswordContainer) {
    deletePasswordContainer.classList.add("hidden");
  }
}

function hideDeleteModal() {
  const deleteModal = document.getElementById("deleteModal");
  if (deleteModal) deleteModal.classList.remove("open");
}

function showUsernameModal() {
  const usernameModal = document.getElementById("usernameModal");
  if (usernameModal) usernameModal.classList.add("open");
}

function hideUsernameModal() {
  const usernameModal = document.getElementById("usernameModal");
  if (usernameModal) usernameModal.classList.remove("open");
}

function showNameModal() {
  const nameModal = document.getElementById("nameModal");
  if (nameModal) nameModal.classList.add("open");
}

function hideNameModal() {
  const nameModal = document.getElementById("nameModal");
  if (nameModal) nameModal.classList.remove("open");
}

// Modal action functions
function renderModalCategories() {
  const modalCategories = document.getElementById("modalCategories");
  if (!modalCategories) return;
  
  const userCategories = categories.filter(c => c.id !== "all");
  
  if (userCategories.length === 0) {
    modalCategories.innerHTML = `
      <div class="empty-state">
        <p>No categories available. Create categories first from the Categories page.</p>
      </div>
    `;
    return;
  }
  
  modalCategories.innerHTML = userCategories.map(category => `
    <div class="modal-category-item ${currentNote?.categories?.includes(category.id) ? 'selected' : ''}" 
         onclick="toggleNoteCategory('${category.id}')">
      <input type="checkbox" ${currentNote?.categories?.includes(category.id) ? 'checked' : ''} />
      <span>${category.name}</span>
    </div>
  `).join("");
}

function toggleNoteCategory(categoryId) {
  if (!currentNote) return;
  
  if (!currentNote.categories) currentNote.categories = [];
  
  const index = currentNote.categories.indexOf(categoryId);
  if (index >= 0) {
    currentNote.categories.splice(index, 1);
  } else {
    currentNote.categories.push(categoryId);
  }
  
  renderModalCategories();
  updateCategoryChips();
  saveCurrentNote();
}

function saveNoteCategories() {
  hideCategoryModal();
  updateCategoryChips();
  saveCurrentNote();
}

function savePassword() {
  const passwordInput = document.getElementById("notePasswordInput");
  if (!passwordInput || !currentNote) return;
  
  const password = passwordInput.value.trim();
  if (password) {
    currentNote.password = password;
    saveCurrentNote();
    hidePasswordModal();
    showToast(t("passwordSet"), "success");
    updatePasswordButton();
  }
}

function removePassword() {
  if (!currentNote) return;
  
  delete currentNote.password;
  saveCurrentNote();
  hidePasswordModal();
  showToast(t("passwordRemoved"), "success");
  updatePasswordButton();
}

function updatePasswordButton() {
  const passwordIcon = document.getElementById("passwordIcon");
  if (!passwordIcon || !currentNote) return;
  
  if (currentNote.password) {
    passwordIcon.className = "fas fa-lock";
  } else {
    passwordIcon.className = "fas fa-unlock";
  }
}

function selectListType(event) {
  const listType = event.target.closest('.list-type-btn').dataset.type;
  hideListTypeModal();
  
  // Create a new list section with the selected type
  if (!currentNote.listSections) currentNote.listSections = [];
  
  const newListSection = {
    id: generateId(),
    type: listType,
    items: [{ text: "", completed: false }]
  };
  
  currentNote.listSections.push(newListSection);

  
  const listSection = document.getElementById("listSection");
  if (listSection) listSection.classList.remove("hidden");
  
  updateListSection();
  saveCurrentNote();
}

function updateListSection() {
  const listItems = document.getElementById("listItems");
  if (!listItems || !currentNote) return;
  

  
  // Handle migration from old single list to new multiple list sections
  if (currentNote.list && !currentNote.listSections) {
    currentNote.listSections = [{
      id: generateId(),
      type: currentNote.listType || 'bulleted',
      items: currentNote.list
    }];
    delete currentNote.list;
    delete currentNote.listType;
  }
  
  if (!currentNote.listSections) currentNote.listSections = [];
  
  listItems.innerHTML = currentNote.listSections.map((section, sectionIndex) => `
    <div class="list-section" data-section-id="${section.id}">
      <div class="list-section-header">
        <span class="list-type-label">${section.type === 'checklist' ? 'Checklist' : section.type === 'numbered' ? 'Numbered List' : 'Bulleted List'}</span>
        <button class="btn-icon delete-section-btn" data-section-id="${section.id}">
          <i class="fas fa-times"></i>
        </button>
      </div>
      ${section.items.map((item, itemIndex) => `
        <div class="list-item ${item.completed ? 'completed' : ''} list-item-${section.type}">
          ${section.type === 'checklist' ? `<input type="checkbox" ${item.completed ? 'checked' : ''} class="item-checkbox" data-section-id="${section.id}" data-item-index="${itemIndex}" />` : ''}
          ${section.type === 'numbered' ? `<span class="list-number">${itemIndex + 1}.</span>` : ''}
          ${section.type === 'bulleted' ? `<span class="list-bullet">•</span>` : ''}
          <input type="text" value="${(item.text || '').replace(/"/g, '&quot;')}" class="item-input" data-section-id="${section.id}" data-item-index="${itemIndex}" placeholder="Enter item text" />
          <button class="btn-icon delete-item-btn" data-section-id="${section.id}" data-item-index="${itemIndex}">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `).join("")}
      <div class="list-item">
        <button class="btn-icon add-item-btn" data-section-id="${section.id}">
          <i class="fas fa-plus"></i>
        </button>
        <span>Add item</span>
      </div>
    </div>
  `).join("");
  
  // Add event listeners after rendering
  setupListEventListeners();
}

function setupListEventListeners() {
  // Add item buttons
  const addButtons = document.querySelectorAll('.add-item-btn');
  
  addButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const sectionId = e.target.closest('.add-item-btn').dataset.sectionId;
      addListItemToSection(sectionId);
    });
  });

  // Delete section buttons
  document.querySelectorAll('.delete-section-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const sectionId = e.target.closest('.delete-section-btn').dataset.sectionId;
      deleteListSection(sectionId);
    });
  });

  // Delete item buttons
  document.querySelectorAll('.delete-item-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const button = e.target.closest('.delete-item-btn');
      const sectionId = button.dataset.sectionId;
      const itemIndex = parseInt(button.dataset.itemIndex);
      deleteListItemInSection(sectionId, itemIndex);
    });
  });

  // Item checkboxes
  document.querySelectorAll('.item-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const sectionId = e.target.dataset.sectionId;
      const itemIndex = parseInt(e.target.dataset.itemIndex);
      toggleListItemInSection(sectionId, itemIndex);
    });
  });

  // Item text inputs
  document.querySelectorAll('.item-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const sectionId = e.target.dataset.sectionId;
      const itemIndex = parseInt(e.target.dataset.itemIndex);
      updateListItemInSection(sectionId, itemIndex, e.target.value);
    });
  });
}

function addListItemToSection(sectionId) {
  if (!currentNote?.listSections) return;
  
  const section = currentNote.listSections.find(s => s.id === sectionId);
  if (!section) return;
  
  section.items.push({
    text: "",
    completed: false
  });
  
  updateListSection();
  
  // Always use silent auto-save for list operations
  isAutoSave = true;
  saveCurrentNote();
  isAutoSave = false;
}

function updateListItemInSection(sectionId, itemIndex, value) {
  if (!currentNote?.listSections) return;
  
  const section = currentNote.listSections.find(s => s.id === sectionId);
  if (!section?.items || itemIndex < 0 || itemIndex >= section.items.length) return;
  
  section.items[itemIndex].text = value;
  
  // Always use silent auto-save for list operations
  isAutoSave = true;
  saveCurrentNote();
  isAutoSave = false;
}

function toggleListItemInSection(sectionId, itemIndex) {
  if (!currentNote?.listSections) return;
  
  const section = currentNote.listSections.find(s => s.id === sectionId);
  if (!section?.items || itemIndex < 0 || itemIndex >= section.items.length) return;
  
  section.items[itemIndex].completed = !section.items[itemIndex].completed;
  updateListSection();
  
  // Always use silent auto-save for list operations
  isAutoSave = true;
  saveCurrentNote();
  isAutoSave = false;
}

function deleteListItemInSection(sectionId, itemIndex) {
  if (!currentNote?.listSections) return;
  
  const section = currentNote.listSections.find(s => s.id === sectionId);
  if (!section?.items || itemIndex < 0 || itemIndex >= section.items.length) return;
  
  section.items.splice(itemIndex, 1);
  
  // Remove section if no items left
  if (section.items.length === 0) {
    deleteListSection(sectionId);
    return;
  }
  
  updateListSection();
  
  // Always use silent auto-save for list operations
  isAutoSave = true;
  saveCurrentNote();
  isAutoSave = false;
}

function deleteListSection(sectionId) {
  if (!currentNote?.listSections) return;
  
  const sectionIndex = currentNote.listSections.findIndex(s => s.id === sectionId);
  if (sectionIndex === -1 || sectionIndex >= currentNote.listSections.length) return;
  
  currentNote.listSections.splice(sectionIndex, 1);
  updateListSection();
  
  // Always use silent auto-save for list operations
  isAutoSave = true;
  saveCurrentNote();
  isAutoSave = false;
}

// Legacy functions for backward compatibility
function addListItem() {
  // If no sections exist, create a bulleted list section
  if (!currentNote.listSections || currentNote.listSections.length === 0) {
    selectListType({ target: { closest: () => ({ dataset: { type: 'bulleted' } }) } });
    return;
  }
  
  // Add to the last section
  const lastSection = currentNote.listSections[currentNote.listSections.length - 1];
  addListItemToSection(lastSection.id);
}

function updateListItem(index, value) {
  // Legacy support - use first section
  if (currentNote.listSections?.[0]) {
    updateListItemInSection(currentNote.listSections[0].id, index, value);
  }
}

function toggleListItem(index) {
  // Legacy support - use first section
  if (currentNote.listSections?.[0]) {
    toggleListItemInSection(currentNote.listSections[0].id, index);
  }
}

function deleteListItem(index) {
  // Legacy support - use first section
  if (currentNote.listSections?.[0]) {
    deleteListItemInSection(currentNote.listSections[0].id, index);
  }
}

function confirmDelete() {
  if (!currentNote) return;
  
  const deletePasswordInput = document.getElementById("deletePasswordInput");
  if (currentNote.password && deletePasswordInput) {
    const password = deletePasswordInput.value;
    if (password !== currentNote.password) {
      showToast(t("incorrectPassword"), "error");
      return;
    }
  }
  
  confirmDeleteNote(currentNote.id);
  hideDeleteModal();
}

// Image handling
function handleImageUpload() {
  const imageUpload = document.getElementById("imageUpload");
  if (imageUpload) imageUpload.click();
}

function processImageUpload(event) {
  const files = event.target.files;
  if (!files || !currentNote) return;
  
  Array.from(files).forEach(file => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (!currentNote.images) currentNote.images = [];
        
        // Create image object - for shared notes, don't tie to specific noteId
        const uniqueImageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const imageData = {
          id: uniqueImageId,
          name: file.name,
          data: e.target.result,
          timestamp: Date.now()
        };
        
        // Only add noteId for non-shared notes
        if (!currentNote.isShared) {
          imageData.noteId = currentNote.id;
        }
        
        currentNote.images.push(imageData);
        updateImagesSection();
        
        // For shared notes, immediately sync the image addition
        if (currentNote.isShared && collaborativeEditingEnabled) {
          isAutoSave = true;
          saveCurrentNote();
          isAutoSave = false;
        } else {
          saveCurrentNote();
        }
        
        showToast("Image added successfully", "success");
      };
      reader.readAsDataURL(file);
    }
  });
  
  // Clear the input so the same file can be uploaded again
  event.target.value = '';
}

function updateImagesSection() {
  const imagesSection = document.getElementById("imagesSection");
  const imageGrid = document.getElementById("imageGrid");
  
  // Safety check for currentNote
  if (!currentNote) {
    if (imagesSection) imagesSection.classList.add("hidden");
    return;
  }
  
  // For shared notes, show all images without filtering by noteId
  // For regular notes, filter by noteId as before
  const noteImages = (currentNote.images || []).filter(img => {
    if (currentNote.isShared) {
      // For shared notes, show all images regardless of noteId
      return true;
    } else {
      // For regular notes, include image if it has no noteId (legacy) or if noteId matches current note
      return !img.noteId || img.noteId === currentNote.id;
    }
  }).map(img => ({...img})); // Create deep copies to prevent reference issues
  
  if (noteImages.length === 0) {
    if (imagesSection) imagesSection.classList.add("hidden");
    return;
  }
  
  if (imagesSection) imagesSection.classList.remove("hidden");
  
  if (imageGrid) {
    // Clear existing content and event listeners
    imageGrid.innerHTML = '';
    
    noteImages.forEach((image, index) => {
      const imageSrc = typeof image === 'string' ? image : (image?.data || '');
      const imageId = typeof image === 'object' && image?.id ? image.id : `img_${currentNote.id}_${index}`;
      
      if (!imageSrc) return;
      
      // Create image container
      const imageContainer = document.createElement('div');
      imageContainer.className = 'image-item';
      imageContainer.setAttribute('data-image-id', imageId);
      
      // Create image element
      const imgElement = document.createElement('img');
      imgElement.src = imageSrc;
      imgElement.alt = 'Note Image';
      imgElement.style.cursor = 'pointer';
      imgElement.setAttribute('data-index', index.toString());
      
      // Add click event listener directly to the image
      imgElement.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("Image clicked:", index, "for note:", currentNote.id);
        openImageViewer(imageSrc, index);
      });
      
      // Create delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'image-delete';
      deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteImage(index);
      });
      
      // Assemble the container
      imageContainer.appendChild(imgElement);
      imageContainer.appendChild(deleteBtn);
      imageGrid.appendChild(imageContainer);
    });
    
    console.log("Updated images section with", noteImages.length, "images for note:", currentNote.id);
  }
}

function deleteImage(index) {
  if (!currentNote?.images) return;
  
  // Filter images that belong to this note
  const noteImages = currentNote.images.filter(img => 
    !img.noteId || img.noteId === currentNote.id
  );
  
  if (index < 0 || index >= noteImages.length || !noteImages[index]) return;
  
  // Find the actual index in the full images array
  const imageToDelete = noteImages[index];
  const actualIndex = currentNote.images.findIndex(img => 
    (img.id && img.id === imageToDelete.id) || 
    (img.data === imageToDelete.data && img.timestamp === imageToDelete.timestamp)
  );
  
  if (actualIndex >= 0 && actualIndex < currentNote.images.length) {
    currentNote.images.splice(actualIndex, 1);
    updateImagesSection();
    
    // For shared notes, immediately sync the image deletion
    if (currentNote.isShared && collaborativeEditingEnabled) {
      isAutoSave = true;
      saveCurrentNote();
      isAutoSave = false;
    } else {
      saveCurrentNote();
    }
    
    showToast("Image deleted successfully", "success");
  }
}

// Image viewer functions
let currentImageSrc = null;
let currentImageIndex = null;

function openImageViewer(imageSrc, imageIndex) {
  console.log("Opening image viewer:", imageSrc, imageIndex);
  currentImageSrc = imageSrc;
  currentImageIndex = imageIndex;
  
  const modal = document.getElementById("imageViewerModal");
  const img = document.getElementById("imageViewerImg");
  
  console.log("Modal found:", !!modal, "Image found:", !!img);
  
  if (modal && img) {
    img.src = imageSrc;
    modal.classList.add("open");
    
    // Prevent body scroll when modal is open
    document.body.style.overflow = "hidden";
    
    console.log("Image viewer opened successfully");
  } else {
    console.error("Modal or image element not found");
  }
}

function closeImageViewer() {
  const modal = document.getElementById("imageViewerModal");
  if (modal) {
    modal.classList.remove("open");
    document.body.style.overflow = "";
    currentImageSrc = null;
    currentImageIndex = null;
  }
}

function downloadImage() {
  if (!currentImageSrc) return;
  
  try {
    // Create a temporary link element
    const link = document.createElement('a');
    link.href = currentImageSrc;
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const noteTitle = currentNote?.title || 'Note';
    const filename = `${noteTitle}_Image_${timestamp}.png`;
    
    link.download = filename;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast("Image downloaded successfully", "success");
  } catch (error) {
    console.error("Error downloading image:", error);
    showToast("Error downloading image", "error");
  }
}

// Collaborator functions
async function loadCurrentCollaborators() {
  const currentCollaborators = document.getElementById("currentCollaborators");
  if (!currentCollaborators || !currentNote) return;
  
  const currentUser = window.authFunctions?.getCurrentUser();
  if (!currentUser) return;
  
  try {
    // Show current user as owner
    const collaborators = [];
    
    // Add current user as owner
    collaborators.push({
      uid: currentUser.uid,
      name: currentUser.displayName || currentUser.email.split('@')[0],
      email: currentUser.email,
      role: 'owner'
    });
    
    // If note is shared, load collaborators from shared note
    if (currentNote.isShared && currentNote.sharedId && window.database) {
      const sharedNoteRef = window.database.ref(`sharedNotes/${currentNote.sharedId}`);
      const snapshot = await sharedNoteRef.once('value');
      const sharedNote = snapshot.val();
      
      if (sharedNote && sharedNote.collaborators) {
        // Get user details for each collaborator
        for (const [uid, collab] of Object.entries(sharedNote.collaborators)) {
          if (uid !== currentUser.uid) {
            const userRef = window.database.ref(`users/${uid}`);
            const userSnapshot = await userRef.once('value');
            const userData = userSnapshot.val();
            
            if (userData) {
              collaborators.push({
                uid: uid,
                name: userData.name || userData.displayName || userData.email.split('@')[0],
                email: userData.email,
                role: collab.role || 'editor'
              });
            }
          }
        }
      }
    }
    
    // Render collaborators
    renderCollaborators(collaborators);
    
  } catch (error) {
    console.error("Error loading collaborators:", error);
    currentCollaborators.innerHTML = "<div class='collaborator-item'>Error loading collaborators</div>";
  }
}

function renderCollaborators(collaborators) {
  const currentCollaborators = document.getElementById("currentCollaborators");
  if (!currentCollaborators) return;
  
  if (collaborators.length === 0) {
    currentCollaborators.innerHTML = "<div class='collaborator-item'>Only you have access</div>";
    return;
  }
  
  currentCollaborators.innerHTML = collaborators.map(collaborator => {
    const initials = collaborator.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    
    return `
      <div class="collaborator-item">
        <div class="collaborator-info">
          <div class="collaborator-avatar">${initials}</div>
          <div class="collaborator-details">
            <div class="collaborator-name">${escapeHtml(collaborator.name)}</div>
            <div class="collaborator-email">${escapeHtml(collaborator.email)}</div>
          </div>
        </div>
        <div class="collaborator-role ${collaborator.role}">${collaborator.role}</div>
      </div>
    `;
  }).join("");
}

// Sharing functions
async function searchUsers(query) {
  const searchResults = document.getElementById("searchResults");
  if (!searchResults) {
    console.log("Search results element not found");
    return;
  }
  
  console.log("Searching for users with query:", query);
  
  if (query.length < 2) {
    searchResults.classList.remove("open");
    return;
  }
  
  const currentUser = window.authFunctions?.getCurrentUser();
  if (!currentUser || !window.database) {
    console.log("No current user or database");
    searchResults.innerHTML = "<div class='user-search-item'>Sign in required</div>";
    searchResults.classList.add("open");
    return;
  }
  
  try {
    console.log("Starting database search...");
    
    // Search for users by username, name, and email
    const usersRef = window.database.ref('users');
    const snapshot = await usersRef.once('value');
    
    console.log("Database snapshot received:", snapshot.exists());
    
    const users = [];
    const queryLower = query.toLowerCase();
    let totalUsers = 0;
    
    snapshot.forEach(childSnapshot => {
      totalUsers++;
      const userData = childSnapshot.val();
      console.log(`User ${totalUsers}:`, userData);
      
      if (userData && userData.uid !== currentUser.uid && userData.username) {
        const matchesUsername = userData.username && userData.username.toLowerCase().includes(queryLower);
        const matchesName = userData.name && userData.name.toLowerCase().includes(queryLower);
        const matchesEmail = userData.email && userData.email.toLowerCase().includes(queryLower);
        
        if (matchesUsername || matchesName || matchesEmail) {
          console.log("Found matching user:", userData);
          users.push({
            uid: childSnapshot.key,
            username: userData.username,
            name: userData.name || userData.displayName || (userData.email ? userData.email.split('@')[0] : 'Unknown'),
            email: userData.email || ''
          });
        }
      }
    });
    
    console.log(`Searched ${totalUsers} users, found ${users.length} matches`);
    
    // Sort by relevance (exact matches first, then partial matches)
    users.sort((a, b) => {
      const aExact = a.username.toLowerCase() === queryLower || a.name.toLowerCase() === queryLower;
      const bExact = b.username.toLowerCase() === queryLower || b.name.toLowerCase() === queryLower;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return a.name.localeCompare(b.name);
    });
    
    if (users.length === 0) {
      searchResults.innerHTML = "<div class='user-search-item'>No users found</div>";
    } else {
      console.log("Rendering users to UI:", users);
      searchResults.innerHTML = users.map(user => `
        <div class="user-search-item" onclick="selectUser('${user.uid}', '${escapeHtml(user.name)}', '${escapeHtml(user.username)}')" style="background: #2d2d2d; padding: 12px; border-bottom: 1px solid #404040; cursor: pointer; transition: background-color 0.2s;" onmouseover="this.style.background='#3a3a3a'" onmouseout="this.style.background='#2d2d2d'">
          <div class="user-info" style="display: flex; flex-direction: column; gap: 4px;">
            <div class="user-name" style="font-weight: 600; color: #ffffff; font-size: 14px;">${escapeHtml(user.name)}</div>
            <div class="user-username" style="font-size: 13px; color: #b0b0b0;">@${escapeHtml(user.username)}</div>
            <div class="user-email" style="font-size: 12px; color: #888888;">${escapeHtml(user.email)}</div>
          </div>
        </div>
      `).join("");
      console.log("Search results HTML set:", searchResults.innerHTML);
    }
    
    searchResults.classList.add("open");
    console.log("Search results classes:", searchResults.className);
  } catch (error) {
    console.error("Error searching users:", error);
    searchResults.innerHTML = "<div class='user-search-item'>Error searching users</div>";
  }
}

async function sendInvitations() {
  if (!currentNote || !window.database) return;
  
  const selectedUsers = document.getElementById("selectedUsers");
  const userElements = selectedUsers?.querySelectorAll("[data-uid]");
  
  if (!userElements || userElements.length === 0) {
    showToast("Select users to share with", "warning");
    return;
  }
  
  const currentUser = window.authFunctions?.getCurrentUser();
  if (!currentUser) return;
  
  try {
    console.log("Starting invitation process...");
    console.log("Current note:", currentNote);
    console.log("Selected users:", userElements.length);
    
    // Create shared note
    const sharedId = generateId();
    console.log("Generated shared ID:", sharedId);
    
    const sharedNoteData = {
      id: sharedId,
      title: currentNote.title || "Untitled Note",
      content: currentNote.content || "",
      categories: currentNote.categories || [],
      images: currentNote.images || [],
      listSections: currentNote.listSections || [],
      // Keep legacy list for backwards compatibility
      list: currentNote.list || [],
      listType: currentNote.listType || 'bulleted',
      voiceNotes: currentNote.voiceNotes || [],
      createdAt: currentNote.createdAt || Date.now(),
      updatedAt: Date.now(),
      lastModified: Date.now(),
      ownerId: currentUser.uid,
      collaborators: {},
      activeUsers: {}
    };
    
    // Add owner as collaborator
    sharedNoteData.collaborators[currentUser.uid] = {
      role: 'owner',
      name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Owner',
      email: currentUser.email || '',
      joinedAt: Date.now()
    };
    
    // Initialize owner's presence
    sharedNoteData.activeUsers[currentUser.uid] = {
      name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Owner',
      email: currentUser.email || '',
      status: 'editing',
      lastActive: Date.now(),
      currentField: null
    };
    
    console.log("Shared note data:", sharedNoteData);
    
    // Save shared note
    await window.database.ref(`sharedNotes/${sharedId}`).set(sharedNoteData);
    console.log("Shared note saved to database");
    
    // Send invitations to selected users
    const invitations = [];
    userElements.forEach(element => {
      const uid = element.dataset.uid;
      const userName = element.querySelector('.user-name')?.textContent || 'Unknown';
      const invitationId = generateId();
      
      const invitation = {
        id: invitationId,
        sharedId: sharedId,
        from: currentUser.uid,
        fromName: currentUser.displayName || currentUser.email.split('@')[0],
        to: uid,
        toName: userName,
        noteTitle: currentNote.title || "Untitled Note",
        createdAt: Date.now(),
        status: 'pending'
      };
      
      invitations.push(invitation);
      console.log("Created invitation:", invitation);
    });
    
    console.log("Total invitations to send:", invitations.length);
    
    // Save invitations
    const invitationsRef = window.database.ref('invitations');
    for (const invitation of invitations) {
      await invitationsRef.child(invitation.id).set(invitation);
      console.log("Saved invitation to database:", invitation.id);
    }
    
    // Mark current note as shared and add collaborators data
    currentNote.isShared = true;
    currentNote.sharedId = sharedId;
    currentNote.collaborators = sharedNoteData.collaborators;
    saveCurrentNote();
    console.log("Note marked as shared and saved");
    
    // Also update the note in the notes array to reflect shared status
    const noteIndex = notes.findIndex(n => n.id === currentNote.id);
    if (noteIndex !== -1) {
      notes[noteIndex].isShared = true;
      notes[noteIndex].sharedId = sharedId;
      notes[noteIndex].collaborators = sharedNoteData.collaborators;
      localStorage.setItem("notes", JSON.stringify(notes));
      
      // Save to Firebase if user is authenticated
      if (window.authFunctions && typeof window.authFunctions.saveUserData === 'function') {
        window.authFunctions.saveUserData();
      }
    }
    
    showToast(`Sent ${invitations.length} invitation(s)`, "success");
    hideShareModal();
    
  } catch (error) {
    console.error("Error sending invitations:", error);
    showToast("Error sharing note", "error");
  }
}

function selectUser(uid, name, username) {
  const selectedUsers = document.getElementById("selectedUsers");
  if (!selectedUsers) return;
  
  // Check if user is already selected
  if (selectedUsers.querySelector(`[data-uid="${uid}"]`)) return;
  
  const userElement = document.createElement("div");
  userElement.className = "selected-user";
  userElement.dataset.uid = uid;
  userElement.innerHTML = `
    <div class="user-info">
      <div class="user-name">${name}</div>
      <div class="user-username">@${username}</div>
    </div>
    <button class="remove-user" onclick="removeSelectedUser('${uid}')">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  selectedUsers.appendChild(userElement);
  
  // Enable send button if users are selected
  const sendBtn = document.getElementById("sendInvitesBtn");
  if (sendBtn) sendBtn.disabled = false;
  
  // Clear search
  const searchInput = document.getElementById("userSearchInput");
  const searchResults = document.getElementById("searchResults");
  if (searchInput) searchInput.value = "";
  if (searchResults) searchResults.classList.remove("open");
}

function removeSelectedUser(uid) {
  const selectedUsers = document.getElementById("selectedUsers");
  const userElement = selectedUsers?.querySelector(`[data-uid="${uid}"]`);
  
  if (userElement) {
    userElement.remove();
    
    // Disable send button if no users selected
    const remainingUsers = selectedUsers.querySelectorAll("[data-uid]");
    const sendBtn = document.getElementById("sendInvitesBtn");
    if (sendBtn && remainingUsers.length === 0) {
      sendBtn.disabled = true;
    }
  }
}

async function saveUsername() {
  const usernameInput = document.getElementById("usernameInput");
  if (!usernameInput) return;
  
  const username = usernameInput.value.trim();
  if (!validateUsername(username)) {
    showToast("Username must be 4-20 characters, letters, numbers, and _ only", "error");
    return;
  }
  
  const currentUser = window.authFunctions?.getCurrentUser();
  if (!currentUser || !window.database) return;
  
  try {
    // Save username to Firebase
    await window.database.ref(`users/${currentUser.uid}`).update({
      username: username,
      name: currentUser.displayName || currentUser.email.split('@')[0],
      email: currentUser.email,
      uid: currentUser.uid,
      updatedAt: Date.now()
    });
    
    // Save username to localStorage to prevent future prompts
    localStorage.setItem(`username_${currentUser.uid}`, username);
    
    hideUsernameModal();
    showToast("Username saved successfully", "success");
  } catch (error) {
    console.error("Error saving username:", error);
    showToast("Error saving username", "error");
  }
}

function validateUsername(username) {
  return username.length >= 4 && username.length <= 20 && /^[a-zA-Z0-9_]+$/.test(username);
}

async function saveName() {
  const nameInput = document.getElementById("nameInput");
  if (!nameInput) return;
  
  const name = nameInput.value.trim();
  if (name && window.authFunctions?.updateUserName) {
    try {
      await window.authFunctions.updateUserName(name);
      hideNameModal();
      updateSettingsContent();
    } catch (error) {
      showToast("Error updating name", "error");
    }
  }
}

// Settings functions
function loadSettings() {
  const theme = localStorage.getItem("theme") || "system";
  const language = localStorage.getItem("language") || "en";
  
  const themeSelect = document.getElementById("themeSelect");
  const languageSelect = document.getElementById("languageSelect");
  
  if (themeSelect) themeSelect.value = theme;
  if (languageSelect) languageSelect.value = language;
  
  applyTheme(theme);
}

function handleThemeChange(event) {
  const theme = event.target.value;
  localStorage.setItem("theme", theme);
  applyTheme(theme);
}

function handleLanguageChange(event) {
  const language = event.target.value;
  localStorage.setItem("language", language);
  currentLanguage = language;
  // Refresh UI with new language
  renderNotes();
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

// Utility functions
function generateId() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString();
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = 'default') {
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toastMessage");
  
  if (toast && toastMessage) {
    toastMessage.textContent = message;
    toast.className = `toast open ${type}`;
    
    setTimeout(() => {
      toast.classList.remove("open");
    }, 3000);
  }
}

// Global functions for inline event handlers
window.editNote = editNote;
window.toggleNoteCategory = toggleNoteCategory;
window.toggleListItem = toggleListItem;
window.updateListItem = updateListItem;
window.deleteListItem = deleteListItem;
window.addListItemToSection = addListItemToSection;
window.updateListItemInSection = updateListItemInSection;
window.toggleListItemInSection = toggleListItemInSection;
window.deleteListItemInSection = deleteListItemInSection;
window.deleteListSection = deleteListSection;
window.deleteImage = deleteImage;
window.selectUser = selectUser;
window.removeSelectedUser = removeSelectedUser;
window.showUsernameModal = showUsernameModal;
window.updateShoppingItem = updateShoppingItem;
window.toggleShoppingItem = toggleShoppingItem;
window.deleteShoppingItem = deleteShoppingItem;

// Search functionality
function handleSearch() {
  const searchInput = document.getElementById("searchInput");
  const searchClear = document.getElementById("searchClear");
  
  if (!searchInput) return;
  
  searchQuery = searchInput.value.trim();
  
  if (searchQuery) {
    if (searchClear) searchClear.classList.remove("hidden");
  } else {
    if (searchClear) searchClear.classList.add("hidden");
  }
  
  renderNotes();
}

function clearSearch() {
  const searchInput = document.getElementById("searchInput");
  const searchClear = document.getElementById("searchClear");
  
  if (searchInput) searchInput.value = "";
  searchQuery = "";
  if (searchClear) searchClear.classList.add("hidden");
  
  renderNotes();
}

function getFilteredNotes() {
  // Ensure notes is always an array
  if (!Array.isArray(notes)) {
    console.warn("Notes array is not initialized, returning empty array");
    return [];
  }
  
  let filteredNotes = [...notes]; // Create a copy to avoid mutations
  
  // Apply category filter first
  if (currentFilter === "shared") {
    filteredNotes = filteredNotes.filter(note => 
      note.sharedId || (note.collaborators && Object.keys(note.collaborators).length > 0)
    );
  } else if (currentFilter !== "all") {
    filteredNotes = filteredNotes.filter(note => 
      note.categories && Array.isArray(note.categories) && note.categories.includes(currentFilter)
    );
  }
  
  // Apply search filter
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredNotes = filteredNotes.filter(note => {
      // Search in title
      if (note.title && note.title.toLowerCase().includes(query)) return true;
      
      // Search in content
      if (note.content && note.content.toLowerCase().includes(query)) return true;
      
      // Search in categories
      if (Array.isArray(note.categories) && Array.isArray(categories)) {
        const categoryNames = note.categories.map(catId => {
          const category = categories.find(c => c.id === catId);
          return category ? category.name.toLowerCase() : catId.toLowerCase();
        });
        if (categoryNames.some(name => name.includes(query))) return true;
      }
      
      // Search in list items
      if (note.list && Array.isArray(note.list.items)) {
        const listText = note.list.items.map(item => item.text || "").join(" ").toLowerCase();
        if (listText.includes(query)) return true;
      }
      
      // Search in list sections
      if (Array.isArray(note.listSections)) {
        const sectionsText = note.listSections.map(section => 
          Array.isArray(section.items) ? section.items.map(item => item.text || "").join(" ") : ""
        ).join(" ").toLowerCase();
        if (sectionsText.includes(query)) return true;
      }
      
      return false;
    });
  }
  
  return filteredNotes;
}

function highlightSearchTerms(text, query) {
  if (!query || !text) return escapeHtml(text);
  
  const escapedText = escapeHtml(text);
  const escapedQuery = escapeHtml(query);
  const regex = new RegExp(`(${escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  
  return escapedText.replace(regex, '<mark class="search-highlight">$1</mark>');
}

// Real-time collaborative editing functions
function setupRealtimeCollaboration(sharedId) {
  if (!window.database || !sharedId) return;
  
  // Remove existing listener if any
  cleanupRealtimeCollaboration(sharedId);
  
  const sharedNoteRef = window.database.ref(`sharedNotes/${sharedId}`);
  
  // Listen for changes to the shared note
  const listener = sharedNoteRef.on('value', (snapshot) => {
    const sharedNote = snapshot.val();
    if (!sharedNote) return;
    
    // Update the current note with shared data
    if (currentNote && currentNote.sharedId === sharedId) {
      // Check if this is a newer update
      const isNewer = !currentNote.updatedAt || sharedNote.updatedAt > currentNote.updatedAt;
      
      // Skip if this is our own update or if it's older
      const currentUser = window.authFunctions?.getCurrentUser();
      const isOwnUpdate = currentUser && sharedNote.lastEditedBy === currentUser.uid;
      
      if (!isNewer && isOwnUpdate) return;
      
      console.log('Real-time update received - content synchronized');
      
      // Update note content
      currentNote.title = sharedNote.title || '';
      currentNote.content = sharedNote.content || '';
      currentNote.categories = sharedNote.categories || [];
      currentNote.images = sharedNote.images || [];
      currentNote.listSections = sharedNote.listSections || [];
      currentNote.updatedAt = sharedNote.updatedAt;
      currentNote.lastModified = sharedNote.lastModified;
      
      // Handle legacy list format
      if (sharedNote.list && !sharedNote.listSections) {
        currentNote.listSections = [{
          id: generateId(),
          type: sharedNote.listType || 'bulleted',
          items: sharedNote.list
        }];
      }
      
      // Update current list type for UI
      if (sharedNote.listType) {
        currentListType = sharedNote.listType;
      }
      
      // Update UI elements with real-time changes only if user isn't actively typing
      const titleInput = document.getElementById("titleInput");
      const contentTextarea = document.getElementById("contentTextarea");
      const activeElement = document.activeElement;
      
      // Update title if user isn't typing in it
      if (titleInput && activeElement !== titleInput) {
        titleInput.value = currentNote.title || '';
      }
      
      // Update content if user isn't typing in it
      if (contentTextarea && activeElement !== contentTextarea) {
        contentTextarea.value = currentNote.content || '';
      }
      
      // Update category chips
      updateCategoryChips();
      
      // Only update list section if user is not actively interacting with it
      const listItems = document.getElementById("listItems");
      const isListFocused = listItems && listItems.contains(document.activeElement);
      if (!isListFocused) {
        updateListSection();
      }
      
      // Force update images section to reflect real-time changes
      updateImagesSection();
      
      // Log image synchronization for debugging
      console.log(`Updated images section with ${(currentNote.images || []).length} images for note: ${currentNote.id}`);
      
      // Update the note in local notes array
      const noteIndex = notes.findIndex(n => n.id === currentNote.id);
      if (noteIndex !== -1) {
        notes[noteIndex] = { ...currentNote };
        localStorage.setItem("notes", JSON.stringify(notes));
      }
      
      isReceivingUpdate = false;
      
      // Update collaborator presence indicators
      updateCollaboratorPresence(sharedNote.activeUsers || {});
    }
  });
  
  // Store the listener for cleanup
  sharedNoteListeners.set(sharedId, listener);
  
  // Update presence to show user is actively editing
  updatePresence(sharedId, { status: 'editing' });
  
  // Show collaboration status indicator
  showCollaborationStatus();
  
  // Setup faster auto-save for collaborative editing
  setupFastAutoSave();
  
  console.log("Real-time collaboration enabled for shared note:", sharedId);
  
  // Setup user activity tracking
  trackUserActivity();
  
  // Force initial list section update to ensure everything renders properly
  setTimeout(() => {
    updateListSection();
  }, 200);
  
  collaborativeEditingEnabled = true;
  console.log('Real-time collaboration enabled for shared note:', sharedId);
}

function cleanupRealtimeCollaboration(sharedId) {
  if (sharedNoteListeners.has(sharedId)) {
    const listener = sharedNoteListeners.get(sharedId);
    if (listener && window.database) {
      const sharedNoteRef = window.database.ref(`sharedNotes/${sharedId}`);
      sharedNoteRef.off('value', listener);
    }
    sharedNoteListeners.delete(sharedId);
  }
  
  // Clear presence interval
  if (window.presenceInterval) {
    clearInterval(window.presenceInterval);
    window.presenceInterval = null;
  }
  
  // Remove user presence from shared note
  const currentUser = window.authFunctions?.getCurrentUser();
  if (currentUser && window.database && sharedId) {
    const presenceRef = window.database.ref(`sharedNotes/${sharedId}/activeUsers/${currentUser.uid}`);
    presenceRef.remove().catch(() => {
      // Silently handle errors
    });
  }
  
  // Update presence to show user is no longer editing
  if (window.authFunctions?.updatePresence) {
    window.authFunctions.updatePresence(sharedId, { status: 'idle' }).catch(() => {
      // Silently handle errors
    });
  }
  
  // Hide collaboration status indicator
  hideCollaborationStatus();
  
  collaborativeEditingEnabled = false;
}

function updatePresence(sharedId, data) {
  if (window.authFunctions?.updatePresence) {
    window.authFunctions.updatePresence(sharedId, data);
  }
}

function trackUserActivity() {
  // Track user typing activity for presence indicators
  const titleInput = document.getElementById("titleInput");
  const contentTextarea = document.getElementById("contentTextarea");
  
  function updateActivityStatus() {
    if (currentNote && currentNote.isShared && currentNote.sharedId) {
      updatePresence(currentNote.sharedId, { 
        status: 'editing',
        lastActive: Date.now(),
        currentField: document.activeElement?.id || null
      });
    }
  }
  
  if (titleInput) {
    titleInput.addEventListener('focus', updateActivityStatus);
    titleInput.addEventListener('input', updateActivityStatus);
  }
  
  if (contentTextarea) {
    contentTextarea.addEventListener('focus', updateActivityStatus);
    contentTextarea.addEventListener('input', updateActivityStatus);
  }
}

function showCollaborationStatus() {
  const collaborationStatus = document.getElementById('collaborationStatus');
  if (collaborationStatus) {
    collaborationStatus.style.display = 'block';
  }
}

function hideCollaborationStatus() {
  const collaborationStatus = document.getElementById('collaborationStatus');
  if (collaborationStatus) {
    collaborationStatus.style.display = 'none';
  }
}

function setupFastAutoSave() {
  // Clear existing auto-save timeout
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
  }
  
  const titleInput = document.getElementById("titleInput");
  const contentTextarea = document.getElementById("contentTextarea");
  
  function fastSave() {
    if (collaborativeEditingEnabled && !isReceivingUpdate && currentNote) {
      // Update current note with latest values before saving
      const titleInput = document.getElementById("titleInput");
      const contentTextarea = document.getElementById("contentTextarea");
      
      if (titleInput) currentNote.title = titleInput.value;
      if (contentTextarea) currentNote.content = contentTextarea.value;
      
      isAutoSave = true;
      saveCurrentNote();
      isAutoSave = false;
    }
  }
  
  // Save every 500ms for stable real-time collaboration
  const fastAutoSave = debounce(fastSave, 500);
  
  if (titleInput) {
    titleInput.removeEventListener('input', fastAutoSave);
    titleInput.addEventListener('input', fastAutoSave);
  }
  
  if (contentTextarea) {
    contentTextarea.removeEventListener('input', fastAutoSave);
    contentTextarea.addEventListener('input', fastAutoSave);
  }
}

function setupHomePageSync() {
  // Clear any existing sync interval
  if (homePageSyncInterval) {
    clearInterval(homePageSyncInterval);
  }
  
  // Only sync if we're on the notes page and user is signed in
  const notesPage = document.getElementById("notesPage");
  if (!notesPage || !notesPage.classList.contains("active") || !getCurrentUser() || isUserGuest()) {
    return;
  }
  
  // Use Firebase real-time listener for shared notes updates
  const currentUser = getCurrentUser();
  if (!currentUser || !window.database) return;
  
  try {
    // Listen for changes to shared notes where user is owner or collaborator
    const sharedNotesRef = window.database.ref('sharedNotes');
    
    homePageSyncInterval = sharedNotesRef.on('child_changed', (snapshot) => {
      try {
        const sharedNoteId = snapshot.key;
        const sharedNoteData = snapshot.val();
        
        // Check if current user is involved in this shared note
        if (!sharedNoteData) {
          return;
        }
        
        // Check if user is owner
        if (sharedNoteData.ownerId === currentUser.uid) {
          // User is owner, continue with update
        } else {
          // Check if user is a collaborator (handle both array and object formats)
          let isCollaborator = false;
          if (sharedNoteData.collaborators) {
            if (Array.isArray(sharedNoteData.collaborators)) {
              isCollaborator = sharedNoteData.collaborators.includes(currentUser.uid);
            } else if (typeof sharedNoteData.collaborators === 'object') {
              isCollaborator = sharedNoteData.collaborators[currentUser.uid] === true;
            }
          }
          
          if (!isCollaborator) {
            return;
          }
        }
        
        // Update local notes with the changed shared note
        const existingIndex = notes.findIndex(n => n.sharedId === sharedNoteId);
        if (existingIndex !== -1 && existingIndex < notes.length) {
          notes[existingIndex] = {
            ...notes[existingIndex],
            title: sharedNoteData.title || '',
            content: sharedNoteData.content || '',
            lastModified: sharedNoteData.lastModified,
            categories: sharedNoteData.categories || [],
            images: sharedNoteData.images || [],
            listSections: sharedNoteData.listSections || []
          };
          
          // Re-render notes to show the update
          renderNotes();
        }
      } catch (error) {
        console.error("Error processing shared note update:", error);
      }
    });
    
    console.log("Home page real-time sync enabled");
  } catch (error) {
    console.error("Error setting up home page sync:", error);
  }
}

function cleanupHomePageSync() {
  if (homePageSyncInterval && window.database) {
    try {
      // Remove Firebase listener
      const sharedNotesRef = window.database.ref('sharedNotes');
      sharedNotesRef.off('child_changed', homePageSyncInterval);
      console.log("Home page sync listener removed");
    } catch (error) {
      console.error("Error removing sync listener:", error);
    }
    homePageSyncInterval = null;
  }
}

function updateCollaboratorPresence(activeUsers) {
  const activeCollaborators = document.getElementById('activeCollaborators');
  const collaborationText = document.querySelector('.collaboration-text');
  if (!activeCollaborators) return;
  
  const currentUser = window.authFunctions?.getCurrentUser();
  if (!currentUser) return;
  
  // Filter out current user and get only recently active collaborators (within last 30 seconds)
  const now = Date.now();
  const collaborators = activeUsers && typeof activeUsers === 'object' ? 
    Object.entries(activeUsers)
      .filter(([uid, userData]) => {
        if (uid === currentUser.uid || !userData) return false;
        // Check if user was active within last 30 seconds
        const lastActive = userData.lastActive || 0;
        return (now - lastActive) < 30000 && userData.status === 'editing';
      })
      .slice(0, 5) : []; // Show max 5 collaborators
  
  if (collaborators.length === 0) {
    activeCollaborators.innerHTML = '';
    if (collaborationText) {
      collaborationText.textContent = 'Live editing enabled';
    }
    return;
  }
  
  // Update collaboration text with count
  if (collaborationText) {
    const count = collaborators.length;
    collaborationText.textContent = `${count} other${count > 1 ? 's' : ''} editing`;
  }
  
  activeCollaborators.innerHTML = collaborators.map(([uid, userData]) => {
    const name = userData.name || userData.email?.split('@')[0] || 'User';
    const initials = name.substring(0, 2).toUpperCase();
    const fieldIndicator = userData.currentField === 'titleInput' ? ' (title)' : 
                          userData.currentField === 'contentTextarea' ? ' (content)' : '';
    const timeSinceActive = Math.floor((now - (userData.lastActive || 0)) / 1000);
    const activeText = timeSinceActive < 5 ? 'now' : `${timeSinceActive}s ago`;
    
    return `<div class="collaborator-avatar" title="${name}${fieldIndicator} - active ${activeText}">${initials}</div>`;
  }).join('');
}

// Advanced Search Functions
let advancedSearchFilters = {};

function showAdvancedSearchModal() {
  const modal = document.getElementById('advancedSearchModal');
  if (modal) {
    // Populate categories in dropdown
    const categorySelect = document.getElementById('advancedSearchCategory');
    if (categorySelect && userData.categories) {
      categorySelect.innerHTML = '<option value="">All categories</option>';
      userData.categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        categorySelect.appendChild(option);
      });
    }
    
    modal.classList.add('open');
  }
}

function hideAdvancedSearchModal() {
  const modal = document.getElementById('advancedSearchModal');
  if (modal) {
    modal.classList.remove('open');
  }
}

function clearAdvancedSearch() {
  document.getElementById('advancedSearchContent').value = '';
  document.getElementById('advancedSearchFromDate').value = '';
  document.getElementById('advancedSearchToDate').value = '';
  document.getElementById('advancedSearchCategory').value = '';
  document.getElementById('advancedSearchType').value = '';
  document.getElementById('advancedSearchSort').value = 'date';
  
  advancedSearchFilters = {};
  document.getElementById('searchInput').value = '';
  handleSearch();
}

function performAdvancedSearch() {
  const content = document.getElementById('advancedSearchContent').value.trim();
  const fromDate = document.getElementById('advancedSearchFromDate').value;
  const toDate = document.getElementById('advancedSearchToDate').value;
  const category = document.getElementById('advancedSearchCategory').value;
  const type = document.getElementById('advancedSearchType').value;
  const sort = document.getElementById('advancedSearchSort').value;
  
  advancedSearchFilters = {
    content,
    fromDate: fromDate ? new Date(fromDate) : null,
    toDate: toDate ? new Date(toDate) : null,
    category,
    type,
    sort
  };
  
  // Update search input with content if provided
  if (content) {
    document.getElementById('searchInput').value = content;
  }
  
  handleAdvancedSearch();
  hideAdvancedSearchModal();
}

function handleAdvancedSearch() {
  let filteredNotes = [...appData.notes];
  
  // Apply filters
  if (advancedSearchFilters.content) {
    const query = advancedSearchFilters.content.toLowerCase();
    filteredNotes = filteredNotes.filter(note => 
      (note.title && note.title.toLowerCase().includes(query)) ||
      (note.content && note.content.toLowerCase().includes(query)) ||
      (note.list && note.list.some(item => item.text.toLowerCase().includes(query)))
    );
  }
  
  if (advancedSearchFilters.fromDate) {
    filteredNotes = filteredNotes.filter(note => 
      new Date(note.lastModified || note.timestamp) >= advancedSearchFilters.fromDate
    );
  }
  
  if (advancedSearchFilters.toDate) {
    const endDate = new Date(advancedSearchFilters.toDate);
    endDate.setHours(23, 59, 59, 999);
    filteredNotes = filteredNotes.filter(note => 
      new Date(note.lastModified || note.timestamp) <= endDate
    );
  }
  
  if (advancedSearchFilters.category) {
    filteredNotes = filteredNotes.filter(note => 
      note.categories && note.categories.includes(advancedSearchFilters.category)
    );
  }
  
  if (advancedSearchFilters.type) {
    switch (advancedSearchFilters.type) {
      case 'text':
        filteredNotes = filteredNotes.filter(note => 
          !note.images?.length && !note.list?.length && !note.voiceNotes?.length
        );
        break;
      case 'images':
        filteredNotes = filteredNotes.filter(note => note.images?.length > 0);
        break;
      case 'lists':
        filteredNotes = filteredNotes.filter(note => note.list?.length > 0);
        break;
      case 'voice':
        filteredNotes = filteredNotes.filter(note => note.voiceNotes?.length > 0);
        break;
      case 'shared':
        filteredNotes = filteredNotes.filter(note => note.shared);
        break;
      case 'password':
        filteredNotes = filteredNotes.filter(note => note.password);
        break;
    }
  }
  
  // Apply sorting
  switch (advancedSearchFilters.sort) {
    case 'title':
      filteredNotes.sort((a, b) => (a.title || 'Untitled').localeCompare(b.title || 'Untitled'));
      break;
    case 'created':
      filteredNotes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      break;
    case 'relevance':
      // Sort by relevance if there's a content search
      if (advancedSearchFilters.content) {
        const query = advancedSearchFilters.content.toLowerCase();
        filteredNotes.sort((a, b) => {
          const aRelevance = getRelevanceScore(a, query);
          const bRelevance = getRelevanceScore(b, query);
          return bRelevance - aRelevance;
        });
      }
      break;
    default: // 'date'
      filteredNotes.sort((a, b) => new Date(b.lastModified || b.timestamp) - new Date(a.lastModified || a.timestamp));
  }
  
  renderFilteredNotes(filteredNotes);
}

function getRelevanceScore(note, query) {
  let score = 0;
  const title = (note.title || '').toLowerCase();
  const content = (note.content || '').toLowerCase();
  
  // Title matches get higher score
  if (title.includes(query)) score += 10;
  if (title.startsWith(query)) score += 5;
  
  // Content matches
  if (content.includes(query)) score += 5;
  
  // List item matches
  if (note.list) {
    note.list.forEach(item => {
      if (item.text.toLowerCase().includes(query)) score += 3;
    });
  }
  
  return score;
}

function renderFilteredNotes(notes) {
  const notesContainer = document.getElementById('notesContainer');
  if (!notesContainer) return;
  
  if (notes.length === 0) {
    notesContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-search"></i>
        <h3>No notes found</h3>
        <p>Try adjusting your search criteria</p>
        <button class="btn btn-primary" onclick="clearAdvancedSearch()">Clear Search</button>
      </div>
    `;
    return;
  }
  
  let html = '';
  notes.forEach(note => {
    const hasPassword = note.password;
    const categories = note.categories || [];
    const categoryText = categories.length > 0 ? 
      categories.map(catId => {
        const cat = appData.categories.find(c => c.id === catId);
        return cat ? cat.name : '';
      }).filter(name => name).join(', ') : '';
    
    const date = formatDate(note.lastModified || note.timestamp);
    const title = escapeHtml(note.title || 'Untitled');
    const preview = getContentPreview(note);
    const highlightedTitle = highlightSearchTerms(title, advancedSearchFilters.content || '');
    const highlightedPreview = highlightSearchTerms(preview, advancedSearchFilters.content || '');
    
    html += `
      <div class="note-item" onclick="editNote(appData.notes.find(n => n.id === '${note.id}'))">
        <div class="note-content">
          <div class="note-header">
            <h3 class="note-title">${highlightedTitle}</h3>
            <div class="note-indicators">
              ${hasPassword ? '<i class="fas fa-lock" title="Password protected"></i>' : ''}
              ${note.images?.length ? '<i class="fas fa-image" title="Has images"></i>' : ''}
              ${note.list?.length ? '<i class="fas fa-list" title="Has list"></i>' : ''}
              ${note.voiceNotes?.length ? '<i class="fas fa-microphone" title="Has voice notes"></i>' : ''}
              ${note.shared ? '<i class="fas fa-share-alt" title="Shared"></i>' : ''}
            </div>
          </div>
          <p class="note-preview">${highlightedPreview}</p>
          <div class="note-meta">
            <span class="note-date">${date}</span>
            ${categoryText ? `<span class="note-categories">${categoryText}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  });
  
  notesContainer.innerHTML = html;
}

function getContentPreview(note) {
  if (note.content) {
    return note.content.length > 100 ? note.content.substring(0, 100) + '...' : note.content;
  }
  if (note.list?.length) {
    const firstItems = note.list.slice(0, 3).map(item => item.text).join(', ');
    return firstItems.length > 100 ? firstItems.substring(0, 100) + '...' : firstItems;
  }
  if (note.voiceNotes?.length) {
    return `Voice note (${note.voiceNotes.length} recording${note.voiceNotes.length > 1 ? 's' : ''})`;
  }
  return 'No content';
}

// Voice Search Functions
let voiceSearchRecognition = null;

function startVoiceSearch() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('Voice search is not supported in this browser', 'error');
    return;
  }
  
  const modal = document.getElementById('voiceSearchModal');
  if (modal) {
    modal.classList.add('open');
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    voiceSearchRecognition = new SpeechRecognition();
    
    voiceSearchRecognition.continuous = false;
    voiceSearchRecognition.interimResults = true;
    voiceSearchRecognition.lang = 'en-US';
    
    const transcriptEl = document.getElementById('voiceSearchTranscript');
    const statusEl = document.getElementById('voiceSearchStatus');
    const voiceBtn = document.getElementById('searchVoiceBtn');
    
    if (voiceBtn) voiceBtn.classList.add('recording');
    
    voiceSearchRecognition.onstart = () => {
      if (statusEl) statusEl.textContent = 'Listening...';
      if (transcriptEl) transcriptEl.textContent = '';
    };
    
    voiceSearchRecognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      if (transcriptEl) {
        transcriptEl.innerHTML = finalTranscript + '<span style="color: #999;">' + interimTranscript + '</span>';
      }
      
      if (finalTranscript) {
        document.getElementById('searchInput').value = finalTranscript.trim();
        handleSearch();
        stopVoiceSearch();
      }
    };
    
    voiceSearchRecognition.onerror = (event) => {
      console.error('Voice search error:', event.error);
      showToast('Voice search error: ' + event.error, 'error');
      stopVoiceSearch();
    };
    
    voiceSearchRecognition.onend = () => {
      stopVoiceSearch();
    };
    
    voiceSearchRecognition.start();
  }
}

function stopVoiceSearch() {
  if (voiceSearchRecognition) {
    voiceSearchRecognition.stop();
    voiceSearchRecognition = null;
  }
  
  const modal = document.getElementById('voiceSearchModal');
  if (modal) {
    modal.classList.remove('open');
  }
  
  const voiceBtn = document.getElementById('searchVoiceBtn');
  if (voiceBtn) voiceBtn.classList.remove('recording');
}

// Voice Note Functions
let voiceRecording = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = null;
let recordingTimer = null;

function showVoiceRecordingModal() {
  const modal = document.getElementById('voiceRecordingModal');
  if (modal) {
    modal.classList.add('open');
    initializeSpeechRecognition();
    resetVoiceRecording();
  } else {
    showToast('Voice recording not available', 'error');
  }
}

// Initialize speech recognition
function initializeSpeechRecognition() {
  console.log('Checking speech recognition support...');
  console.log('webkitSpeechRecognition available:', 'webkitSpeechRecognition' in window);
  console.log('SpeechRecognition available:', 'SpeechRecognition' in window);
  
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    speechRecognition = new SpeechRecognition();
    console.log('Speech recognition instance created:', speechRecognition);
    
    // Configure for maximum accuracy and precision
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.maxAlternatives = 5; // More alternatives for best accuracy
    speechRecognition.lang = navigator.language || 'en-US'; // Auto-detect user's language
    
    // Precision settings
    if (speechRecognition.audioTrack) {
      speechRecognition.audioTrack = true; // Enable audio processing improvements
    }
    if (speechRecognition.grammars) {
      // Add grammar hints for better recognition of common words
      const grammar = '#JSGF V1.0; grammar punctuation; public <punctuation> = period | comma | question mark | exclamation point | new line;';
      const speechRecognitionList = new (window.SpeechGrammarList || window.webkitSpeechGrammarList)();
      speechRecognitionList.addFromString(grammar, 1);
      speechRecognition.grammars = speechRecognitionList;
    }
    
    speechRecognition.onstart = () => {
      console.log('Speech recognition started');
      isListening = true;
      const statusEl = document.getElementById('voiceStatus');
      const circleEl = document.getElementById('voiceVisualizer').querySelector('.voice-circle');
      
      if (statusEl) statusEl.textContent = 'Listening... Speak now';
      if (circleEl) circleEl.classList.add('recording');
      
      // Start timer
      recordingStartTime = Date.now();
      recordingTimer = setInterval(updateRecordingDuration, 100);
    };
    
    speechRecognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        // Use the most confident result for better accuracy
        const result = event.results[i];
        let bestTranscript = result[0].transcript;
        let bestConfidence = result[0].confidence || 0;
        
        // Check alternatives for higher confidence
        for (let j = 0; j < result.length; j++) {
          const confidence = result[j].confidence || 0;
          if (confidence > bestConfidence) {
            bestTranscript = result[j].transcript;
            bestConfidence = confidence;
          }
        }
        
        if (result.isFinal) {
          // Apply intelligent text formatting
          finalTranscript += formatSpeechText(bestTranscript);
        } else {
          interimTranscript += bestTranscript;
        }
      }
      
      recognizedText = finalTranscript;
      
      // Show live transcription with confidence indicator
      const statusEl = document.getElementById('voiceStatus');
      if (statusEl && (finalTranscript || interimTranscript)) {
        statusEl.innerHTML = `<div style="font-size: 14px; margin-top: 10px; padding: 10px; background: var(--bg-secondary); border-radius: 6px; text-align: left; line-height: 1.4;">
          <div style="color: var(--text-primary); font-weight: 500;">${finalTranscript}</div>
          <div style="color: var(--text-secondary); font-style: italic;">${interimTranscript}</div>
        </div>`;
      }
      
      // Extend timeout for longer speech
      clearTimeout(speechTimeout);
      speechTimeout = setTimeout(() => {
        if (isListening) {
          stopSpeechRecognition();
        }
      }, 2000); // Reduced to 2 seconds for better responsiveness
    };
    
    speechRecognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      
      if (event.error === 'not-allowed') {
        showToast('Microphone access denied. Please allow microphone access and try again.', 'error');
      } else if (event.error === 'no-speech') {
        showToast('No speech detected. Please speak clearly and try again.', 'error');
      } else {
        showToast('Speech recognition error: ' + event.error, 'error');
      }
      
      stopSpeechRecognition();
    };
    
    speechRecognition.onend = () => {
      isListening = false;
      clearInterval(recordingTimer);
      clearTimeout(speechTimeout);
      
      const statusEl = document.getElementById('voiceStatus');
      const circleEl = document.getElementById('voiceVisualizer').querySelector('.voice-circle');
      
      // Filter out very short or low-quality results
      const minLength = 3;
      const filteredText = recognizedText && recognizedText.trim().length >= minLength ? recognizedText : '';
      
      if (statusEl) {
        if (filteredText) {
          statusEl.innerHTML = `<div style="color: var(--success-color); font-weight: 500;">✓ Speech converted to text - Adding to note...</div>`;
        } else {
          statusEl.textContent = 'No clear speech detected. Please try again.';
        }
      }
      if (circleEl) circleEl.classList.remove('recording');
      
      // Add recognized text to note if quality is sufficient
      if (filteredText && currentNote) {
        addSpeechToNote(filteredText);
        
        // Auto-close modal after successful conversion
        setTimeout(() => {
          const modal = document.getElementById('voiceRecordingModal');
          if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('open');
          }
          resetVoiceRecording();
        }, 1000);
      } else {
        // Keep modal open for retry if no good speech detected
        setTimeout(() => {
          if (statusEl) statusEl.textContent = 'Tap to start speech recognition';
          resetVoiceRecording();
        }, 2000);
      }
    };
  } else {
    showToast('Speech recognition not supported in this browser', 'error');
  }
}

// Intelligent text formatting for speech recognition
function formatSpeechText(text) {
  if (!text) return '';
  
  // Remove extra spaces and normalize
  let formatted = text.trim().replace(/\s+/g, ' ');
  
  // Convert common spoken punctuation to actual punctuation
  const punctuationMap = {
    ' period': '.',
    ' comma': ',',
    ' question mark': '?',
    ' exclamation mark': '!',
    ' exclamation point': '!',
    ' colon': ':',
    ' semicolon': ';',
    ' dash': ' - ',
    ' hyphen': '-',
    ' new line': '\n',
    ' new paragraph': '\n\n',
    ' quote': '"',
    ' unquote': '"',
    ' open parenthesis': ' (',
    ' close parenthesis': ')',
    ' open bracket': ' [',
    ' close bracket': ']'
  };
  
  // Apply punctuation replacements
  for (const [spoken, symbol] of Object.entries(punctuationMap)) {
    const regex = new RegExp(spoken, 'gi');
    formatted = formatted.replace(regex, symbol);
  }
  
  // Capitalize first letter of sentences
  formatted = formatted.replace(/(^|[.!?]\s+)([a-z])/g, (match, p1, p2) => {
    return p1 + p2.toUpperCase();
  });
  
  // Capitalize first letter if text doesn't start with punctuation
  if (formatted.length > 0 && /^[a-z]/.test(formatted)) {
    formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }
  
  // Add period at end if no punctuation exists
  if (formatted.length > 0 && !/[.!?]$/.test(formatted)) {
    formatted += '.';
  }
  
  return formatted;
}

function addSpeechToNote(text) {
  if (!currentNote || !text.trim()) return;
  
  const contentTextarea = document.getElementById('contentTextarea');
  if (contentTextarea) {
    const currentContent = contentTextarea.value;
    const formattedText = formatSpeechText(text);
    const newContent = currentContent ? `${currentContent}\n${formattedText}` : formattedText;
    
    contentTextarea.value = newContent;
    currentNote.content = newContent;
    currentNote.lastModified = Date.now();
    
    saveCurrentNote();
    showToast('Speech converted to text and added to note', 'success');
  }
}

function stopSpeechRecognition() {
  if (speechRecognition && isListening) {
    speechRecognition.stop();
  }
}

function resetVoiceRecording() {
  const statusEl = document.getElementById('voiceStatus');
  const durationEl = document.getElementById('voiceDuration');
  const circleEl = document.getElementById('voiceVisualizer').querySelector('.voice-circle');
  const actionsEl = document.getElementById('voiceActions');
  const recordBtn = document.getElementById('voiceRecordBtn');
  const stopBtn = document.getElementById('voiceStopBtn');
  const playBtn = document.getElementById('voicePlayBtn');
  
  if (statusEl) statusEl.textContent = 'Tap to start speech recognition';
  
  // Reset speech recognition variables
  isListening = false;
  recognizedText = '';
  speechRecognition = null;
  if (durationEl) durationEl.textContent = '00:00';
  if (circleEl) circleEl.classList.remove('recording');
  if (actionsEl) actionsEl.classList.add('hidden');
  if (recordBtn) recordBtn.classList.remove('hidden');
  if (stopBtn) stopBtn.classList.add('hidden');
  if (playBtn) playBtn.classList.add('hidden');
  
  recordedChunks = [];
  voiceRecording = null;
}

// Declare speech recognition variables if not already declared
if (typeof speechRecognition === 'undefined') {
  var speechRecognition = null;
  var isListening = false;
  var speechTimeout = null;
  var recognizedText = '';
}

async function toggleVoiceRecording() {
  // Show the voice recording modal
  const modal = document.getElementById('voiceRecordingModal');
  
  if (modal && !isListening) {
    modal.style.display = 'flex';
    modal.classList.add('open');
    
    // Reset the modal state
    const statusEl = document.getElementById('voiceStatus');
    if (statusEl) {
      statusEl.textContent = 'Listening for speech...';
    }
    
    // Start speech recognition
    startSpeechRecognition();
  } else if (isListening) {
    stopSpeechRecognition();
  }
}

function startSpeechRecognition() {
  console.log('startSpeechRecognition called');
  console.log('speechRecognition:', speechRecognition);
  console.log('isListening:', isListening);
  
  if (speechRecognition && !isListening) {
    console.log('Starting speech recognition...');
    recognizedText = '';
    
    try {
      speechRecognition.start();
      
      const recordBtn = document.getElementById('voiceRecordBtn');
      const stopBtn = document.getElementById('voiceStopBtn');
      
      if (recordBtn) recordBtn.classList.add('hidden');
      if (stopBtn) stopBtn.classList.remove('hidden');
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      showToast('Failed to start speech recognition. Please try again.', 'error');
    }
  } else if (!speechRecognition) {
    console.log('Speech recognition not initialized, calling initializeSpeechRecognition');
    initializeSpeechRecognition();
    setTimeout(() => {
      if (speechRecognition) {
        startSpeechRecognition();
      }
    }, 100);
  }
}

async function startVoiceRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    recordedChunks = [];
    
    const statusEl = document.getElementById('voiceStatus');
    const circleEl = document.getElementById('voiceVisualizer').querySelector('.voice-circle');
    const recordBtn = document.getElementById('voiceRecordBtn');
    const stopBtn = document.getElementById('voiceStopBtn');
    
    if (statusEl) statusEl.textContent = 'Recording...';
    if (circleEl) circleEl.classList.add('recording');
    if (recordBtn) recordBtn.classList.add('hidden');
    if (stopBtn) stopBtn.classList.remove('hidden');
    
    recordingStartTime = Date.now();
    recordingTimer = setInterval(updateRecordingDuration, 100);
    
    mediaRecorder.ondataavailable = (event) => {
      console.log('Data available:', event.data.size, 'bytes');
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = () => {
      console.log('Recording stopped, creating blob...');
      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      voiceRecording = blob;
      console.log('Voice recording blob created:', voiceRecording.size, 'bytes');
      
      const statusEl = document.getElementById('voiceStatus');
      const circleEl = document.getElementById('voiceVisualizer').querySelector('.voice-circle');
      const actionsEl = document.getElementById('voiceActions');
      const stopBtn = document.getElementById('voiceStopBtn');
      const playBtn = document.getElementById('voicePlayBtn');
      
      if (statusEl) statusEl.textContent = 'Recording complete - Click "Add to Note" to save';
      if (circleEl) circleEl.classList.remove('recording');
      if (actionsEl) {
        actionsEl.classList.remove('hidden');
        console.log('Voice actions buttons shown');
      } else {
        console.log('Voice actions element not found');
      }
      if (stopBtn) stopBtn.classList.add('hidden');
      if (playBtn) playBtn.classList.remove('hidden');
      
      clearInterval(recordingTimer);
      stream.getTracks().forEach(track => track.stop());
      
      // Auto-save the voice note immediately after blob is created
      console.log('Auto-saving voice note...');
      saveVoiceRecording();
    };
    
    console.log('Starting MediaRecorder...');
    mediaRecorder.start();
    console.log('MediaRecorder started');
  } catch (error) {
    console.error('Error starting voice recording:', error);
    showToast('Could not access microphone', 'error');
  }
}

function stopVoiceRecording() {
  if (isListening) {
    stopSpeechRecognition();
  }
  
  // Always close modal when stop is called
  const modal = document.getElementById('voiceRecordingModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('open');
  }
  
  resetVoiceRecording();
}

function updateRecordingDuration() {
  if (recordingStartTime) {
    const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    const durationEl = document.getElementById('voiceDuration');
    if (durationEl) {
      durationEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }
}

function playVoiceRecording() {
  if (voiceRecording) {
    const audio = new Audio(URL.createObjectURL(voiceRecording));
    audio.play();
  }
}

function discardVoiceRecording() {
  const modal = document.getElementById('voiceRecordingModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('open');
  }
  resetVoiceRecording();
}

function saveVoiceRecording() {
  if (!voiceRecording || !currentNote) {
    showToast('No recording to save', 'error');
    return;
  }
  
  // Convert blob to base64 for storage
  const reader = new FileReader();
  reader.onload = () => {
    const voiceNote = {
      id: generateId(),
      data: reader.result,
      duration: document.getElementById('voiceDuration').textContent || '0:00',
      timestamp: Date.now()
    };
    
    if (!currentNote.voiceNotes) {
      currentNote.voiceNotes = [];
    }
    
    currentNote.voiceNotes.push(voiceNote);
    currentNote.lastModified = Date.now();
    
    updateEditorContent();
    saveCurrentNote();
    
    const modal = document.getElementById('voiceRecordingModal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('open');
    }
    
    showToast('Voice note added successfully', 'success');
    resetVoiceRecording();
  };
  
  reader.readAsDataURL(voiceRecording);
}

function updateVoiceNotesSection() {
  const voiceSection = document.getElementById("voiceSection");
  if (!voiceSection) return;
  
  if (!currentNote || !currentNote.voiceNotes || currentNote.voiceNotes.length === 0) {
    voiceSection.classList.add("hidden");
    return;
  }
  
  voiceSection.classList.remove("hidden");
  const voiceContainer = document.getElementById("voiceContainer");
  if (!voiceContainer) return;
  
  voiceContainer.innerHTML = currentNote.voiceNotes
    .map((voiceNote, index) => `
      <div class="voice-note-item">
        <div class="voice-note-header">
          <i class="fas fa-microphone"></i>
          <span class="voice-note-duration">${voiceNote.duration || '0:00'}</span>
          <span class="voice-note-date">${formatDate(voiceNote.timestamp)}</span>
          <button class="delete-voice-btn" onclick="deleteVoiceNote(${index})" title="Delete voice note">
            <i class="fas fa-trash-alt"></i>
          </button>
        </div>
        <audio controls src="${voiceNote.data}"></audio>
      </div>
    `).join("");
}

function deleteVoiceNote(index) {
  if (!currentNote || !currentNote.voiceNotes || index < 0 || index >= currentNote.voiceNotes.length) return;
  
  currentNote.voiceNotes.splice(index, 1);
  currentNote.lastModified = Date.now();
  
  updateVoiceNotesSection();
  saveCurrentNote();
  showToast('Voice note deleted', 'success');
}

// Test function for voice modal
function testVoiceModal() {
  console.log('Test voice modal called');
  const modal = document.getElementById('voiceRecordingModal');
  if (modal) {
    modal.classList.add('open');
    console.log('Test modal opened successfully');
  } else {
    console.error('Modal not found');
  }
}

// Connection status monitoring
function updateConnectionStatus() {
  // Remove the connection status indicator completely for cleaner UI
  const existing = document.getElementById('connectionStatus');
  if (existing) existing.remove();
}

// Enhanced error handling with retry
async function withRetry(operation, context = 'operation') {
  for (let attempt = 0; attempt <= maxRetryAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.error(`${context} failed (attempt ${attempt + 1}):`, error);
      
      if (attempt === maxRetryAttempts) {
        showToast(`${context} failed after ${maxRetryAttempts + 1} attempts`, "error");
        throw error;
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}

// Input validation
function validateNoteData(note) {
  if (!note || typeof note !== 'object') return false;
  if (note.title && typeof note.title !== 'string') return false;
  if (note.content && typeof note.content !== 'string') return false;
  if (note.categories && !Array.isArray(note.categories)) return false;
  if (note.images && !Array.isArray(note.images)) return false;
  return true;
}

// Data validation and repair function
function validateAndRepairData() {
  try {
    // Validate notes array
    if (!Array.isArray(notes)) {
      console.warn("Notes array corrupted, attempting repair");
      const backupNotes = localStorage.getItem('backup_notes');
      notes = backupNotes ? JSON.parse(backupNotes) : [];
    }
    
    // Validate and repair individual notes
    notes = notes.filter(note => {
      if (!validateNoteData(note)) {
        console.warn("Removing invalid note:", note);
        return false;
      }
      
      // Ensure required fields exist
      if (!note.id) note.id = generateId();
      if (!note.title) note.title = "Untitled Note";
      if (!note.content) note.content = "";
      if (!note.categories) note.categories = [];
      if (!note.images) note.images = [];
      if (!note.createdAt) note.createdAt = Date.now();
      if (!note.updatedAt) note.updatedAt = Date.now();
      
      return true;
    });
    
    // Validate categories
    if (!Array.isArray(categories)) {
      categories = [{ id: "all", name: "All" }];
    }
    
    // Save repaired data
    localStorage.setItem("notes", JSON.stringify(notes));
    localStorage.setItem("categories", JSON.stringify(categories));
    
  } catch (error) {
    console.error("Data validation failed:", error);
  }
}

// Enhanced auto-save with error recovery
function robustAutoSave() {
  const maxRetries = 3;
  let retryCount = 0;
  
  function attemptSave() {
    try {
      if (currentNote && !isReceivingUpdate) {
        saveCurrentNote();
        retryCount = 0; // Reset on success
      }
    } catch (error) {
      console.error(`Auto-save failed (attempt ${retryCount + 1}):`, error);
      retryCount++;
      
      if (retryCount < maxRetries) {
        setTimeout(attemptSave, 1000 * retryCount); // Exponential backoff
      } else {
        showToast("Auto-save failed. Please save manually.", "warning");
        retryCount = 0;
      }
    }
  }
  
  attemptSave();
}

// Initialize connection monitoring
document.addEventListener('DOMContentLoaded', () => {
  updateConnectionStatus();
  
  // Initial data validation
  validateAndRepairData();
  
  // Monitor Firebase connection
  if (window.database) {
    const connectedRef = window.database.ref('.info/connected');
    connectedRef.on('value', (snapshot) => {
      if (snapshot.val() === true) {
        connectionStatus = 'firebase-connected';
      } else {
        connectionStatus = 'firebase-disconnected';
      }
      updateConnectionStatus();
    });
  }
  
  // Set up periodic data validation
  setInterval(validateAndRepairData, 300000); // Every 5 minutes
});

// Swipe functionality for mobile note management
function setupSwipeToReveal() {
  const noteContainers = document.querySelectorAll('.note-card-container');
  
  noteContainers.forEach(container => {
    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    let hasRevealed = false;
    
    const noteCard = container.querySelector('.note-card');
    const actions = container.querySelector('.note-card-swipe-actions');
    
    // Touch events
    container.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      isDragging = true;
      noteCard.style.transition = 'none';
      noteCard.classList.add('swiping');
    });
    
    container.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      
      currentX = e.touches[0].clientX;
      const deltaX = currentX - startX;
      
      // Allow both left swipe (negative) and right swipe back (positive)
      if (deltaX < 0) {
        // Left swipe - reveal actions
        const translateX = Math.max(deltaX, -180);
        noteCard.style.transform = `translateX(${translateX}px)`;
        
        if (Math.abs(translateX) > 70) {
          actions.style.opacity = '1';
          actions.style.transform = 'translateX(0)';
          actions.classList.add('revealed');
          hasRevealed = true;
        } else {
          actions.style.opacity = '0';
          actions.style.transform = 'translateX(12px)';
          actions.classList.remove('revealed');
          hasRevealed = false;
        }
      } else if (deltaX > 0 && hasRevealed) {
        // Right swipe - close actions
        const translateX = Math.max(-180 + deltaX, -180);
        noteCard.style.transform = `translateX(${translateX}px)`;
        
        if (translateX > -90) {
          actions.style.opacity = '0';
          actions.style.transform = 'translateX(12px)';
          actions.classList.remove('revealed');
          hasRevealed = false;
        }
      }
    });
    
    container.addEventListener('touchend', () => {
      isDragging = false;
      noteCard.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      noteCard.classList.remove('swiping');
      
      if (hasRevealed) {
        // Keep actions visible
        noteCard.style.transform = 'translateX(-180px)';
        actions.style.opacity = '1';
        actions.style.transform = 'translateX(0)';
        actions.classList.add('revealed');
      } else {
        // Snap back
        noteCard.style.transform = 'translateX(0)';
        actions.style.opacity = '0';
        actions.style.transform = 'translateX(12px)';
        actions.classList.remove('revealed');
      }
    });
    
    // Click outside to close or tap to close
    container.addEventListener('click', (e) => {
      if (hasRevealed && !e.target.closest('.note-card-swipe-actions')) {
        noteCard.style.transform = 'translateX(0)';
        actions.style.opacity = '0';
        actions.style.transform = 'translateX(12px)';
        actions.classList.remove('revealed');
        hasRevealed = false;
      }
    });
    
    // Close when clicking on note card while revealed
    noteCard.addEventListener('click', (e) => {
      if (hasRevealed) {
        e.stopPropagation();
        noteCard.style.transform = 'translateX(0)';
        actions.style.opacity = '0';
        actions.style.transform = 'translateX(12px)';
        actions.classList.remove('revealed');
        hasRevealed = false;
      }
    });
  });
}

// Note management functions
function duplicateNote(noteId) {
  const originalNote = notes.find(n => n.id === noteId);
  if (!originalNote) return;
  
  const duplicatedNote = {
    ...originalNote,
    id: generateId(),
    title: `${originalNote.title} (Copy)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isShared: false,
    sharedId: null,
    collaborators: null
  };
  
  notes.unshift(duplicatedNote);
  localStorage.setItem("notes", JSON.stringify(notes));
  
  if (window.authFunctions && typeof window.authFunctions.saveUserData === 'function') {
    window.authFunctions.saveUserData();
  }
  
  showToast("Note duplicated successfully", "success");
  renderNotes();
}

function shareNote(noteId) {
  const note = notes.find(n => n.id === noteId);
  if (!note) return;
  
  currentNote = note;
  showShareModal();
}

function editNoteCategories(noteId) {
  const note = notes.find(n => n.id === noteId);
  if (!note) return;
  
  currentNote = note;
  showCategoryModal();
}

// Recipes functionality
let recipes = [];
let currentRecipe = null;
let isEditingRecipe = false;

// Load recipes from Firebase/localStorage
function loadRecipes() {
  try {
    // Load from localStorage first
    const localRecipes = localStorage.getItem("globalRecipes");
    if (localRecipes) {
      recipes = JSON.parse(localRecipes);
    }
    
    // Load from Firebase if available
    if (window.database) {
      window.database.ref('sharedNotes/global_recipes').once('value')
        .then((snapshot) => {
          const data = snapshot.val();
          if (data && data.recipes) {
            recipes = data.recipes;
            localStorage.setItem("globalRecipes", JSON.stringify(recipes));
            renderRecipes();
          }
        })
        .catch((error) => {
          console.error("Error loading recipes from Firebase:", error);
        });
    }
  } catch (error) {
    console.error("Error loading recipes:", error);
    recipes = [];
  }
}

// Save recipes to Firebase and localStorage
function saveRecipes() {
  try {
    // Save to localStorage
    localStorage.setItem("globalRecipes", JSON.stringify(recipes));
    
    // Save to Firebase if available
    if (window.database) {
      const recipeData = {
        recipes: recipes,
        lastUpdated: Date.now()
      };
      
      window.database.ref('sharedNotes/global_recipes').set(recipeData)
        .then(() => {
          console.log("Recipes saved to Firebase successfully");
        })
        .catch((error) => {
          console.error("Error saving recipes to Firebase:", error);
        });
    }
  } catch (error) {
    console.error("Error saving recipes:", error);
  }
}

// Show recipes page
function showRecipesPage() {
  loadRecipes();
  
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  const recipesPage = document.getElementById("recipesPage");
  if (recipesPage) recipesPage.classList.add("active");
  
  const headerTitle = document.getElementById("headerTitle");
  if (headerTitle) headerTitle.textContent = "RECIPES";
  
  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.classList.add("hidden");
  
  const fab = document.getElementById("addNoteBtn");
  if (fab) fab.classList.add("hidden");
  
  renderRecipes();
}

// Render recipes list
function renderRecipes() {
  const recipesList = document.getElementById("recipesList");
  if (!recipesList) return;
  
  if (!recipes || recipes.length === 0) {
    recipesList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-utensils"></i>
        <h3>No recipes yet</h3>
        <p>Tap the + button to add your first recipe</p>
      </div>
    `;
    return;
  }
  
  recipesList.innerHTML = recipes.map(recipe => `
    <div class="recipe-card" onclick="viewRecipe('${recipe.id}')">
      <h3 class="recipe-card-title">${escapeHtml(recipe.title)}</h3>
      <p class="recipe-card-description">${escapeHtml(recipe.description || '')}</p>
      <div class="recipe-card-meta">
        <span class="recipe-card-ingredients">
          <i class="fas fa-list"></i>
          ${recipe.ingredients ? recipe.ingredients.length : 0} ingredients
        </span>
        <span class="recipe-card-steps">
          <i class="fas fa-clock"></i>
          ${recipe.method ? recipe.method.length : 0} steps
        </span>
      </div>
    </div>
  `).join('');
}

// Create new recipe
function createNewRecipe() {
  currentRecipe = {
    id: generateId(),
    title: '',
    description: '',
    ingredients: [''],
    method: [''],
    images: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  isEditingRecipe = false;
  showRecipeEditor();
}

// View recipe
function viewRecipe(recipeId) {
  const recipe = recipes.find(r => r.id === recipeId);
  if (!recipe) return;
  
  currentRecipe = recipe;
  showRecipeViewer();
}

// Edit current recipe
function editCurrentRecipe() {
  if (!currentRecipe) return;
  isEditingRecipe = true;
  showRecipeEditor();
}

// Show recipe editor
function showRecipeEditor() {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  const recipeEditorPage = document.getElementById("recipeEditorPage");
  if (recipeEditorPage) recipeEditorPage.classList.add("active");
  
  const headerTitle = document.getElementById("headerTitle");
  if (headerTitle) headerTitle.textContent = isEditingRecipe ? "EDIT RECIPE" : "NEW RECIPE";
  
  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.classList.remove("hidden");
  
  const fab = document.getElementById("addNoteBtn");
  if (fab) fab.classList.add("hidden");
  
  populateRecipeEditor();
}

// Show recipe viewer
function showRecipeViewer() {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  const recipeViewerPage = document.getElementById("recipeViewerPage");
  if (recipeViewerPage) recipeViewerPage.classList.add("active");
  
  const headerTitle = document.getElementById("headerTitle");
  if (headerTitle) headerTitle.textContent = "RECIPE";
  
  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.classList.remove("hidden");
  
  const fab = document.getElementById("addNoteBtn");
  if (fab) fab.classList.add("hidden");
  
  populateRecipeViewer();
  setupRecipeViewerSwipe();
}

// Populate recipe editor with current recipe data
function populateRecipeEditor() {
  if (!currentRecipe) return;
  
  const titleInput = document.getElementById("recipeTitleInput");
  const descriptionInput = document.getElementById("recipeDescriptionInput");
  
  if (titleInput) titleInput.value = currentRecipe.title || '';
  if (descriptionInput) descriptionInput.value = currentRecipe.description || '';
  
  renderRecipeIngredients();
  renderRecipeMethod();
  renderRecipeImages();
}

// Populate recipe viewer with current recipe data
function populateRecipeViewer() {
  if (!currentRecipe) return;
  
  const titleEl = document.getElementById("recipeViewerTitle");
  const descriptionEl = document.getElementById("recipeViewerDescription");
  const ingredientsEl = document.getElementById("recipeViewerIngredients");
  const methodEl = document.getElementById("recipeViewerMethod");
  const imagesEl = document.getElementById("recipeViewerImages");
  const imagesSection = document.getElementById("recipeViewerImagesSection");
  
  if (titleEl) titleEl.textContent = currentRecipe.title || 'Untitled Recipe';
  if (descriptionEl) {
    if (currentRecipe.description) {
      descriptionEl.textContent = currentRecipe.description;
      descriptionEl.style.display = 'block';
    } else {
      descriptionEl.style.display = 'none';
    }
  }
  
  if (ingredientsEl) {
    ingredientsEl.innerHTML = (currentRecipe.ingredients || [])
      .filter(ingredient => ingredient.trim())
      .map(ingredient => `
        <div class="recipe-viewer-ingredient">${escapeHtml(ingredient)}</div>
      `).join('');
  }
  
  if (methodEl) {
    methodEl.innerHTML = (currentRecipe.method || [])
      .filter(step => step.trim())
      .map((step, index) => `
        <div class="recipe-viewer-step">
          <div class="recipe-viewer-step-number">${index + 1}</div>
          <div class="recipe-viewer-step-text">${escapeHtml(step)}</div>
        </div>
      `).join('');
  }
  
  // Handle images
  if (imagesEl && imagesSection) {
    if (currentRecipe.images && currentRecipe.images.length > 0) {
      imagesSection.style.display = 'block';
      imagesEl.innerHTML = currentRecipe.images.map((image, index) => `
        <div class="recipe-image-item">
          <img src="${image.data}" alt="Recipe photo ${index + 1}" onclick="openImageViewer('${image.data}', ${index})">
        </div>
      `).join('');
    } else {
      imagesSection.style.display = 'none';
    }
  }
}

// Render recipe ingredients in editor
function renderRecipeIngredients() {
  const ingredientsList = document.getElementById("ingredientsList");
  if (!ingredientsList || !currentRecipe) return;
  
  ingredientsList.innerHTML = currentRecipe.ingredients.map((ingredient, index) => `
    <div class="ingredient-item">
      <div class="ingredient-number">${index + 1}</div>
      <input type="text" class="ingredient-input" value="${escapeHtml(ingredient)}" 
             onchange="updateRecipeIngredient(${index}, this.value)" 
             placeholder="Enter ingredient...">
      <button class="ingredient-delete" onclick="deleteRecipeIngredient(${index})" 
              ${currentRecipe.ingredients.length <= 1 ? 'style="display:none"' : ''}>
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `).join('');
}

// Render recipe method in editor
function renderRecipeMethod() {
  const methodSteps = document.getElementById("methodSteps");
  if (!methodSteps || !currentRecipe) return;
  
  methodSteps.innerHTML = currentRecipe.method.map((step, index) => `
    <div class="method-step">
      <div class="step-number">${index + 1}</div>
      <input type="text" class="step-input" value="${escapeHtml(step)}" 
             onchange="updateRecipeStep(${index}, this.value)" 
             placeholder="Enter step...">
      <button class="step-delete" onclick="deleteRecipeStep(${index})" 
              ${currentRecipe.method.length <= 1 ? 'style="display:none"' : ''}>
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `).join('');
}

// Add recipe ingredient
function addRecipeIngredient() {
  if (!currentRecipe) return;
  currentRecipe.ingredients.push('');
  renderRecipeIngredients();
}

// Add recipe step
function addRecipeStep() {
  if (!currentRecipe) return;
  currentRecipe.method.push('');
  renderRecipeMethod();
}

// Update recipe ingredient
function updateRecipeIngredient(index, value) {
  if (!currentRecipe || !currentRecipe.ingredients) return;
  currentRecipe.ingredients[index] = value;
}

// Update recipe step
function updateRecipeStep(index, value) {
  if (!currentRecipe || !currentRecipe.method) return;
  currentRecipe.method[index] = value;
}

// Delete recipe ingredient
function deleteRecipeIngredient(index) {
  if (!currentRecipe || !currentRecipe.ingredients || currentRecipe.ingredients.length <= 1) return;
  currentRecipe.ingredients.splice(index, 1);
  renderRecipeIngredients();
}

// Delete recipe step
function deleteRecipeStep(index) {
  if (!currentRecipe || !currentRecipe.method || currentRecipe.method.length <= 1) return;
  currentRecipe.method.splice(index, 1);
  renderRecipeMethod();
}

// Save recipe
function saveRecipe() {
  if (!currentRecipe) return;
  
  const titleInput = document.getElementById("recipeTitleInput");
  const descriptionInput = document.getElementById("recipeDescriptionInput");
  
  if (titleInput) currentRecipe.title = titleInput.value.trim();
  if (descriptionInput) currentRecipe.description = descriptionInput.value.trim();
  
  if (!currentRecipe.title) {
    showToast("Please enter a recipe title", "error");
    return;
  }
  
  // Filter out empty ingredients and steps
  currentRecipe.ingredients = currentRecipe.ingredients.filter(ingredient => ingredient.trim());
  currentRecipe.method = currentRecipe.method.filter(step => step.trim());
  
  if (currentRecipe.ingredients.length === 0) {
    showToast("Please add at least one ingredient", "error");
    return;
  }
  
  if (currentRecipe.method.length === 0) {
    showToast("Please add at least one step", "error");
    return;
  }
  
  currentRecipe.updatedAt = Date.now();
  
  if (isEditingRecipe) {
    const index = recipes.findIndex(r => r.id === currentRecipe.id);
    if (index !== -1) {
      recipes[index] = currentRecipe;
    }
  } else {
    recipes.unshift(currentRecipe);
  }
  
  saveRecipes();
  showToast(isEditingRecipe ? "Recipe updated successfully" : "Recipe saved successfully", "success");
  showRecipesPage();
}

// Cancel recipe editing
function cancelRecipeEditing() {
  showRecipesPage();
}

// Setup swipe gestures for recipe viewer
function setupRecipeViewerSwipe() {
  const recipeViewer = document.getElementById("recipeViewerPage");
  if (!recipeViewer) return;
  
  let startX = 0;
  let startY = 0;
  let threshold = 50;
  
  recipeViewer.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  });
  
  recipeViewer.addEventListener('touchend', (e) => {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    
    // Check if it's a horizontal swipe (more horizontal than vertical)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > threshold) {
      if (deltaX > 0) {
        // Right swipe - enter edit mode
        editCurrentRecipe();
      }
    }
  });
  
  // Add visual hint for swipe functionality
  const swipeHint = document.createElement('div');
  swipeHint.className = 'swipe-hint';
  swipeHint.innerHTML = '<i class="fas fa-arrow-right"></i> Swipe right to edit';
  swipeHint.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--primary-color);
    color: white;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 12px;
    opacity: 0.8;
    animation: fadeInOut 3s ease-in-out;
    z-index: 1000;
  `;
  
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeInOut {
      0%, 100% { opacity: 0; }
      50% { opacity: 0.8; }
    }
  `;
  document.head.appendChild(style);
  
  recipeViewer.appendChild(swipeHint);
  
  // Remove hint after animation
  setTimeout(() => {
    if (swipeHint.parentNode) {
      swipeHint.parentNode.removeChild(swipeHint);
    }
  }, 3000);
}

// Render recipe images in editor
function renderRecipeImages() {
  const recipeImages = document.getElementById("recipeImages");
  if (!recipeImages || !currentRecipe) return;
  
  if (!currentRecipe.images) currentRecipe.images = [];
  
  recipeImages.innerHTML = currentRecipe.images.map((image, index) => `
    <div class="recipe-image-item">
      <img src="${image.data}" alt="Recipe photo ${index + 1}">
      <button class="recipe-image-delete" onclick="deleteRecipeImage(${index})">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join('');
}

// Process recipe image upload
function processRecipeImageUpload(event) {
  const files = event.target.files;
  if (!files || files.length === 0 || !currentRecipe) return;
  
  Array.from(files).forEach(file => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageData = {
          id: generateId(),
          data: e.target.result,
          name: file.name,
          size: file.size,
          timestamp: Date.now()
        };
        
        if (!currentRecipe.images) currentRecipe.images = [];
        currentRecipe.images.push(imageData);
        renderRecipeImages();
      };
      reader.readAsDataURL(file);
    }
  });
  
  // Clear the input
  event.target.value = '';
}

// Delete recipe image
function deleteRecipeImage(index) {
  if (!currentRecipe || !currentRecipe.images) return;
  currentRecipe.images.splice(index, 1);
  renderRecipeImages();
}

// Initialize recipes when app loads
document.addEventListener('DOMContentLoaded', () => {
  loadRecipes();
});

// Export for window global
window.renderNotes = renderNotes;
window.renderCategories = renderCategories;
window.testVoiceModal = testVoiceModal;
window.validateAndRepairData = validateAndRepairData;
window.duplicateNote = duplicateNote;
window.shareNote = shareNote;
window.editNoteCategories = editNoteCategories;
window.showRecipesPage = showRecipesPage;
window.renderRecipes = renderRecipes;
window.viewRecipe = viewRecipe;
window.updateRecipeIngredient = updateRecipeIngredient;
window.updateRecipeStep = updateRecipeStep;
window.deleteRecipeIngredient = deleteRecipeIngredient;
window.deleteRecipeStep = deleteRecipeStep;
window.deleteRecipeImage = deleteRecipeImage;