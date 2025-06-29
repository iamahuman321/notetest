// Unified Category Management System
window.CategoryManager = {
  // Internal storage
  _categories: [{ id: "all", name: "All" }],
  _initialized: false,
  _authReady: false,
  
  // Initialize the category manager
  async init() {
    if (this._initialized) return;
    
    // Load from localStorage immediately for fast UI
    const localCategories = this._loadFromLocalStorage();
    if (localCategories && localCategories.length > 1) {
      this._categories = localCategories;
    }
    
    this._initialized = true;
    console.log("CategoryManager initialized with", this._categories.length, "categories");
    
    // Set up Firebase listener for future updates
    this._setupFirebaseListener();
  },
  
  // Set up Firebase authentication listener
  _setupFirebaseListener() {
    const checkAndSetupAuth = () => {
      if (window.auth && window.authFunctions && window.database) {
        window.auth.onAuthStateChanged((user) => {
          if (user && !window.authFunctions.isUserGuest()) {
            // User is authenticated, refresh from Firebase when data loads
            setTimeout(() => {
              this.refreshFromFirebase();
            }, 1000);
          }
        });
      } else {
        setTimeout(checkAndSetupAuth, 500);
      }
    };
    
    checkAndSetupAuth();
  },
  
  // Wait for authentication to be ready
  async _waitForAuth() {
    return new Promise((resolve) => {
      const maxWait = 10000; // 10 seconds max wait
      const startTime = Date.now();
      
      const checkAuth = () => {
        if (Date.now() - startTime > maxWait) {
          console.log("CategoryManager: Auth wait timeout, proceeding with local data");
          this._authReady = true;
          resolve();
          return;
        }
        
        if (window.auth && window.authFunctions && window.database) {
          // Listen for auth state changes
          const unsubscribe = window.auth.onAuthStateChanged((user) => {
            this._authReady = true;
            unsubscribe(); // Remove the listener
            resolve();
          });
        } else {
          setTimeout(checkAuth, 200);
        }
      };
      
      checkAuth();
    });
  },
  
  // Load categories from the best available source
  async _loadFromBestSource() {
    const sources = [
      this._loadFromFirebase,
      this._loadFromLocalStorage,
      this._loadFromSessionStorage
    ];
    
    let bestCategories = [{ id: "all", name: "All" }];
    let maxLength = 1;
    
    for (const loadFn of sources) {
      try {
        const cats = await loadFn.call(this);
        if (cats && Array.isArray(cats) && cats.length > maxLength) {
          bestCategories = cats;
          maxLength = cats.length;
        }
      } catch (error) {
        console.warn("Failed to load from source:", error);
      }
    }
    
    this._categories = bestCategories;
    return bestCategories;
  },
  
  // Load from Firebase
  async _loadFromFirebase() {
    if (!window.database || !window.authFunctions) {
      console.log("Firebase or authFunctions not available");
      return null;
    }
    
    const currentUser = window.authFunctions.getCurrentUser();
    const isGuest = window.authFunctions.isUserGuest();
    
    if (!currentUser || isGuest) {
      console.log("No authenticated user or user is guest");
      return null;
    }
    
    try {
      console.log("Loading categories from Firebase for user:", currentUser.uid);
      const snapshot = await window.database.ref(`users/${currentUser.uid}`).once('value');
      const userData = snapshot.val();
      
      if (userData?.categories) {
        console.log("Categories loaded from Firebase:", userData.categories.length);
        return userData.categories;
      } else {
        console.log("No categories found in Firebase");
        return null;
      }
    } catch (error) {
      console.error("Error loading from Firebase:", error);
      return null;
    }
  },
  
  // Load from localStorage
  _loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem("categories");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  },
  
  // Load from sessionStorage
  _loadFromSessionStorage() {
    try {
      const stored = sessionStorage.getItem("categoriesBackup");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  },
  
  // Get all categories
  getCategories() {
    return [...this._categories];
  },
  
  // Refresh categories from Firebase (called after user data loads)
  async refreshFromFirebase() {
    try {
      const firebaseCategories = await this._loadFromFirebase();
      if (firebaseCategories && firebaseCategories.length >= 1) {
        // Only update if Firebase has more categories than local
        if (firebaseCategories.length > this._categories.length) {
          this._categories = firebaseCategories;
          console.log("Categories refreshed from Firebase:", this._categories.length);
          
          // Update local storage immediately
          localStorage.setItem("categories", JSON.stringify(this._categories));
          sessionStorage.setItem("categoriesBackup", JSON.stringify(this._categories));
          
          // Update global categories variable
          if (window.categories) {
            window.categories.length = 0;
            window.categories.push(...this._categories);
          }
          
          // Trigger UI updates
          if (typeof window.renderCategories === 'function') {
            window.renderCategories();
          }
          if (typeof window.updateFilterChips === 'function') {
            window.updateFilterChips();
          }
        } else {
          console.log("Local categories are more recent, preserving them");
          // Save local categories to Firebase
          await this._saveToFirebase();
        }
      }
    } catch (error) {
      console.error("Error refreshing categories from Firebase:", error);
    }
  },
  
  // Update categories with new data (public method)
  updateCategories(newCategories) {
    if (Array.isArray(newCategories) && newCategories.length > 0) {
      this._categories = newCategories;
      localStorage.setItem("categories", JSON.stringify(this._categories));
      sessionStorage.setItem("categoriesBackup", JSON.stringify(this._categories));
    }
  },
  
  // Add a new category
  async addCategory(name) {
    if (!name || this._categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      console.log("Category already exists or name is empty");
      return false;
    }
    
    const newCategory = {
      id: this._generateId(),
      name: name.trim(),
      createdAt: Date.now()
    };
    
    this._categories.push(newCategory);
    console.log("Category added to internal storage, total categories:", this._categories.length);
    console.log("Categories:", this._categories.map(c => c.name));
    
    await this._saveToAllSources();
    return true;
  },
  
  // Delete a category
  async deleteCategory(categoryId) {
    if (categoryId === "all") return false;
    
    this._categories = this._categories.filter(c => c.id !== categoryId);
    await this._saveToAllSources();
    return true;
  },
  
  // Save to all storage sources
  async _saveToAllSources() {
    const categoriesJson = JSON.stringify(this._categories);
    const timestamp = Date.now();
    
    // Save to localStorage
    localStorage.setItem("categories", categoriesJson);
    localStorage.setItem("categoriesLastModified", timestamp.toString());
    
    // Save to sessionStorage
    sessionStorage.setItem("categoriesBackup", categoriesJson);
    
    // Update global variables
    if (window.categories) {
      window.categories.length = 0;
      window.categories.push(...this._categories);
    }
    
    // Save to Firebase
    await this._saveToFirebase();
  },
  
  // Save to Firebase
  async _saveToFirebase() {
    if (!window.database || !window.authFunctions) {
      console.log("Firebase or authFunctions not available for saving");
      return;
    }
    
    const currentUser = window.authFunctions.getCurrentUser();
    const isGuest = window.authFunctions.isUserGuest();
    
    if (!currentUser || isGuest) {
      console.log("No authenticated user or user is guest - cannot save to Firebase");
      return;
    }
    
    try {
      console.log("Saving categories to Firebase:", this._categories.length, "categories");
      console.log("Categories being saved:", this._categories.map(c => c.name));
      
      // Save categories and trigger a complete user data update
      await window.database.ref(`users/${currentUser.uid}`).update({
        categories: this._categories,
        categoriesLastModified: Date.now(),
        lastUpdated: Date.now()
      });
      
      console.log("Categories saved to Firebase successfully");
      
      // Force immediate localStorage update
      localStorage.setItem("categories", JSON.stringify(this._categories));
      sessionStorage.setItem("categoriesBackup", JSON.stringify(this._categories));
      
      // Verify the save by reading it back
      setTimeout(async () => {
        try {
          const snapshot = await window.database.ref(`users/${currentUser.uid}/categories`).once('value');
          const savedCategories = snapshot.val();
          console.log("Verification: Categories in Firebase after save:", savedCategories?.length || 0);
        } catch (error) {
          console.error("Error verifying Firebase save:", error);
        }
      }, 500);
      
    } catch (error) {
      console.error("Error saving categories to Firebase:", error);
    }
  },
  
  // Generate unique ID
  _generateId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }
};