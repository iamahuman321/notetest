// Photo Gallery Management
let photos = [];
let groups = [];
let currentGroup = null;
let currentPhotoIndex = 0;

// Initialize page when DOM is loaded
document.addEventListener('DOMContentLoaded', initializePage);

async function initializePage() {
    console.log('Initializing Photo Gallery page');
    
    // Wait for Firebase to be ready
    await waitForFirebase();
    
    // Set up event listeners
    setupEventListeners();
    
    // Load data
    await loadPhotos();
    await loadGroups();
    
    // Set up real-time sync for universal device sync
    setupRealtimeSync();
    
    // Render initial UI
    renderPhotoGallery();
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
    const navSignOut = document.getElementById('navSignOut');

    if (hamburgerBtn) hamburgerBtn.addEventListener('click', toggleSidebar);
    if (sidebarClose) sidebarClose.addEventListener('click', closeSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
    
    // Navigation - redirect to index.html for other pages
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
    if (navSignOut) navSignOut.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.authFunctions) {
            window.authFunctions.signOutUser();
        }
        closeSidebar();
    });

    // Group Gallery buttons
    const addGroupBtn = document.getElementById('addGroupBtn');
    const addFirstGroupBtn = document.getElementById('addFirstGroupBtn');

    if (addGroupBtn) addGroupBtn.addEventListener('click', showGroupModal);
    if (addFirstGroupBtn) addFirstGroupBtn.addEventListener('click', showGroupModal);

    // Photo upload modal
    const photoUploadModal = document.getElementById('photoUploadModal');
    const closePhotoUploadModal = document.getElementById('closePhotoUploadModal');
    const cancelPhotoUpload = document.getElementById('cancelPhotoUpload');
    const confirmPhotoUpload = document.getElementById('confirmPhotoUpload');
    const photoUploadArea = document.getElementById('photoUploadArea');
    const photoFileInput = document.getElementById('photoFileInput');

    if (closePhotoUploadModal) closePhotoUploadModal.addEventListener('click', hidePhotoUploadModal);
    if (cancelPhotoUpload) cancelPhotoUpload.addEventListener('click', hidePhotoUploadModal);
    if (confirmPhotoUpload) confirmPhotoUpload.addEventListener('click', uploadPhotos);
    if (photoUploadArea) {
        photoUploadArea.addEventListener('click', () => photoFileInput.click());
        photoUploadArea.addEventListener('dragover', handleDragOver);
        photoUploadArea.addEventListener('drop', handleDrop);
    }
    if (photoFileInput) photoFileInput.addEventListener('change', handleFileSelect);

    // Group modal
    const groupModal = document.getElementById('groupModal');
    const closeGroupModal = document.getElementById('closeGroupModal');
    const cancelGroup = document.getElementById('cancelGroup');
    const saveGroup = document.getElementById('saveGroup');

    if (closeGroupModal) closeGroupModal.addEventListener('click', hideGroupModal);
    if (cancelGroup) cancelGroup.addEventListener('click', hideGroupModal);
    if (saveGroup) saveGroup.addEventListener('click', createGroup);

    // Photo viewer modal
    const closePhotoViewer = document.getElementById('closePhotoViewer');
    const downloadPhotoBtn = document.getElementById('downloadPhotoBtn');
    const deletePhotoBtn = document.getElementById('deletePhotoBtn');

    if (closePhotoViewer) closePhotoViewer.addEventListener('click', hidePhotoViewer);
    if (downloadPhotoBtn) downloadPhotoBtn.addEventListener('click', downloadCurrentPhoto);
    if (deletePhotoBtn) deletePhotoBtn.addEventListener('click', deleteCurrentPhoto);

    // Group view buttons
    const addPhotosToGroupBtn = document.getElementById('addPhotosToGroupBtn');
    const addFirstPhotoToGroup = document.getElementById('addFirstPhotoToGroup');
    const deleteGroupBtn = document.getElementById('deleteGroupBtn');
    const downloadZipBtn = document.getElementById('downloadZipBtn');

    if (addPhotosToGroupBtn) addPhotosToGroupBtn.addEventListener('click', () => showPhotoUploadModal(currentGroup?.id));
    if (addFirstPhotoToGroup) addFirstPhotoToGroup.addEventListener('click', () => showPhotoUploadModal(currentGroup?.id));
    if (deleteGroupBtn) deleteGroupBtn.addEventListener('click', deleteCurrentGroup);
    if (downloadZipBtn) downloadZipBtn.addEventListener('click', downloadGroupAsZip);

    // Back button functionality
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (currentGroup) {
                // Go back to main gallery from group view
                showGalleryView();
            } else {
                // Go back to main notes app
                window.location.href = 'index.html';
            }
        });
    }

    // Close modals on overlay click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('open');
            }
        });
    });
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
    const navSignOut = document.getElementById('navSignOut');
    
    if (window.authFunctions && window.authFunctions.getCurrentUser()) {
        if (navSignIn) navSignIn.classList.add('hidden');
        if (navSignOut) navSignOut.classList.remove('hidden');
    } else {
        if (navSignIn) navSignIn.classList.remove('hidden');
        if (navSignOut) navSignOut.classList.add('hidden');
    }
}

// Data loading functions
async function loadPhotos() {
    try {
        // Load from localStorage first
        const localPhotos = localStorage.getItem('familyPhotos');
        if (localPhotos) {
            photos = JSON.parse(localPhotos);
        }

        // Always try to sync with Firebase (works for guest users too)
        try {
            const database = window.firebase.database();
            const photosRef = database.ref('sharedNotes/family_photos');
            
            const snapshot = await photosRef.once('value');
            if (snapshot.exists()) {
                const firebasePhotos = snapshot.val();
                const loadedPhotos = Object.keys(firebasePhotos).map(key => ({
                    id: key,
                    ...firebasePhotos[key]
                }));
                
                // Merge local and Firebase photos, prioritizing Firebase data
                const mergedPhotos = [...loadedPhotos];
                photos.forEach(localPhoto => {
                    if (!mergedPhotos.find(p => p.id === localPhoto.id)) {
                        mergedPhotos.push(localPhoto);
                    }
                });
                
                photos = mergedPhotos;
                
                // Save merged data to localStorage
                localStorage.setItem('familyPhotos', JSON.stringify(photos));
                console.log('Photos synced from Firebase:', photos.length);
            }
        } catch (firebaseError) {
            console.log('Firebase sync unavailable, using local data:', photos.length);
        }
    } catch (error) {
        console.error('Error loading photos:', error);
        showToast('Using offline photos', 'info');
    }
}

async function loadGroups() {
    try {
        // Load from localStorage first
        const localGroups = localStorage.getItem('familyGroups');
        if (localGroups) {
            groups = JSON.parse(localGroups);
        }

        // Always try to sync with Firebase (works for guest users too)
        try {
            const database = window.firebase.database();
            const groupsRef = database.ref('sharedNotes/family_groups');
            
            const snapshot = await groupsRef.once('value');
            if (snapshot.exists()) {
                const firebaseGroups = snapshot.val();
                const loadedGroups = Object.keys(firebaseGroups).map(key => ({
                    id: key,
                    ...firebaseGroups[key]
                }));
                
                // Merge local and Firebase groups, prioritizing Firebase data
                const mergedGroups = [...loadedGroups];
                groups.forEach(localGroup => {
                    if (!mergedGroups.find(g => g.id === localGroup.id)) {
                        mergedGroups.push(localGroup);
                    }
                });
                
                groups = mergedGroups;
                
                // Save merged data to localStorage
                localStorage.setItem('familyGroups', JSON.stringify(groups));
                console.log('Groups synced from Firebase:', groups.length);
            }
        } catch (firebaseError) {
            console.log('Firebase sync unavailable, using local data:', groups.length);
        }
    } catch (error) {
        console.error('Error loading groups:', error);
        showToast('Using offline groups', 'info');
    }
}

// Rendering functions
function renderPhotoGallery() {
    renderGroups();
    updateEmptyState();
}

function renderGroups() {
    const groupsGrid = document.getElementById('photoGroupsGrid');
    if (!groupsGrid) return;

    if (groups.length === 0) {
        groupsGrid.style.display = 'none';
        return;
    }

    groupsGrid.style.display = 'grid';
    groupsGrid.innerHTML = groups.map(group => {
        const groupPhotos = photos.filter(photo => photo.groupId === group.id);
        const photoCount = groupPhotos.length;
        
        let coverContent = '';
        if (photoCount === 0) {
            coverContent = '<div class="group-placeholder"><i class="fas fa-images"></i></div>';
        } else if (photoCount === 1) {
            coverContent = `<img src="${groupPhotos[0].data}" alt="${escapeHtml(group.name)}" />`;
        } else {
            const previewPhotos = groupPhotos.slice(0, 4);
            coverContent = `
                <div class="group-photos-preview">
                    ${previewPhotos.map(photo => `<img src="${photo.data}" alt="Photo" />`).join('')}
                </div>
            `;
        }
        
        return `
            <div class="group-card" onclick="openGroup('${group.id}')">
                <div class="group-cover">
                    ${coverContent}
                    ${photoCount > 0 ? `<div class="group-photo-count">${photoCount}</div>` : ''}
                </div>
                <div class="group-info">
                    <h4>${escapeHtml(group.name)}</h4>
                </div>
            </div>
        `;
    }).join('');
}

function updateEmptyState() {
    const emptyState = document.getElementById('photoEmptyState');
    const groupsGrid = document.getElementById('photoGroupsGrid');

    // Always keep empty state hidden - only show Create Group button at top
    if (emptyState) emptyState.style.display = 'none';
    
    if (groups.length === 0) {
        if (groupsGrid) groupsGrid.style.display = 'none';
    } else {
        if (groupsGrid) groupsGrid.style.display = 'grid';
    }
}

// Group functions
function showGroupModal() {
    const modal = document.getElementById('groupModal');
    const nameInput = document.getElementById('groupName');
    
    if (modal) {
        modal.classList.add('open');
        if (nameInput) {
            nameInput.value = '';
            nameInput.focus();
        }
    }
}

function hideGroupModal() {
    const modal = document.getElementById('groupModal');
    if (modal) {
        modal.classList.remove('open');
    }
}

async function createGroup() {
    const nameInput = document.getElementById('groupName');
    const name = nameInput.value.trim();
    
    if (!name) {
        showToast('Please enter a group name', 'error');
        return;
    }

    try {
        const group = {
            id: generateId(),
            name: name,
            dateCreated: new Date().toISOString()
        };

        groups.push(group);
        await saveGroups();
        renderPhotoGallery();
        hideGroupModal();
        showToast('Group created successfully', 'success');

    } catch (error) {
        console.error('Error creating group:', error);
        showToast('Error creating group', 'error');
    }
}

function openGroup(groupId) {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    currentGroup = group;
    const groupPhotos = photos.filter(photo => photo.groupId === groupId);

    // Show group view page
    document.getElementById('photoGalleryPage').classList.remove('active');
    document.getElementById('groupViewPage').classList.add('active');

    // Update group view
    document.getElementById('groupViewTitle').textContent = group.name;

    // Render group photos
    const groupPhotosGrid = document.getElementById('groupPhotosGrid');
    const emptyGroupState = document.getElementById('emptyGroupState');
    
    if (groupPhotos.length === 0) {
        if (groupPhotosGrid) groupPhotosGrid.style.display = 'none';
        if (emptyGroupState) emptyGroupState.style.display = 'block';
    } else {
        if (emptyGroupState) emptyGroupState.style.display = 'none';
        if (groupPhotosGrid) {
            groupPhotosGrid.style.display = 'grid';
            groupPhotosGrid.innerHTML = groupPhotos.map((photo, index) => `
                <div class="photo-item" onclick="openPhotoViewer(${photos.indexOf(photo)})">
                    <img src="${photo.data}" alt="${escapeHtml(photo.title || 'Photo')}" />
                    <div class="photo-overlay">
                        <div class="photo-info">
                            <h4>${escapeHtml(photo.title || 'Untitled')}</h4>
                            <p>${formatDate(photo.dateAdded)}</p>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    }

    // Update header title
    document.getElementById('headerTitle').textContent = group.name.toUpperCase();
}

function showGalleryView() {
    // Return to main gallery view
    document.getElementById('groupViewPage').classList.remove('active');
    document.getElementById('photoGalleryPage').classList.add('active');
    document.getElementById('headerTitle').textContent = 'GALLERY';
    currentGroup = null;
}

async function deleteCurrentGroup() {
    if (currentGroup && confirm('Are you sure you want to delete this group? Photos will not be deleted.')) {
        try {
            groups = groups.filter(g => g.id !== currentGroup.id);
            
            // Remove group reference from photos
            photos.forEach(photo => {
                if (photo.groupId === currentGroup.id) {
                    photo.groupId = null;
                }
            });
            
            await saveGroups();
            await savePhotos();
            
            // Go back to main gallery
            document.getElementById('groupViewPage').classList.remove('active');
            document.getElementById('photoGalleryPage').classList.add('active');
            document.getElementById('headerTitle').textContent = 'PHOTO GALLERY';
            document.getElementById('backBtn').classList.add('hidden');
            
            currentGroup = null;
            renderPhotoGallery();
            showToast('Group deleted successfully', 'success');
            
        } catch (error) {
            console.error('Error deleting group:', error);
            showToast('Error deleting group', 'error');
        }
    }
}

// ZIP download functionality using JSZip library
async function downloadGroupAsZip() {
    if (!currentGroup) return;
    
    const groupPhotos = photos.filter(photo => photo.groupId === currentGroup.id);
    
    if (groupPhotos.length === 0) {
        showToast('No photos in this group to download', 'info');
        return;
    }
    
    try {
        showToast('Preparing ZIP download...', 'info');
        
        // Load JSZip library dynamically
        if (!window.JSZip) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            document.head.appendChild(script);
            
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
            });
        }
        
        const zip = new JSZip();
        
        // Add photos to ZIP
        for (let i = 0; i < groupPhotos.length; i++) {
            const photo = groupPhotos[i];
            try {
                // Convert base64 to binary data
                const base64Data = photo.data.split(',')[1];
                const mimeType = photo.data.split(',')[0].split(':')[1].split(';')[0];
                const extension = mimeType.split('/')[1] || 'jpg';
                
                // Create filename
                const filename = `${photo.title || `photo_${i + 1}`}.${extension}`;
                
                // Add to ZIP
                zip.file(filename, base64Data, { base64: true });
            } catch (error) {
                console.error('Error adding photo to ZIP:', error);
            }
        }
        
        // Generate ZIP file and download
        const zipBlob = await zip.generateAsync({ 
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });
        
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${currentGroup.name}_photos.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
        showToast(`Downloaded ${groupPhotos.length} photos as ZIP file`, 'success');
        
    } catch (error) {
        console.error('Error creating ZIP download:', error);
        showToast('Error creating ZIP download', 'error');
    }
}

// Photo upload functions
function showPhotoUploadModal(groupId = null) {
    const modal = document.getElementById('photoUploadModal');
    
    if (modal) {
        modal.classList.add('open');
        modal.dataset.groupId = groupId || '';
        resetPhotoUploadForm();
    }
}

function hidePhotoUploadModal() {
    const modal = document.getElementById('photoUploadModal');
    if (modal) {
        modal.classList.remove('open');
        resetPhotoUploadForm();
    }
}

function resetPhotoUploadForm() {
    const fileInput = document.getElementById('photoFileInput');
    const preview = document.getElementById('photoPreview');
    
    if (fileInput) fileInput.value = '';
    if (preview) preview.innerHTML = '';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
}

function handleDrop(e) {
    e.preventDefault();
    const files = e.dataTransfer.files;
    handleFiles(files);
}

function handleFileSelect(e) {
    const files = e.target.files;
    handleFiles(files);
}

function handleFiles(files) {
    const preview = document.getElementById('photoPreview');
    if (!preview) return;

    Array.from(files).forEach(file => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const previewItem = document.createElement('div');
                previewItem.className = 'photo-preview-item';
                previewItem.innerHTML = `
                    <img src="${e.target.result}" alt="Preview" />
                    <button class="remove-preview" onclick="removePreview(this)">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                preview.appendChild(previewItem);
            };
            reader.readAsDataURL(file);
        }
    });
}

function removePreview(button) {
    button.parentElement.remove();
}

async function uploadPhotos() {
    const fileInput = document.getElementById('photoFileInput');
    const modal = document.getElementById('photoUploadModal');
    const groupId = modal.dataset.groupId;
    
    if (!fileInput.files.length) {
        showToast('Please select at least one photo', 'error');
        return;
    }

    try {
        showToast('Uploading photos...', 'info');

        for (const file of fileInput.files) {
            if (file.type.startsWith('image/')) {
                const photoData = await fileToBase64(file);
                const photo = {
                    id: generateId(),
                    title: file.name.replace(/\.[^/.]+$/, ''),
                    data: photoData,
                    groupId: groupId || null,
                    dateAdded: new Date().toISOString(),
                    size: file.size,
                    type: file.type
                };

                photos.push(photo);
            }
        }

        await savePhotos();
        renderPhotoGallery();
        
        // If we're in a group view, refresh it
        if (currentGroup) {
            openGroup(currentGroup.id);
        }
        
        hidePhotoUploadModal();
        showToast(`${fileInput.files.length} photos uploaded successfully`, 'success');

    } catch (error) {
        console.error('Error uploading photos:', error);
        showToast('Error uploading photos', 'error');
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        // For high quality image handling, use canvas compression only if needed
        if (file.type.startsWith('image/') && file.size > 10 * 1024 * 1024) { // Only compress if larger than 10MB
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                // Maintain aspect ratio while reducing size for very large images
                const maxDimension = 2048;
                let { width, height } = img;
                
                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = (height * maxDimension) / width;
                        width = maxDimension;
                    } else {
                        width = (width * maxDimension) / height;
                        height = maxDimension;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                // Use high quality JPEG compression (0.9 = 90% quality)
                resolve(canvas.toDataURL('image/jpeg', 0.9));
            };
            
            img.onerror = () => {
                // Fallback to direct file reading if image processing fails
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            };
            
            const reader = new FileReader();
            reader.onload = (e) => img.src = e.target.result;
            reader.readAsDataURL(file);
        } else {
            // For files under 10MB or non-images, use direct reading to maintain quality
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        }
    });
}

// Photo viewer functions
function openPhotoViewer(photoIndex) {
    currentPhotoIndex = photoIndex;
    
    const modal = document.getElementById('photoViewerModal');
    const img = document.getElementById('photoViewerImg');
    const container = document.getElementById('photoViewerContainer');
    
    if (modal && img && photos[photoIndex]) {
        const photo = photos[photoIndex];
        
        modal.classList.add('open');
        img.src = photo.data;
        img.alt = 'Photo';
        
        // Setup swipe gestures
        setupSwipeGestures(container);
        
        // Show controls briefly then hide
        const controls = document.getElementById('photoViewerControls');
        if (controls) {
            controls.classList.add('show');
            setTimeout(() => {
                controls.classList.remove('show');
            }, 3000);
        }
    }
}

function hidePhotoViewer() {
    const modal = document.getElementById('photoViewerModal');
    if (modal) {
        modal.classList.remove('open');
        // Remove event listeners when closing
        const container = document.getElementById('photoViewerContainer');
        if (container) {
            container.replaceWith(container.cloneNode(true));
        }
    }
}

function showPreviousPhoto() {
    if (currentPhotoIndex > 0) {
        openPhotoViewer(currentPhotoIndex - 1);
    }
}

function showNextPhoto() {
    if (currentPhotoIndex < photos.length - 1) {
        openPhotoViewer(currentPhotoIndex + 1);
    }
}

// Swipe gesture functionality
function setupSwipeGestures(container) {
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let isMoving = false;
    
    // Touch events
    container.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startTime = Date.now();
        isMoving = false;
    }, { passive: true });
    
    container.addEventListener('touchmove', (e) => {
        if (!isMoving && Math.abs(e.touches[0].clientX - startX) > 10) {
            isMoving = true;
        }
    }, { passive: true });
    
    container.addEventListener('touchend', (e) => {
        if (!isMoving) return;
        
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const endTime = Date.now();
        
        const deltaX = endX - startX;
        const deltaY = endY - startY;
        const deltaTime = endTime - startTime;
        
        // Check if it's a valid swipe (horizontal, fast enough, long enough)
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50 && deltaTime < 300) {
            if (deltaX > 0) {
                // Swipe right - previous photo
                showPreviousPhoto();
            } else {
                // Swipe left - next photo
                showNextPhoto();
            }
        }
        
        // Tap to show/hide controls
        if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10 && deltaTime < 200) {
            const controls = document.getElementById('photoViewerControls');
            if (controls) {
                controls.classList.toggle('show');
                if (controls.classList.contains('show')) {
                    setTimeout(() => {
                        controls.classList.remove('show');
                    }, 3000);
                }
            }
        }
    }, { passive: true });
    
    // Mouse events for desktop
    let mouseStartX = 0;
    let mouseDown = false;
    
    container.addEventListener('mousedown', (e) => {
        mouseStartX = e.clientX;
        mouseDown = true;
        e.preventDefault();
    });
    
    container.addEventListener('mousemove', (e) => {
        if (!mouseDown) return;
        e.preventDefault();
    });
    
    container.addEventListener('mouseup', (e) => {
        if (!mouseDown) return;
        mouseDown = false;
        
        const deltaX = e.clientX - mouseStartX;
        
        // Mouse drag for navigation
        if (Math.abs(deltaX) > 100) {
            if (deltaX > 0) {
                showPreviousPhoto();
            } else {
                showNextPhoto();
            }
        } else if (Math.abs(deltaX) < 10) {
            // Click to show/hide controls
            const controls = document.getElementById('photoViewerControls');
            if (controls) {
                controls.classList.toggle('show');
                if (controls.classList.contains('show')) {
                    setTimeout(() => {
                        controls.classList.remove('show');
                    }, 3000);
                }
            }
        }
    });
    
    // Keyboard navigation
    const handleKeyPress = (e) => {
        if (e.key === 'ArrowLeft') {
            showPreviousPhoto();
        } else if (e.key === 'ArrowRight') {
            showNextPhoto();
        } else if (e.key === 'Escape') {
            hidePhotoViewer();
        }
    };
    
    document.addEventListener('keydown', handleKeyPress);
    
    // Store cleanup function
    container._cleanup = () => {
        document.removeEventListener('keydown', handleKeyPress);
    };
}

function downloadCurrentPhoto() {
    const photo = photos[currentPhotoIndex];
    if (photo) {
        const link = document.createElement('a');
        link.href = photo.data;
        link.download = `${photo.title || 'photo'}.${photo.type?.split('/')[1] || 'jpg'}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

function shareCurrentPhoto() {
    const photo = photos[currentPhotoIndex];
    if (!photo) return;

    // Create a downloadable blob URL for sharing
    try {
        // Convert base64 to blob
        const base64Data = photo.data.split(',')[1];
        const mimeType = photo.data.split(',')[0].split(':')[1].split(';')[0];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mimeType });
        
        // Use Web Share API if available
        if (navigator.share && navigator.canShare) {
            const file = new File([blob], `${photo.title || 'photo'}.${mimeType.split('/')[1]}`, { type: mimeType });
            navigator.share({
                title: photo.title || 'Photo',
                text: `Check out this photo: ${photo.title || 'Untitled'}`,
                files: [file]
            }).catch(err => {
                console.log('Error sharing:', err);
                fallbackShare(photo);
            });
        } else {
            fallbackShare(photo);
        }
    } catch (error) {
        console.log('Error preparing photo for sharing:', error);
        fallbackShare(photo);
    }
}

function fallbackShare(photo) {
    // Fallback: copy title and show toast
    const shareText = `Photo: ${photo.title || 'Untitled'} - Taken on ${formatDate(photo.dateAdded)}`;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(shareText).then(() => {
            showToast('Photo details copied to clipboard', 'success');
        }).catch(() => {
            showToast('Photo ready to share', 'info');
        });
    } else {
        showToast('Photo ready to share', 'info');
    }
}

async function deleteCurrentPhoto() {
    const photo = photos[currentPhotoIndex];
    if (photo && confirm('Are you sure you want to delete this photo?')) {
        try {
            photos = photos.filter(p => p.id !== photo.id);
            await savePhotos();
            hidePhotoViewer();
            renderPhotoGallery();
            
            // If we're in a group view, refresh it
            if (currentGroup) {
                openGroup(currentGroup.id);
            }
            
            showToast('Photo deleted successfully', 'success');
        } catch (error) {
            console.error('Error deleting photo:', error);
            showToast('Error deleting photo', 'error');
        }
    }
}

// Data persistence functions
async function savePhotos() {
    try {
        // Always save to localStorage first
        localStorage.setItem('familyPhotos', JSON.stringify(photos));
        
        // Always try to save to Firebase (works for guest users too)
        try {
            const database = window.firebase.database();
            const photosRef = database.ref('sharedNotes/family_photos');
            
            const photosData = {};
            photos.forEach(photo => {
                photosData[photo.id] = photo;
            });
            
            await photosRef.set(photosData);
            console.log('Photos synced to Firebase');
        } catch (firebaseError) {
            console.log('Firebase sync unavailable, photos saved locally');
        }
    } catch (error) {
        console.error('Error saving photos:', error);
        throw error;
    }
}

async function saveGroups() {
    try {
        // Always save to localStorage first
        localStorage.setItem('familyGroups', JSON.stringify(groups));
        
        // Always try to save to Firebase (works for guest users too)
        try {
            const database = window.firebase.database();
            const groupsRef = database.ref('sharedNotes/family_groups');
            
            const groupsData = {};
            groups.forEach(group => {
                groupsData[group.id] = group;
            });
            
            await groupsRef.set(groupsData);
            console.log('Groups synced to Firebase');
        } catch (firebaseError) {
            console.log('Firebase sync unavailable, groups saved locally');
        }
    } catch (error) {
        console.error('Error saving groups:', error);
        throw error;
    }
}

// Utility functions
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
        return 'Today';
    } else if (diffDays === 2) {
        return 'Yesterday';
    } else if (diffDays <= 7) {
        return `${diffDays - 1} days ago`;
    } else {
        return date.toLocaleDateString();
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Real-time sync for universal device sync
function setupRealtimeSync() {
    try {
        const database = window.firebase.database();
        
        // Track if this is the initial load to avoid infinite loops
        let initialPhotosLoad = true;
        let initialGroupsLoad = true;
        
        // Listen for photo changes with proper sync
        const photosRef = database.ref('sharedNotes/family_photos');
        photosRef.on('value', (snapshot) => {
            if (snapshot.exists()) {
                const firebasePhotos = snapshot.val();
                const loadedPhotos = Object.keys(firebasePhotos).map(key => ({
                    id: key,
                    ...firebasePhotos[key]
                }));
                
                // Sort by date for consistency
                loadedPhotos.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
                
                // Only update if data has actually changed (avoid initial load conflicts)
                if (!initialPhotosLoad && JSON.stringify(photos) !== JSON.stringify(loadedPhotos)) {
                    console.log('Photos updated from another device');
                    photos = loadedPhotos;
                    localStorage.setItem('familyPhotos', JSON.stringify(photos));
                    renderPhotoGallery();
                    
                    // Refresh group view if currently open
                    if (currentGroup) {
                        openGroup(currentGroup.id);
                    }
                } else if (initialPhotosLoad) {
                    // Update photos on initial load if Firebase has more recent data
                    photos = loadedPhotos;
                    localStorage.setItem('familyPhotos', JSON.stringify(photos));
                    renderPhotoGallery();
                    initialPhotosLoad = false;
                }
            } else if (!initialPhotosLoad) {
                // Firebase is empty but we have local data - sync it
                if (photos.length > 0) {
                    savePhotos();
                }
            }
        });
        
        // Listen for group changes with proper sync
        const groupsRef = database.ref('sharedNotes/family_groups');
        groupsRef.on('value', (snapshot) => {
            if (snapshot.exists()) {
                const firebaseGroups = snapshot.val();
                const loadedGroups = Object.keys(firebaseGroups).map(key => ({
                    id: key,
                    ...firebaseGroups[key]
                }));
                
                // Sort by creation date for consistency
                loadedGroups.sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));
                
                // Only update if data has actually changed
                if (!initialGroupsLoad && JSON.stringify(groups) !== JSON.stringify(loadedGroups)) {
                    console.log('Groups updated from another device');
                    groups = loadedGroups;
                    localStorage.setItem('familyGroups', JSON.stringify(groups));
                    renderPhotoGallery();
                } else if (initialGroupsLoad) {
                    // Update groups on initial load if Firebase has more recent data
                    groups = loadedGroups;
                    localStorage.setItem('familyGroups', JSON.stringify(groups));
                    renderPhotoGallery();
                    initialGroupsLoad = false;
                }
            } else if (!initialGroupsLoad) {
                // Firebase is empty but we have local data - sync it
                if (groups.length > 0) {
                    saveGroups();
                }
            }
        });
        
        console.log('Real-time sync enabled for universal device access');
    } catch (error) {
        console.log('Real-time sync unavailable, using local storage only');
    }
}

function showToast(message, type = 'default') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    // Add to page
    document.body.appendChild(toast);
    
    // Show toast
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Hide and remove toast
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
}