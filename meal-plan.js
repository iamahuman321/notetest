// Meal Plan Management
let recipes = [];
let currentMealPlan = null;
let selectedMeals = {};
let currentUser = null;

// Initialize page when DOM is loaded
document.addEventListener('DOMContentLoaded', initializePage);

async function initializePage() {
    console.log('Initializing Meal Plan page');
    
    // Wait for Firebase to be ready
    await waitForFirebase();
    
    // Set up event listeners
    setupEventListeners();
    
    // Load data
    await loadRecipes();
    await loadCurrentMealPlan();
    
    // Set up real-time sync
    setupRealtimeSync();
    
    // Render initial UI
    renderMealPlanPage();
    updateSidebarAuth();
}

function waitForFirebase() {
    return new Promise((resolve) => {
        if (window.firebase && window.firebase.apps.length > 0) {
            resolve();
        } else {
            const checkFirebase = setInterval(() => {
                if (window.firebase && window.firebase.apps.length > 0) {
                    clearInterval(checkFirebase);
                    resolve();
                }
            }, 100);
        }
    });
}

function setupEventListeners() {
    // Sidebar
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const sidebarClose = document.getElementById('sidebarClose');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const navShopping = document.getElementById('navShopping');
    const navRecipes = document.getElementById('navRecipes');
    const navSettings = document.getElementById('navSettings');
    const navSignIn = document.getElementById('navSignIn');

    if (hamburgerBtn) hamburgerBtn.addEventListener('click', toggleSidebar);
    if (sidebarClose) sidebarClose.addEventListener('click', closeSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
    
    // Navigation
    if (navShopping) navShopping.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'index.html#shopping';
    });
    if (navRecipes) navRecipes.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'index.html#recipes';
    });
    if (navSettings) navSettings.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'index.html#settings';
    });
    if (navSignIn) navSignIn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'login.html';
    });

    // Recipe filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            filterRecipes(e.target.dataset.filter);
        });
    });

    // Planning actions
    const submitPlanBtn = document.getElementById('submitPlanBtn');
    const approveBtn = document.getElementById('approveBtn');
    const rejectBtn = document.getElementById('rejectBtn');
    const newPlanBtn = document.getElementById('newPlanBtn');
    const startPlanningBtn = document.getElementById('startPlanningBtn');

    if (submitPlanBtn) submitPlanBtn.addEventListener('click', submitMealPlan);
    if (approveBtn) approveBtn.addEventListener('click', approveMealPlan);
    if (rejectBtn) rejectBtn.addEventListener('click', rejectMealPlan);
    if (newPlanBtn) newPlanBtn.addEventListener('click', startNewPlan);
    if (startPlanningBtn) startPlanningBtn.addEventListener('click', startPlanning);

    // Recipe category modal
    const closeCategoryModal = document.getElementById('closeCategoryModal');
    if (closeCategoryModal) closeCategoryModal.addEventListener('click', hideCategoryModal);

    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const category = e.currentTarget.dataset.category;
            selectRecipeCategory(category);
        });
    });

    // Auth state listener
    if (window.auth) {
        window.auth.onAuthStateChanged((user) => {
            currentUser = user;
            updateSidebarAuth();
        });
    }
}

// Sidebar functions
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar && overlay) {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar && overlay) {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
    }
}

function updateSidebarAuth() {
    const navSignIn = document.getElementById('navSignIn');
    
    if (currentUser && !window.authFunctions?.isUserGuest()) {
        if (navSignIn) navSignIn.style.display = 'none';
    } else {
        if (navSignIn) navSignIn.style.display = 'block';
    }
}

// Data loading functions
async function loadRecipes() {
    try {
        // Load from localStorage first
        const localRecipes = localStorage.getItem('globalRecipes');
        if (localRecipes) {
            recipes = JSON.parse(localRecipes);
        }

        // Sync with Firebase
        try {
            const database = window.firebase.database();
            const recipesRef = database.ref('sharedNotes/global_recipes');
            
            const snapshot = await recipesRef.once('value');
            if (snapshot.exists()) {
                const firebaseRecipes = snapshot.val();
                const loadedRecipes = Object.keys(firebaseRecipes).map(key => ({
                    id: key,
                    ...firebaseRecipes[key]
                }));
                
                recipes = loadedRecipes;
                localStorage.setItem('globalRecipes', JSON.stringify(recipes));
                console.log('Recipes synced from Firebase:', recipes.length);
            }
        } catch (firebaseError) {
            console.log('Firebase sync unavailable, using local data:', recipes.length);
        }
    } catch (error) {
        console.error('Error loading recipes:', error);
    }
}

async function loadCurrentMealPlan() {
    try {
        const weekId = getCurrentWeekId();
        
        // Load from localStorage first
        const localPlan = localStorage.getItem(`mealPlan_${weekId}`);
        if (localPlan) {
            currentMealPlan = JSON.parse(localPlan);
        }

        // Sync with Firebase
        try {
            const database = window.firebase.database();
            const planRef = database.ref(`mealPlans/${weekId}`);
            
            const snapshot = await planRef.once('value');
            if (snapshot.exists()) {
                currentMealPlan = snapshot.val();
                localStorage.setItem(`mealPlan_${weekId}`, JSON.stringify(currentMealPlan));
                console.log('Meal plan synced from Firebase');
            }
        } catch (firebaseError) {
            console.log('Firebase sync unavailable, using local data');
        }
    } catch (error) {
        console.error('Error loading meal plan:', error);
    }
}

// Rendering functions
function renderMealPlanPage() {
    if (!currentMealPlan) {
        showEmptyState();
    } else if (currentMealPlan.status === 'planning') {
        showPlanningPhase();
    } else if (currentMealPlan.status === 'voting') {
        showVotingPhase();
    } else if (currentMealPlan.status === 'finalized') {
        showFinalPlan();
    }
    
    renderRecipes();
}

function showEmptyState() {
    document.getElementById('emptyMealPlan').classList.remove('hidden');
    document.getElementById('planningPhase').classList.add('hidden');
    document.getElementById('votingPhase').classList.add('hidden');
    document.getElementById('finalPlan').classList.add('hidden');
}

function showPlanningPhase() {
    document.getElementById('emptyMealPlan').classList.add('hidden');
    document.getElementById('planningPhase').classList.remove('hidden');
    document.getElementById('votingPhase').classList.add('hidden');
    document.getElementById('finalPlan').classList.add('hidden');
    
    if (currentMealPlan && currentMealPlan.meals) {
        selectedMeals = { ...currentMealPlan.meals };
        renderSelectedMeals();
        updateMealCounter();
    }
}

function showVotingPhase() {
    document.getElementById('emptyMealPlan').classList.add('hidden');
    document.getElementById('planningPhase').classList.add('hidden');
    document.getElementById('votingPhase').classList.remove('hidden');
    document.getElementById('finalPlan').classList.add('hidden');
    
    renderProposedPlan();
    renderVoteStatus();
}

function showFinalPlan() {
    document.getElementById('emptyMealPlan').classList.add('hidden');
    document.getElementById('planningPhase').classList.add('hidden');
    document.getElementById('votingPhase').classList.add('hidden');
    document.getElementById('finalPlan').classList.remove('hidden');
    
    renderFinalSchedule();
}

function renderRecipes() {
    const recipesGrid = document.getElementById('recipesGrid');
    if (!recipesGrid) return;

    const eligibleRecipes = recipes.filter(recipe => 
        recipe.category && ['healthy', 'unhealthy'].includes(recipe.category)
    );

    if (eligibleRecipes.length === 0) {
        recipesGrid.innerHTML = `
            <div class="no-recipes">
                <i class="fas fa-utensils"></i>
                <p>No categorized recipes yet</p>
                <a href="index.html#recipes" class="btn btn-primary">Add Recipes</a>
            </div>
        `;
        return;
    }

    recipesGrid.innerHTML = eligibleRecipes.map(recipe => `
        <div class="recipe-card ${recipe.category}" onclick="selectRecipe('${recipe.id}')">
            <div class="recipe-image">
                ${recipe.images && recipe.images.length > 0 
                    ? `<img src="${recipe.images[0]}" alt="${escapeHtml(recipe.title)}" />`
                    : `<div class="recipe-placeholder"><i class="fas fa-utensils"></i></div>`
                }
            </div>
            <div class="recipe-info">
                <h4>${escapeHtml(recipe.title)}</h4>
                <div class="recipe-category ${recipe.category}">
                    <i class="fas ${recipe.category === 'healthy' ? 'fa-leaf' : 'fa-hamburger'}"></i>
                    ${recipe.category}
                </div>
            </div>
        </div>
    `).join('');
}

function filterRecipes(filter) {
    const recipeCards = document.querySelectorAll('.recipe-card');
    recipeCards.forEach(card => {
        if (filter === 'all' || card.classList.contains(filter)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

function selectRecipe(recipeId) {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;

    // Check if we can add this recipe
    const currentHealthy = Object.values(selectedMeals).filter(m => m.category === 'healthy').length;
    const currentUnhealthy = Object.values(selectedMeals).filter(m => m.category === 'unhealthy').length;
    
    if (recipe.category === 'unhealthy' && currentUnhealthy >= 2) {
        showToast('Maximum 2 unhealthy meals allowed per week', 'error');
        return;
    }
    
    if (Object.keys(selectedMeals).length >= 5) {
        showToast('Maximum 5 meals per week', 'error');
        return;
    }

    // Show day selection
    showDaySelection(recipe);
}

function showDaySelection(recipe) {
    const availableDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].filter(day => 
        !selectedMeals[day]
    );
    
    if (availableDays.length === 0) {
        showToast('All days are already filled', 'error');
        return;
    }

    // Create a simple selection interface
    const dayOptions = availableDays.map(day => 
        `<button class="day-option" onclick="assignMealToDay('${recipe.id}', '${day}')">${capitalizeFirst(day)}</button>`
    ).join('');
    
    const modal = document.createElement('div');
    modal.className = 'modal open';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Select Day</h3>
                <button class="modal-close" onclick="this.closest('.modal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <p>Which day would you like to have <strong>${escapeHtml(recipe.title)}</strong>?</p>
                <div class="day-options">
                    ${dayOptions}
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function assignMealToDay(recipeId, day) {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;

    selectedMeals[day] = {
        recipeId: recipeId,
        category: recipe.category,
        title: recipe.title
    };

    // Remove the modal
    document.querySelector('.modal.open')?.remove();
    
    renderSelectedMeals();
    updateMealCounter();
    updateSubmitButton();
    
    showToast(`${recipe.title} added to ${capitalizeFirst(day)}`, 'success');
}

function renderSelectedMeals() {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    
    days.forEach(day => {
        const slot = document.getElementById(`${day}Slot`);
        if (!slot) return;

        if (selectedMeals[day]) {
            const meal = selectedMeals[day];
            slot.innerHTML = `
                <div class="selected-meal ${meal.category}">
                    <span class="meal-title">${escapeHtml(meal.title)}</span>
                    <button class="remove-meal" onclick="removeMeal('${day}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            slot.classList.add('filled');
        } else {
            slot.innerHTML = `
                <i class="fas fa-plus"></i>
                <span>Add Meal</span>
            `;
            slot.classList.remove('filled');
        }
    });
}

function removeMeal(day) {
    delete selectedMeals[day];
    renderSelectedMeals();
    updateMealCounter();
    updateSubmitButton();
    showToast(`Meal removed from ${capitalizeFirst(day)}`, 'info');
}

function updateMealCounter() {
    const healthyCount = Object.values(selectedMeals).filter(m => m.category === 'healthy').length;
    const unhealthyCount = Object.values(selectedMeals).filter(m => m.category === 'unhealthy').length;
    
    document.getElementById('healthyCount').textContent = healthyCount;
    document.getElementById('unhealthyCount').textContent = unhealthyCount;
}

function updateSubmitButton() {
    const submitBtn = document.getElementById('submitPlanBtn');
    const mealCount = Object.keys(selectedMeals).length;
    
    if (submitBtn) {
        submitBtn.disabled = mealCount === 0;
    }
}

// Meal plan actions
async function submitMealPlan() {
    if (Object.keys(selectedMeals).length === 0) {
        showToast('Please select at least one meal', 'error');
        return;
    }

    try {
        const weekId = getCurrentWeekId();
        const mealPlan = {
            id: weekId,
            status: 'voting',
            meals: selectedMeals,
            createdBy: currentUser?.uid || 'guest',
            createdByName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Guest',
            createdAt: Date.now(),
            votes: {}
        };

        await saveMealPlan(mealPlan);
        currentMealPlan = mealPlan;
        
        showVotingPhase();
        showToast('Meal plan submitted for family vote!', 'success');
        
    } catch (error) {
        console.error('Error submitting meal plan:', error);
        showToast('Error submitting meal plan', 'error');
    }
}

async function approveMealPlan() {
    if (!currentMealPlan || !currentUser) return;

    try {
        currentMealPlan.votes[currentUser.uid] = {
            vote: 'approve',
            voterName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
            votedAt: Date.now()
        };

        await saveMealPlan(currentMealPlan);
        
        // Check if we have enough votes to finalize
        const approveVotes = Object.values(currentMealPlan.votes).filter(v => v.vote === 'approve').length;
        
        if (approveVotes >= 1) { // For demo, require just 1 vote
            currentMealPlan.status = 'finalized';
            currentMealPlan.finalizedAt = Date.now();
            await saveMealPlan(currentMealPlan);
            showFinalPlan();
            showToast('Meal plan finalized!', 'success');
        } else {
            renderVoteStatus();
            showToast('Vote recorded!', 'success');
        }
        
    } catch (error) {
        console.error('Error voting on meal plan:', error);
        showToast('Error recording vote', 'error');
    }
}

async function rejectMealPlan() {
    if (!currentMealPlan || !currentUser) return;

    try {
        currentMealPlan.votes[currentUser.uid] = {
            vote: 'reject',
            voterName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
            votedAt: Date.now()
        };

        await saveMealPlan(currentMealPlan);
        
        // Reset to planning phase
        currentMealPlan.status = 'planning';
        selectedMeals = { ...currentMealPlan.meals };
        await saveMealPlan(currentMealPlan);
        
        showPlanningPhase();
        showToast('Meal plan sent back for changes', 'info');
        
    } catch (error) {
        console.error('Error rejecting meal plan:', error);
        showToast('Error recording vote', 'error');
    }
}

function startNewPlan() {
    currentMealPlan = null;
    selectedMeals = {};
    localStorage.removeItem(`mealPlan_${getCurrentWeekId()}`);
    showPlanningPhase();
}

function startPlanning() {
    selectedMeals = {};
    showPlanningPhase();
}

// Rendering helper functions
function renderProposedPlan() {
    const proposedPlan = document.getElementById('proposedPlan');
    if (!proposedPlan || !currentMealPlan) return;

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    
    proposedPlan.innerHTML = `
        <div class="proposed-schedule">
            ${days.map(day => {
                const meal = currentMealPlan.meals[day];
                return `
                    <div class="proposed-day">
                        <div class="day-header">${capitalizeFirst(day)}</div>
                        <div class="proposed-meal ${meal ? meal.category : 'empty'}">
                            ${meal 
                                ? `<span class="meal-title">${escapeHtml(meal.title)}</span>`
                                : '<span class="no-meal">No meal planned</span>'
                            }
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderVoteStatus() {
    const voteStatus = document.getElementById('voteStatus');
    if (!voteStatus || !currentMealPlan) return;

    const votes = currentMealPlan.votes || {};
    const approveVotes = Object.values(votes).filter(v => v.vote === 'approve').length;
    const rejectVotes = Object.values(votes).filter(v => v.vote === 'reject').length;
    
    voteStatus.innerHTML = `
        <div class="vote-summary">
            <div class="vote-count approve">
                <i class="fas fa-thumbs-up"></i>
                <span>${approveVotes} Approve</span>
            </div>
            <div class="vote-count reject">
                <i class="fas fa-thumbs-down"></i>
                <span>${rejectVotes} Reject</span>
            </div>
        </div>
        <div class="voters-list">
            ${Object.values(votes).map(vote => `
                <div class="voter ${vote.vote}">
                    <i class="fas fa-${vote.vote === 'approve' ? 'thumbs-up' : 'thumbs-down'}"></i>
                    <span>${vote.voterName}</span>
                </div>
            `).join('')}
        </div>
    `;
}

function renderFinalSchedule() {
    const finalSchedule = document.getElementById('finalSchedule');
    if (!finalSchedule || !currentMealPlan) return;

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    
    finalSchedule.innerHTML = `
        <div class="final-week-schedule">
            ${days.map(day => {
                const meal = currentMealPlan.meals[day];
                return `
                    <div class="final-day" ${meal ? `onclick="openRecipe('${meal.recipeId}')"` : ''}>
                        <div class="day-header">${capitalizeFirst(day)}</div>
                        <div class="final-meal ${meal ? meal.category : 'empty'}">
                            ${meal 
                                ? `
                                    <span class="meal-title">${escapeHtml(meal.title)}</span>
                                    <div class="meal-category ${meal.category}">
                                        <i class="fas ${meal.category === 'healthy' ? 'fa-leaf' : 'fa-hamburger'}"></i>
                                        ${meal.category}
                                    </div>
                                `
                                : '<span class="no-meal">No meal planned</span>'
                            }
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function openRecipe(recipeId) {
    // Navigate to recipe viewer
    localStorage.setItem('openRecipeId', recipeId);
    window.location.href = 'index.html#recipes';
}

// Recipe category modal functions
function showCategoryModal(recipeData) {
    const modal = document.getElementById('recipeCategoryModal');
    if (modal) {
        modal.classList.add('open');
        modal.dataset.recipeData = JSON.stringify(recipeData);
    }
}

function hideCategoryModal() {
    const modal = document.getElementById('recipeCategoryModal');
    if (modal) {
        modal.classList.remove('open');
    }
}

function selectRecipeCategory(category) {
    const modal = document.getElementById('recipeCategoryModal');
    const recipeData = JSON.parse(modal.dataset.recipeData || '{}');
    
    // Add category to recipe data
    recipeData.category = category;
    
    // Save recipe with category
    saveRecipeWithCategory(recipeData);
    
    hideCategoryModal();
}

async function saveRecipeWithCategory(recipeData) {
    try {
        // Add to global recipes
        recipes.push(recipeData);
        
        // Save to Firebase and localStorage
        const database = window.firebase.database();
        const recipesRef = database.ref('sharedNotes/global_recipes');
        
        const recipesData = {};
        recipes.forEach(recipe => {
            recipesData[recipe.id] = recipe;
        });
        
        await recipesRef.set(recipesData);
        localStorage.setItem('globalRecipes', JSON.stringify(recipes));
        
        renderRecipes();
        showToast(`Recipe categorized as ${recipeData.category}`, 'success');
        
    } catch (error) {
        console.error('Error saving recipe:', error);
        showToast('Error saving recipe', 'error');
    }
}

// Data persistence functions
async function saveMealPlan(mealPlan) {
    try {
        const weekId = getCurrentWeekId();
        
        // Save to localStorage
        localStorage.setItem(`mealPlan_${weekId}`, JSON.stringify(mealPlan));
        
        // Save to Firebase
        try {
            const database = window.firebase.database();
            const planRef = database.ref(`mealPlans/${weekId}`);
            await planRef.set(mealPlan);
            console.log('Meal plan synced to Firebase');
        } catch (firebaseError) {
            console.log('Firebase sync unavailable, saved locally');
        }
    } catch (error) {
        console.error('Error saving meal plan:', error);
        throw error;
    }
}

// Real-time sync
function setupRealtimeSync() {
    try {
        const database = window.firebase.database();
        const weekId = getCurrentWeekId();
        
        // Listen for meal plan changes
        const planRef = database.ref(`mealPlans/${weekId}`);
        planRef.on('value', (snapshot) => {
            if (snapshot.exists()) {
                const updatedPlan = snapshot.val();
                if (JSON.stringify(currentMealPlan) !== JSON.stringify(updatedPlan)) {
                    currentMealPlan = updatedPlan;
                    localStorage.setItem(`mealPlan_${weekId}`, JSON.stringify(currentMealPlan));
                    renderMealPlanPage();
                }
            }
        });
        
        console.log('Real-time sync enabled for meal plans');
    } catch (error) {
        console.log('Real-time sync unavailable');
    }
}

// Utility functions
function getCurrentWeekId() {
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 1)); // Monday
    return `week_${startOfWeek.getFullYear()}_${startOfWeek.getMonth()}_${startOfWeek.getDate()}`;
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'default') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
}

// Global functions for inline event handlers
window.selectRecipe = selectRecipe;
window.assignMealToDay = assignMealToDay;
window.removeMeal = removeMeal;
window.openRecipe = openRecipe;
window.selectRecipeCategory = selectRecipeCategory;