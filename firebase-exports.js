// ES Module exports for deployment compatibility
// This file provides the required exports for the deployment system

// Mock implementations for deployment
const auth = {
  createUserWithEmailAndPassword: () => Promise.reject(new Error("Firebase not initialized")),
  signInWithEmailAndPassword: () => Promise.reject(new Error("Firebase not initialized")),
  signInWithPopup: () => Promise.reject(new Error("Firebase not initialized")),
  signOut: () => Promise.reject(new Error("Firebase not initialized")),
  onAuthStateChanged: () => () => {},
  currentUser: null,
}

const database = {
  ref: () => ({
    set: () => Promise.reject(new Error("Firebase not initialized")),
    update: () => Promise.reject(new Error("Firebase not initialized")),
    once: () => Promise.reject(new Error("Firebase not initialized")),
    on: () => Promise.reject(new Error("Firebase not initialized")),
    off: () => Promise.reject(new Error("Firebase not initialized")),
    orderByChild: () => ({
      startAt: () => ({
        endAt: () => ({
          limitToFirst: () => ({
            once: () => Promise.reject(new Error("Firebase not initialized"))
          })
        })
      })
    }),
    onDisconnect: () => ({
      remove: () => Promise.reject(new Error("Firebase not initialized"))
    })
  }),
}

const googleProvider = {}

const signInWithPopup = () => Promise.reject(new Error("Firebase not initialized"))
const createUserWithEmailAndPassword = () => Promise.reject(new Error("Firebase not initialized"))
const signInWithEmailAndPassword = () => Promise.reject(new Error("Firebase not initialized"))
const signOut = () => Promise.reject(new Error("Firebase not initialized"))
const onAuthStateChanged = () => () => {}
const updateProfile = () => Promise.reject(new Error("Firebase not initialized"))
const ref = () => null
const set = () => Promise.reject(new Error("Firebase not initialized"))

// Sharing-related functions
const shareNote = () => Promise.reject(new Error("Firebase not initialized"))
const getInvitations = () => Promise.reject(new Error("Firebase not initialized"))
const acceptInvitation = () => Promise.reject(new Error("Firebase not initialized"))
const declineInvitation = () => Promise.reject(new Error("Firebase not initialized"))
const getSharedNotes = () => Promise.reject(new Error("Firebase not initialized"))
const updateSharedNote = () => Promise.reject(new Error("Firebase not initialized"))
const updatePresence = () => Promise.reject(new Error("Firebase not initialized"))

// Browser compatibility - no ES modules
if (typeof window !== 'undefined') {
  window.firebaseExports = {
    auth,
    database,
    googleProvider,
    signInWithPopup,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    updateProfile,
    ref,
    set,
    shareNote,
    getInvitations,
    acceptInvitation,
    declineInvitation,
    getSharedNotes,
    updateSharedNote,
    updatePresence,
  }
}
