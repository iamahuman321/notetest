// Notes App JavaScript

// Global variables
let notes = []
let categories = [{ id: "all", name: "All" }]
let currentNote = null
let isEditing = false
let currentPage = "notes"
let searchQuery = ""
let selectedCategories = []
let currentUser = null
let isGuest = false
let dataLoaded = false

// Initialize the app
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Initializing Notes App...")
  
  // Wait for Firebase and CategoryManager to be ready
  await waitForDependencies()
  
  // Initialize CategoryManager
  if (window.CategoryManager) {
    await window.CategoryManager.init()
    categories = window.CategoryManager.getCategories()
  }
  
  // Load data
  await loadInitialData()
  
  // Set up event listeners
  setupEventListeners()
  
  // Handle URL parameters
  handleURLParameters()
  
  // Render initial UI
  renderNotes()
  renderCategories()
  updateFilterChips()
  
  console.log("App initialized successfully")
})

async function waitForDependencies() {
  return new Promise((resolve) => {
    const checkDependencies = () => {
      if (window.firebase && window.CategoryManager) {
        resolve()
      } else {
        setTimeout(checkDependencies, 100)
      }
    }
    checkDependencies()
  })
}

async function loadInitialData() {
  // Load notes from localStorage first for immediate UI
  const localNotes = localStorage.getItem("notes")
  if (localNotes) {
    notes = JSON.parse(localNotes)
  }
  
  // Firebase will sync in the background via firebase-config.js
}

function handleURLParameters() {
  const urlParams = new URLSearchParams(window.location.search)
  const hash = window.location.hash.substring(1)
  
  // Handle note opening
  const noteId = urlParams.get('note')
  if (noteId) {
    const note = notes.find(n => n.id === noteId)
    if (note) {
      openNoteEditor(note)
    }
  }
  
  // Handle page navigation
  if (hash === 'shopping') {
    showShoppingPage()
  } else if (hash === 'recipes') {
    showRecipesPage()
  } else if (hash === 'settings') {
    showSettingsPage()
  }
}

// Enhanced event listeners setup
function setupEventListeners() {
  // Basic event listeners
  setupBasicEventListeners()
  setupModalEventListeners()
}

function setupModalEventListeners() {
  // Close modals on overlay click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('open')
      }
    })
  })
}

// Enhanced navigation functions
function showNotesPage() {
  currentPage = "notes"
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"))
  document.getElementById("notesPage").classList.add("active")
  document.getElementById("headerTitle").textContent = "NOTES"
  renderNotes()
}

function showShoppingPage() {
  currentPage = "shopping"
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"))
  document.getElementById("shoppingPage").classList.add("active")
  document.getElementById("headerTitle").textContent = "SHOPPING"
}

function showRecipesPage() {
  currentPage = "recipes"
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"))
  document.getElementById("recipesPage").classList.add("active")
  document.getElementById("headerTitle").textContent = "RECIPES"
  renderRecipes()
}

function showSettingsPage() {
  currentPage = "settings"
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"))
  document.getElementById("settingsPage").classList.add("active")
  document.getElementById("headerTitle").textContent = "SETTINGS"
}

// Recipe management functions
function renderRecipes() {
  const recipesList = document.getElementById("recipesList")
  if (!recipesList) return

  // Load recipes from localStorage
  const recipes = JSON.parse(localStorage.getItem("globalRecipes")) || []

  if (recipes.length === 0) {
    recipesList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-utensils"></i>
        <h3>No recipes yet</h3>
        <p>Start building your recipe collection</p>
      </div>
    `
    return
  }

  recipesList.innerHTML = recipes.map(recipe => `
    <div class="recipe-card" onclick="openRecipeViewer('${recipe.id}')">
      <div class="recipe-image">
        ${recipe.images && recipe.images.length > 0 
          ? `<img src="${recipe.images[0]}" alt="${escapeHtml(recipe.title)}" />`
          : `<div class="recipe-placeholder"><i class="fas fa-utensils"></i></div>`
        }
      </div>
      <div class="recipe-info">
        <h4>${escapeHtml(recipe.title)}</h4>
        <p>${escapeHtml(recipe.description || 'No description')}</p>
      </div>
    </div>
  `).join('')
}

function openRecipeViewer(recipeId) {
  const recipes = JSON.parse(localStorage.getItem("globalRecipes")) || []
  const recipe = recipes.find(r => r.id === recipeId)
  if (!recipe) return

  // Show recipe viewer page
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"))
  document.getElementById("recipeViewerPage").classList.add("active")
  document.getElementById("headerTitle").textContent = recipe.title.toUpperCase()
  
  // Populate viewer
  document.getElementById("recipeViewerTitle").textContent = recipe.title
  document.getElementById("recipeViewerDescription").textContent = recipe.description || ''
  
  // Render ingredients
  const ingredientsContainer = document.getElementById("recipeViewerIngredients")
  if (recipe.ingredients && recipe.ingredients.length > 0) {
    ingredientsContainer.innerHTML = `
      <ul class="ingredients-list">
        ${recipe.ingredients.map(ingredient => `
          <li>${escapeHtml(ingredient)}</li>
        `).join('')}
      </ul>
    `
  } else {
    ingredientsContainer.innerHTML = '<p>No ingredients listed</p>'
  }
  
  // Render method
  const methodContainer = document.getElementById("recipeViewerMethod")
  if (recipe.method && recipe.method.length > 0) {
    methodContainer.innerHTML = `
      <ol class="method-list">
        ${recipe.method.map(step => `
          <li>${escapeHtml(step)}</li>
        `).join('')}
      </ol>
    `
  } else {
    methodContainer.innerHTML = '<p>No method steps listed</p>'
  }
  
  // Render images
  const imagesContainer = document.getElementById("recipeViewerImages")
  const imagesSection = document.getElementById("recipeViewerImagesSection")
  if (recipe.images && recipe.images.length > 0) {
    imagesSection.style.display = 'block'
    imagesContainer.innerHTML = recipe.images.map(image => `
      <img src="${image}" alt="Recipe image" onclick="openImageViewer('${image}')" />
    `).join('')
  } else {
    imagesSection.style.display = 'none'
  }
}

function openRecipeEditor(recipe = null) {
  // Show recipe editor page
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"))
  document.getElementById("recipeEditorPage").classList.add("active")
  document.getElementById("headerTitle").textContent = recipe ? "EDIT RECIPE" : "NEW RECIPE"
  
  // Populate editor
  if (recipe) {
    document.getElementById("recipeTitleInput").value = recipe.title || ''
    document.getElementById("recipeDescriptionInput").value = recipe.description || ''
    
    // Populate ingredients
    const ingredientsList = document.getElementById("ingredientsList")
    ingredientsList.innerHTML = ''
    if (recipe.ingredients) {
      recipe.ingredients.forEach(ingredient => addIngredientItem(ingredient))
    }
    
    // Populate method steps
    const methodSteps = document.getElementById("methodSteps")
    methodSteps.innerHTML = ''
    if (recipe.method) {
      recipe.method.forEach(step => addMethodStep(step))
    }
    
    // Populate images
    renderRecipeImages(recipe.images || [])
  } else {
    // Clear editor for new recipe
    document.getElementById("recipeTitleInput").value = ''
    document.getElementById("recipeDescriptionInput").value = ''
    document.getElementById("ingredientsList").innerHTML = ''
    document.getElementById("methodSteps").innerHTML = ''
    renderRecipeImages([])
  }
}

function addIngredientItem(text = '') {
  const ingredientsList = document.getElementById("ingredientsList")
  const item = document.createElement('div')
  item.className = 'ingredient-item'
  item.innerHTML = `
    <input type="text" class="ingredient-input" value="${escapeHtml(text)}" placeholder="Enter ingredient..." />
    <button type="button" class="btn-icon remove-ingredient" onclick="removeIngredient(this)">
      <i class="fas fa-times"></i>
    </button>
  `
  ingredientsList.appendChild(item)
}

function addMethodStep(text = '') {
  const methodSteps = document.getElementById("methodSteps")
  const stepNumber = methodSteps.children.length + 1
  const step = document.createElement('div')
  step.className = 'method-step'
  step.innerHTML = `
    <span class="step-number">${stepNumber}</span>
    <input type="text" class="step-input" value="${escapeHtml(text)}" placeholder="Describe this step..." />
    <button type="button" class="btn-icon remove-step" onclick="removeMethodStep(this)">
      <i class="fas fa-times"></i>
    </button>
  `
  methodSteps.appendChild(step)
}

function removeIngredient(button) {
  button.parentElement.remove()
}

function removeMethodStep(button) {
  const methodSteps = document.getElementById("methodSteps")
  button.parentElement.remove()
  
  // Renumber steps
  Array.from(methodSteps.children).forEach((step, index) => {
    step.querySelector('.step-number').textContent = index + 1
  })
}

function renderRecipeImages(images) {
  const imagesContainer = document.getElementById("recipeImages")
  imagesContainer.innerHTML = images.map((image, index) => `
    <div class="recipe-image-item">
      <img src="${image}" alt="Recipe image" />
      <button class="remove-image" onclick="removeRecipeImage(${index})">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join('')
}

function removeRecipeImage(index) {
  // Implementation for removing recipe images
}

async function saveRecipe() {
  const title = document.getElementById("recipeTitleInput").value.trim()
  const description = document.getElementById("recipeDescriptionInput").value.trim()
  
  if (!title) {
    showToast("Please enter a recipe title", "error")
    return
  }
  
  // Collect ingredients
  const ingredients = Array.from(document.querySelectorAll('.ingredient-input'))
    .map(input => input.value.trim())
    .filter(ingredient => ingredient)
  
  // Collect method steps
  const method = Array.from(document.querySelectorAll('.step-input'))
    .map(input => input.value.trim())
    .filter(step => step)
  
  const recipeData = {
    id: generateId(),
    title,
    description,
    ingredients,
    method,
    images: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  
  try {
    // Save to global recipes
    const recipes = JSON.parse(localStorage.getItem("globalRecipes")) || []
    recipes.push(recipeData)
    localStorage.setItem('globalRecipes', JSON.stringify(recipes))
    
    showRecipesPage()
    showToast("Recipe saved successfully!", "success")
    
  } catch (error) {
    console.error('Error saving recipe:', error)
    showToast('Error saving recipe', 'error')
  }
}

// Utility functions
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function showToast(message, type = 'default') {
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.textContent = message
  
  document.body.appendChild(toast)
  
  setTimeout(() => toast.classList.add('show'), 100)
  
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => document.body.removeChild(toast), 300)
  }, 3000)
}

// Global functions for inline event handlers
window.openRecipeViewer = openRecipeViewer
window.removeIngredient = removeIngredient
window.removeMethodStep = removeMethodStep
window.removeRecipeImage = removeRecipeImage

// Theme management
function initializeTheme() {
  const savedTheme = localStorage.getItem('theme')
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  const theme = savedTheme || systemTheme
  
  document.documentElement.setAttribute('data-theme', theme)
  
  // Update theme selector if it exists
  const themeSelect = document.getElementById('themeSelect')
  if (themeSelect) {
    themeSelect.value = savedTheme || 'system'
  }
}

function setTheme(theme) {
  if (theme === 'system') {
    localStorage.removeItem('theme')
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', systemTheme)
  } else {
    localStorage.setItem('theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
  }
}

// Initialize theme on load
document.addEventListener('DOMContentLoaded', initializeTheme)

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (!localStorage.getItem('theme')) {
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light')
  }
})

// Basic event listeners (placeholder for existing functionality)
function setupBasicEventListeners() {
  // Navigation
  const navRecipes = document.getElementById("navRecipes")
  if (navRecipes) {
    navRecipes.addEventListener("click", (e) => {
      e.preventDefault()
      showRecipesPage()
    })
  }
  
  // Recipe page buttons
  const addRecipeBtn = document.getElementById("addRecipeBtn")
  const editRecipeBtn = document.getElementById("editRecipeBtn")
  const saveRecipeBtn = document.getElementById("saveRecipeBtn")
  const cancelRecipeBtn = document.getElementById("cancelRecipeBtn")
  
  if (addRecipeBtn) addRecipeBtn.addEventListener("click", () => openRecipeEditor())
  if (editRecipeBtn) editRecipeBtn.addEventListener("click", () => openRecipeEditor())
  if (saveRecipeBtn) saveRecipeBtn.addEventListener("click", saveRecipe)
  if (cancelRecipeBtn) cancelRecipeBtn.addEventListener("click", showRecipesPage)
  
  // Recipe editor buttons
  const addIngredientBtn = document.getElementById("addIngredientBtn")
  const addStepBtn = document.getElementById("addStepBtn")
  
  if (addIngredientBtn) addIngredientBtn.addEventListener("click", () => addIngredientItem())
  if (addStepBtn) addStepBtn.addEventListener("click", () => addMethodStep())
  
  // Theme selector
  const themeSelect = document.getElementById('themeSelect')
  if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
      setTheme(e.target.value)
    })
  }
}

// Placeholder functions for existing functionality
function renderNotes() {
  // Existing notes rendering logic
}

function renderCategories() {
  // Existing categories rendering logic
}

function updateFilterChips() {
  // Existing filter chips logic
}

function openNoteEditor(note) {
  // Existing note editor logic
}