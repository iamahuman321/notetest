# Family Notes App - Replit Guide

## Overview

This is a Progressive Web Application (PWA) designed for family note-taking and collaboration. The app allows real-time sharing of notes, voice recordings, photo attachments, and organized categorization. Built with vanilla JavaScript and Firebase backend, it focuses on simplicity and mobile-first design for family use.

## System Architecture

### Frontend Architecture
- **Technology Stack**: Vanilla JavaScript, HTML5, CSS3
- **Design Pattern**: Mobile-first responsive design with PWA capabilities
- **UI Framework**: Custom CSS with Font Awesome icons
- **State Management**: Local state with localStorage backup and Firebase real-time sync

### Backend Architecture
- **Primary Backend**: Firebase Realtime Database
- **Authentication**: Firebase Auth with email/password and Google OAuth
- **File Storage**: Firebase Storage (for photos and attachments)
- **Real-time Sync**: Firebase real-time listeners for collaborative editing

### PWA Features
- **Service Worker**: Offline functionality and caching (sw.js)
- **Manifest**: App installation and mobile app-like experience
- **Offline Support**: Local storage fallback when offline

## Key Components

### Core Files
- **index.html**: Main notes interface with sidebar navigation
- **script.js**: Primary application logic and note management
- **styles.css**: Comprehensive mobile-first styling system
- **manifest.json**: PWA configuration for app installation

### Authentication System
- **firebase-config.js**: Firebase initialization and auth state management
- **login.html/signup.html**: Authentication interfaces
- **Guest Mode**: Fallback for users without accounts

### Category Management
- **category.html**: Category management interface
- **category.js**: Category-specific page logic
- **category-manager.js**: Unified category management system with Firebase sync

### Sharing System
- **share.html**: Shared notes and invitations interface
- **share.js**: Real-time collaboration logic
- **Invitation System**: Email-based note sharing with accept/decline workflow

### Recipes System
- **Recipes Page**: Global recipe collection accessible to all users
- **Recipe Editor**: Rich interface for creating and editing recipes with ingredients and method steps
- **Recipe Viewer**: Clean cooking-mode interface with swipe-to-edit functionality
- **Firebase Integration**: Global recipes stored at `sharedNotes/global_recipes` for universal access

### Photo Gallery System
- **Group-Based Organization**: Clean photo groups with square box layout for modern app appearance
- **Universal Device Sync**: Photos sync across all devices regardless of login status using Firebase
- **Photo Upload**: Base64 image storage with drag-and-drop, file selection, and progress feedback
- **Group Management**: Simple group creation with automatic photo preview generation
- **Full-Screen Photo Viewer**: Immersive photo viewing with smooth transitions, navigation controls, and action buttons
- **Cross-Device Sharing**: Enhanced sharing functionality with Web Share API and clipboard fallback
- **Mobile-Optimized**: Responsive design optimized for mobile devices with touch-friendly controls
- **Firebase Integration**: Photos stored at `sharedNotes/family_photos` and groups at `sharedNotes/family_groups`

### Service Worker
- **sw.js**: Offline caching and PWA functionality
- **Cache Strategy**: Network-first for dynamic content, cache-first for static assets

## Data Flow

### Note Creation and Storage
1. Notes created in local state immediately
2. Auto-save to localStorage every 750ms
3. Firebase sync when user is authenticated
4. Real-time updates to all collaborators

### Category Management
1. Categories managed through CategoryManager singleton
2. Local storage for immediate UI response
3. Firebase sync for persistence and sharing
4. Real-time updates across devices

### Authentication Flow
1. Firebase Auth handles user authentication
2. Guest mode available for immediate use
3. Data migration when guest converts to authenticated user
4. Persistent login state with Firebase Auth persistence

### Real-time Collaboration
1. Firebase real-time database listeners for shared notes
2. Conflict resolution through timestamp-based updates
3. Visual indicators for collaborative editing
4. Invitation system for sharing access

## External Dependencies

### Firebase Services
- **Firebase Auth**: User authentication and management
- **Firebase Realtime Database**: Data storage and real-time sync
- **Firebase Storage**: File and image storage

### CDN Resources
- **Font Awesome 6.0.0**: Icon library for UI elements
- **Firebase SDK 8.10.1**: Client-side Firebase functionality

### PWA Dependencies
- **Service Worker API**: Offline functionality and caching
- **Web App Manifest**: App installation and mobile experience

## Deployment Strategy

### Static Hosting
- **Server**: Python HTTP server (port 5000)
- **Deployment**: Simple static file serving
- **CDN**: External dependencies loaded from CDNs

### Environment Configuration
- **Firebase Config**: Hardcoded configuration for production
- **Local Storage**: Primary data persistence mechanism
- **Offline First**: App functions without internet connection

### Performance Optimization
- **Lazy Loading**: Firebase only loads when needed
- **Auto-save Throttling**: 750ms debounce for performance
- **Local-first Updates**: Immediate UI updates with background sync

## Changelog

```
Changelog:
- June 28, 2025: Enhanced Photo Gallery with group-based organization, full-screen immersive viewer, universal device sync (works without login), improved sharing functionality, and mobile-optimized responsive design
- June 27, 2025: Added comprehensive Recipes system with global sharing, editor/viewer modes, and swipe-to-edit functionality
- June 26, 2025: Initial setup
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```