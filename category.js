// Categories page JavaScript for category.html

// Global variables
let categories = [{ id: "all", name: "All" }]
let notes = []

// Initialize the page
async function initializePage() {
  console.log("Initializing category page...")
  
  // Load notes from localStorage
  notes = JSON.parse(localStorage.getItem("notes")) || []
  console.log("Loaded notes:", notes.length)
  
  // Wait for CategoryManager to be available
  if (window.CategoryManager) {
    try {
      await window.CategoryManager.init()
      categories = window.CategoryManager.getCategories()
      renderCategories()
      console.log("Categories loaded via CategoryManager:", categories.length)
    } catch (error) {
      console.error("Error initializing CategoryManager:", error)
      // Fallback to localStorage
      categories = JSON.parse(localStorage.getItem("categories")) || [{ id: "all", name: "All" }]
      renderCategories()
    }
  } else {
    // Retry if CategoryManager not ready
    setTimeout(initializePage, 100)
  }
}

// Start initialization when page loads
document.addEventListener("DOMContentLoaded", () => {
  initializePage()
  setupEventListeners()
})

// Translations
const translations = {
  en: {
    noCategories: "You don't have any categories yet",
    categoryAdded: "Category added",
    categoryDeleted: "Category deleted",
    noNotes: "No notes in this category",
    categoryExists: "Category already exists"
  }
}

let currentLanguage = localStorage.getItem("language") || "en"

function t(key) {
  return translations[currentLanguage]?.[key] || translations.en[key] || key
}

function showToast(message) {
  const toast = document.getElementById("toast")
  const toastMessage = document.getElementById("toastMessage")
  
  if (!toast || !toastMessage) return
  
  toastMessage.textContent = message
  toast.classList.add("open")
  setTimeout(() => {
    toast.classList.remove("open")
  }, 3000)
}

function openNoteEditor(noteId) {
  // Redirect to main page with note ID to open editor
  window.location.href = `index.html?note=${noteId}`
}

function renderCategories() {
  const categoriesList = document.getElementById("categoriesList")
  
  if (!categoriesList) return

  const userCategories = categories.filter((c) => c.id !== "all")

  console.log("Rendering categories:", userCategories.length)
  console.log("Total notes available:", notes.length)

  if (userCategories.length === 0) {
    categoriesList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-folder"></i>
        <p>${t("noCategories")}</p>
      </div>
    `
  } else {
    categoriesList.innerHTML = userCategories
      .map((category) => {
        // Find notes in this category
        const notesInCategory = notes.filter(
          (note) => Array.isArray(note.categories) && note.categories.includes(category.id),
        )

        console.log(`Category ${category.name} has ${notesInCategory.length} notes`)
        console.log(`Notes in category:`, notesInCategory.map(n => ({ id: n.id, title: n.title })))

        // Render notes list or empty message
        const notesHtml =
          notesInCategory.length === 0
            ? `<div class="empty-state"><p>${t("noNotes")}</p></div>`
            : `<ul class="notes-list">${notesInCategory.map((note) => `<li class="note-item" onclick="openNoteEditor('${note.id}')">${escapeHtml(note.title || "Untitled")}</li>`).join("")}</ul>`

        return `
          <div class="category-item">
            <div class="category-header" onclick="toggleCategoryNotes(this)">
              <span class="category-name">${escapeHtml(category.name)}</span>
              <span class="note-count">(${notesInCategory.length})</span>
              <button class="category-delete" onclick="event.stopPropagation(); deleteCategoryItem('${category.id}')" title="Delete category">
                <i class="fas fa-times"></i>
              </button>
              <span class="toggle-icon">▼</span>
            </div>
            <div class="category-notes" style="display:none;">
              ${notesHtml}
            </div>
          </div>
        `
      })
      .join("")
  }
}

function escapeHtml(text) {
  const div = document.createElement("div")
  div.textContent = text
  return div.innerHTML
}

function toggleCategoryNotes(headerElement) {
  const categoryItem = headerElement.parentElement
  const categoryNotes = categoryItem.querySelector(".category-notes")
  const toggleIcon = headerElement.querySelector(".toggle-icon")
  
  if (categoryNotes.style.display === "none" || categoryNotes.style.display === "") {
    categoryNotes.style.display = "block"
    toggleIcon.textContent = "▲"
    console.log("Expanded category notes")
  } else {
    categoryNotes.style.display = "none"
    toggleIcon.textContent = "▼"
    console.log("Collapsed category notes")
  }
}

async function addCategory() {
  const input = document.getElementById("categoryInput")
  const name = input.value.trim()
  
  if (!name) return
  
  // Check if category already exists
  if (categories.some(cat => cat.name.toLowerCase() === name.toLowerCase())) {
    showToast(t("categoryExists"))
    return
  }
  
  try {
    if (window.CategoryManager) {
      await window.CategoryManager.addCategory(name)
      categories = window.CategoryManager.getCategories()
    } else {
      // Fallback: add directly to local categories
      const newCategory = {
        id: generateId(),
        name: name
      }
      categories.push(newCategory)
      localStorage.setItem("categories", JSON.stringify(categories))
    }
    
    input.value = ""
    renderCategories()
    showToast(t("categoryAdded"))
  } catch (error) {
    console.error("Error adding category:", error)
    showToast("Error adding category")
  }
}

async function deleteCategoryItem(categoryId) {
  if (!confirm("Delete this category? Notes will not be deleted.")) return
  
  try {
    if (window.CategoryManager) {
      await window.CategoryManager.deleteCategory(categoryId)
      categories = window.CategoryManager.getCategories()
    } else {
      // Fallback: remove from local categories
      categories = categories.filter(cat => cat.id !== categoryId)
      localStorage.setItem("categories", JSON.stringify(categories))
    }
    
    renderCategories()
    showToast(t("categoryDeleted"))
  } catch (error) {
    console.error("Error deleting category:", error)
    showToast("Error deleting category")
  }
}

function generateId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

function setupHamburgerMenu() {
  const hamburgerBtn = document.getElementById("hamburgerBtn")
  const sidebar = document.getElementById("sidebar")
  const sidebarClose = document.getElementById("sidebarClose")
  const sidebarOverlay = document.getElementById("sidebarOverlay")

  if (hamburgerBtn) hamburgerBtn.addEventListener("click", toggleSidebar)
  if (sidebarClose) sidebarClose.addEventListener("click", closeSidebar)
  if (sidebarOverlay) sidebarOverlay.addEventListener("click", closeSidebar)
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar")
  const overlay = document.getElementById("sidebarOverlay")
  
  if (sidebar && overlay) {
    sidebar.classList.toggle("open")
    overlay.classList.toggle("active")
  }
}

function closeSidebar() {
  const sidebar = document.getElementById("sidebar")
  const overlay = document.getElementById("sidebarOverlay")
  
  if (sidebar && overlay) {
    sidebar.classList.remove("open")
    overlay.classList.remove("active")
  }
}

function setupEventListeners() {
  const addBtn = document.getElementById("addCategoryFormBtn")
  const input = document.getElementById("categoryInput")
  
  if (addBtn) {
    addBtn.addEventListener("click", addCategory)
  }
  
  if (input) {
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        addCategory()
      }
    })
  }
  
  setupHamburgerMenu()
}

// Global functions for inline event handlers
window.toggleCategoryNotes = toggleCategoryNotes
window.deleteCategoryItem = deleteCategoryItem
window.openNoteEditor = openNoteEditor