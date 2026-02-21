# PRD: EasyCall — Elderly-Friendly Video Calling PWA

**Version:** 1.0  
**Last Updated:** 2026-02-21  
**Author:** Solo Developer  
**Status:** Draft  
**Target Platform:** Android (primary), iOS (secondary/future)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Target Users & Personas](#3-target-users--personas)
4. [Developer Environment & Tooling](#4-developer-environment--tooling)
5. [Architecture Overview](#5-architecture-overview)
6. [Technology Stack](#6-technology-stack)
7. [Feature Specifications](#7-feature-specifications)
8. [Data Model](#8-data-model)
9. [Jitsi Integration Specification](#9-jitsi-integration-specification)
10. [Push Notification Architecture](#10-push-notification-architecture)
11. [UX/UI Specification](#11-uxui-specification)
12. [Security & Privacy](#12-security--privacy)
13. [Testing Strategy (TDD)](#13-testing-strategy-tdd)
14. [Deployment & Infrastructure](#14-deployment--infrastructure)
15. [Claude Code Setup & MCP Plugins](#15-claude-code-setup--mcp-plugins)
16. [Risk Register](#16-risk-register)
17. [Task Backlog (JSON)](#17-task-backlog-json)

---

## 1. Executive Summary

**EasyCall** is a Progressive Web Application (PWA) that wraps Jitsi Meet video calling into an extremely simplified interface designed for elderly users. The core interaction model is: **the elderly user sees large photo-buttons of their contacts and taps one to call.** Everything else — configuration, contact management, settings — is handled either by the elderly user through an intentionally minimal self-management interface, or by a family caregiver through a remote dashboard.

The application is **not distributed through App Stores**. It is a PWA installed directly from the browser to the Home Screen, eliminating all app store friction. The video calling infrastructure uses **JaaS (Jitsi as a Service)** for the free tier (≤25 MAU), with a migration path to self-hosted Jitsi on Hetzner (~€5.50/month) if the user base grows. The backend is **Firebase** (Firestore + Auth + Cloud Messaging + Cloud Functions), which operates entirely within the free Spark plan for family-sized deployments.

**Total monthly cost: $0** for up to 25 active users.

**Target timeline:** 12–16 weeks of part-time side-project development across three phases.

---

## 2. Problem Statement

Current video calling solutions (Jitsi Meet, Google Meet, Zoom, FaceTime) share a common design assumption: the user is comfortable navigating multi-step flows involving room creation, link sharing, lobby screens, permission dialogs, and settings panels. For elderly users — particularly those aged 75+ with limited digital literacy — these flows are overwhelming, error-prone, and anxiety-inducing.

The specific pain points this product addresses:

**P1 — Too many steps to start a call.** Jitsi Meet requires: navigate to URL → type room name → click "Start Meeting" → grant camera → grant microphone → optionally set display name → join. EasyCall reduces this to: tap photo → call starts.

**P2 — Confusing UI during calls.** Jitsi Meet's toolbar has 10+ buttons (chat, reactions, raise hand, screen share, etc.) that are irrelevant and confusing for a simple family call. EasyCall shows only: microphone toggle, camera toggle, and end call.

**P3 — No way for family to set things up remotely.** If grandma gets a new phone, a family member must be physically present to install apps, configure accounts, and add contacts. EasyCall's caregiver pairing flow allows remote setup via a 6-digit code.

**P4 — Incoming calls don't work.** Jitsi Meet has no concept of "calling someone" — both parties must navigate to the same room. EasyCall implements proper incoming call notifications: when a family member initiates a call, grandma's phone rings with a full-screen alert and a single "Answer" button.

**P5 — App Store distribution is itself a barrier.** Many elderly users cannot navigate the Play Store or App Store. PWA installation from the browser ("Add to Home Screen") can be guided by a caregiver in a single step.

---

## 3. Target Users & Personas

### Persona 1: The Elderly User ("Grandma Rose")

- **Age:** 72–90
- **Device:** Android smartphone (Samsung Galaxy A-series, Xiaomi Redmi, etc. — mid-range devices are common)
- **Digital literacy:** Can make phone calls, occasionally uses WhatsApp with help, struggles with anything requiring more than 2 steps
- **Physical considerations:** Reduced fine motor control (larger touch targets needed), reduced visual acuity (large text, high contrast), possible hearing aid use (audio routing matters)
- **Emotional state during tech use:** Anxious about "breaking something," embarrassed when confused, avoids exploring unfamiliar UI
- **Primary need:** See and talk to family members with as little friction as a phone call
- **Secondary need:** Optionally manage their own contact list (add/remove a family member)

### Persona 2: The Caregiver ("Alex")

- **Age:** 30–55
- **Device:** Any modern smartphone or desktop browser
- **Digital literacy:** Comfortable with technology, manages family tech
- **Primary need:** Set up and manage grandma's calling experience remotely — add contacts with photos, adjust settings (font size, theme), monitor that the app is working
- **Secondary need:** Initiate calls to grandma and receive calls from her
- **Pain point:** Currently must be physically present to help grandma with tech — wants remote management capability

### Persona 3: The Family Contact ("Sarah")

- **Age:** Any
- **Device:** Any device with a web browser
- **Digital literacy:** Variable — may not be a caregiver, just a family member who wants to call grandma
- **Primary need:** Call grandma by clicking a link or through the app, and receive calls from her
- **Key constraint:** Must not require account creation or app installation to receive a call from grandma (Jitsi rooms are accessible via URL)

---

## 4. Developer Environment & Tooling

### Hardware & OS

| Component           | Details                                                                     |
| ------------------- | --------------------------------------------------------------------------- |
| Development machine | MacBook Pro M1 (macOS Sequoia, planning Tahoe upgrade)                      |
| IDE                 | VS Code (primary), Xcode (installed, for Safari WebKit debugging if needed) |
| Test devices        | Android phone (primary target), iPad (secondary/future iOS testing)         |
| Browser testing     | Chrome (Android + desktop), Safari (iPad)                                   |

### Development Approach

- **AI pair programming:** Claude Code is the primary co-developer. All tasks in this PRD are designed to be delegatable to Claude Code with clear acceptance criteria.
- **Methodology:** Test-Driven Development (TDD). Every feature begins with failing tests, then implementation, then refactoring.
- **Version control:** Git + GitHub. Trunk-based development (main branch + short-lived feature branches).
- **Working hours:** Outside regular work hours (evenings/weekends). Tasks are sized for 1–4 hour sessions.

### Required CLI Tools

```bash
# Node.js (LTS)
node --version  # >= 20.x

# Package manager
npm --version   # or pnpm (recommended for speed)

# Firebase CLI
npm install -g firebase-tools
firebase login

# Vite (via create-vite, no global install needed)
npm create vite@latest

# Testing
npx vitest       # Unit/integration tests
npx playwright   # E2E tests

# Code quality
npx eslint
npx prettier
```

### VS Code Extensions (Recommended)

- **ESLint** — linting
- **Prettier** — code formatting
- **Tailwind CSS IntelliSense** — class autocomplete
- **Vitest** — test runner integration
- **Firebase Explorer** — Firestore data browser
- **Error Lens** — inline error display
- **GitLens** — git blame/history

---

## 5. Architecture Overview

### System Architecture Diagram (ASCII)

```
┌─────────────────────────────────────────────────────────────┐
│                    ELDERLY USER'S PHONE                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              EasyCall PWA (React + Vite)               │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  │  │
│  │  │ Home Screen  │  │  Call Screen  │  │  Settings   │  │  │
│  │  │ (Contact     │  │  (Jitsi      │  │  (Elderly   │  │  │
│  │  │  Photo Grid) │  │   IFrame)    │  │   Simple)   │  │  │
│  │  └──────┬───────┘  └──────┬───────┘  └─────────────┘  │  │
│  │         │                 │                             │  │
│  │  ┌──────┴─────────────────┴──────────────────────────┐ │  │
│  │  │           Service Worker (Workbox)                 │ │  │
│  │  │  - Caches app shell for offline loading            │ │  │
│  │  │  - Handles FCM push notifications                  │ │  │
│  │  │  - Background sync for call history                │ │  │
│  │  └──────┬─────────────────┬──────────────────────────┘ │  │
│  └─────────┼─────────────────┼────────────────────────────┘  │
└────────────┼─────────────────┼────────────────────────────────┘
             │                 │
    ┌────────▼────────┐  ┌────▼────────────┐
    │   Firebase       │  │   JaaS (8x8)    │
    │  ┌────────────┐  │  │                 │
    │  │ Firestore   │  │  │  Jitsi Meet     │
    │  │ (users,     │  │  │  IFrame API     │
    │  │  contacts,  │  │  │  (video/audio)  │
    │  │  calls,     │  │  │                 │
    │  │  pairing)   │  │  │  JWT Auth via   │
    │  ├────────────┤  │  │  Cloud Function  │
    │  │ Auth        │  │  │                 │
    │  │ (Anonymous  │  │  └─────────────────┘
    │  │  + optional │  │
    │  │  email)     │  │
    │  ├────────────┤  │
    │  │ FCM         │  │
    │  │ (Push       │  │
    │  │  Notifs)    │  │
    │  ├────────────┤  │
    │  │ Cloud       │  │
    │  │ Functions   │  │
    │  │ (JWT gen,   │  │
    │  │  call       │  │
    │  │  signaling) │  │
    │  └────────────┘  │
    └──────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                 CAREGIVER'S DEVICE                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           EasyCall PWA (Caregiver Mode)                │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │  │
│  │  │  Dashboard   │  │  Manage      │  │  Call        │ │  │
│  │  │  (Linked     │  │  Contacts    │  │  Grandma    │ │  │
│  │  │   Elderly    │  │  (Add/Edit/  │  │             │ │  │
│  │  │   Users)     │  │   Delete)    │  │             │ │  │
│  │  └──────────────┘  └──────────────┘  └─────────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

**AD-1: Single PWA codebase, role-based views.** The elderly UI and caregiver dashboard live in the same React app. The user's `role` field in Firestore ("elderly" or "caregiver") determines which UI is rendered. This avoids maintaining two separate apps and simplifies deployment.

**AD-2: Jitsi via IFrame API only.** No lib-jitsi-meet, no React SDK wrapper. The IFrame API provides all necessary control (auto-join, UI hiding, event listening, programmatic mute/unmute) with minimal code surface. The `@jitsi/react-sdk` package adds no meaningful value over raw `JitsiMeetExternalAPI` and introduces an extra dependency.

**AD-3: Firebase Anonymous Auth as default.** The elderly user never creates an account. On first launch, Firebase Anonymous Auth creates an identity silently. The caregiver can optionally link an email for account recovery. This means zero friction at first use.

**AD-4: Pre-generated deterministic room IDs.** Each elderly-contact pair has a pre-computed unique Jitsi room ID stored in Firestore (e.g., `easycall-rose-alex-a7f3x`). No room creation API is needed. Both parties join the same pre-known room. This eliminates an entire class of "wrong room" errors.

**AD-5: Firestore real-time listeners for call signaling.** When Alex calls grandma, a document is written to `users/{grandmaId}/incomingCall`. Grandma's app has an `onSnapshot` listener that fires in <1 second, triggering the ringtone and full-screen answer UI. This is simpler, cheaper, and more reliable than building a custom WebSocket server.

**AD-6: Cloudflare Pages for hosting.** Unlimited bandwidth (critical for unpredictable video-app usage patterns), global CDN, free HTTPS, GitHub auto-deploy. Superior to Vercel/Netlify for this use case due to zero bandwidth caps on the free tier.

---

## 6. Technology Stack

### Frontend

| Layer         | Technology      | Version | Rationale                                                                    |
| ------------- | --------------- | ------- | ---------------------------------------------------------------------------- |
| Build tool    | Vite            | 6.x     | Fastest HMR, native ESM, minimal config                                      |
| Framework     | React           | 19.x    | Largest ecosystem, best Claude Code support, IFrame API compat               |
| Language      | TypeScript      | 5.x     | Type safety, better IDE support, catches errors early                        |
| PWA           | vite-plugin-pwa | 1.x     | Auto-generates manifest + service worker via Workbox                         |
| Styling       | Tailwind CSS    | 4.x     | Utility-first, rapid prototyping, excellent responsive                       |
| UI Components | DaisyUI         | 5.x     | Semantic component classes (`btn`, `card`, `modal`), themeable               |
| Routing       | React Router    | 7.x     | History-based routing (BrowserRouter — NOT HashRouter for iOS camera compat) |
| State         | Zustand         | 5.x     | Minimal boilerplate, works with React 19, persists to localStorage           |
| Forms         | React Hook Form | 7.x     | Lightweight, performant, good for caregiver settings forms                   |
| i18n          | react-i18next   | 15.x    | Standard i18n solution, lazy-loaded language bundles                         |

### Backend (Firebase)

| Service               | Usage                                                                     | Free Tier Limit                     |
| --------------------- | ------------------------------------------------------------------------- | ----------------------------------- |
| Firestore             | User profiles, contacts, call signaling, pairing codes, call history      | 50K reads/day, 20K writes/day, 1 GB |
| Authentication        | Anonymous auth (default), email link (optional recovery)                  | Unlimited                           |
| Cloud Messaging (FCM) | Push notifications for incoming calls                                     | Unlimited messages                  |
| Cloud Functions (v2)  | JWT generation for JaaS, call signaling triggers, pairing code validation | 2M invocations/month                |
| Hosting               | _Not used — using Cloudflare Pages instead_                               | —                                   |

### Video Calling

| Component            | Technology                                | Details                                          |
| -------------------- | ----------------------------------------- | ------------------------------------------------ |
| Video infrastructure | JaaS (Jitsi as a Service)                 | Free Developer tier: 25 MAU, unlimited minutes   |
| Integration method   | Jitsi IFrame API (`JitsiMeetExternalAPI`) | Embedded via `<iframe>`, full JS control         |
| Authentication       | JWT tokens                                | Generated server-side by Firebase Cloud Function |
| Fallback (>25 MAU)   | Self-hosted Jitsi on Hetzner CX33         | 4 vCPU, 8 GB RAM, ~€5.50/month                   |

### Testing

| Layer           | Tool                                              | Purpose                               |
| --------------- | ------------------------------------------------- | ------------------------------------- |
| Unit tests      | Vitest                                            | Component logic, utilities, hooks     |
| Component tests | Vitest + React Testing Library                    | UI rendering, user interactions       |
| E2E tests       | Playwright                                        | Full user flows, cross-browser        |
| WebRTC testing  | Playwright + `--use-fake-device-for-media-stream` | Simulated camera/mic for CI           |
| Accessibility   | jest-axe + Lighthouse CI                          | WCAG AAA compliance checks            |
| API mocking     | MSW (Mock Service Worker)                         | Firebase + Jitsi API mocking in tests |

### DevOps

| Layer         | Technology                      | Details                                                 |
| ------------- | ------------------------------- | ------------------------------------------------------- |
| Hosting (PWA) | Cloudflare Pages                | Free tier, unlimited bandwidth, auto-deploy from GitHub |
| CI/CD         | GitHub Actions                  | Build, test, deploy on push to main                     |
| Monitoring    | Sentry (free tier)              | Error tracking, performance monitoring                  |
| Analytics     | Plausible (self-hosted) or none | Privacy-first, optional                                 |

---

## 7. Feature Specifications

### F1: Elderly Home Screen

**Description:** The primary screen an elderly user sees after launching the app. Displays pre-configured contacts as large, tappable photo-buttons arranged in a single-column vertical list. Each button shows the contact's face photo and name in large text.

**User flow:**

1. User opens the PWA (or taps the Home Screen icon).
2. App loads and displays the contact list.
3. User taps a contact's photo.
4. Call initiates immediately (no confirmation dialog).

**Acceptance criteria:**

- AC-1.1: Screen displays contacts as a vertical list of photo-buttons, each at least 120px tall.
- AC-1.2: Contact photo is circular or rounded-square, at least 80×80px.
- AC-1.3: Contact name is displayed below/beside the photo in ≥20px bold sans-serif text.
- AC-1.4: Maximum 6 contacts visible with scrolling; if ≤4 contacts, all visible without scrolling on a 5.5" screen.
- AC-1.5: Tapping a contact navigates to the call screen within 500ms.
- AC-1.6: If no contacts are configured, display a simple message: "No contacts yet. Ask your family to help set up." with a visible pairing code.
- AC-1.7: A small gear icon in the top-right corner (≥48×48px touch target) opens elderly-accessible settings.
- AC-1.8: All touch targets meet the 56×56px minimum.
- AC-1.9: Color contrast meets WCAG AAA (7:1) for all text.

### F2: Video Call Screen

**Description:** Full-screen video call interface wrapping Jitsi Meet via the IFrame API. Shows only the remote participant's video and three control buttons.

**User flow:**

1. User arrives from Home Screen after tapping a contact.
2. Pre-call permission check verifies camera + mic access.
3. If permissions granted: Jitsi IFrame loads, auto-joins the pre-configured room, skips pre-join screen.
4. Remote video fills the screen. Local video shows as a small pip (picture-in-picture) in the corner.
5. Three controls visible at the bottom: Mic toggle, Camera toggle, End Call (red, largest button).
6. User taps "End Call" → returns to Home Screen.

**Jitsi IFrame configuration:**

```javascript
configOverwrite: {
  startWithAudioMuted: false,
  startWithVideoMuted: false,
  prejoinConfig: { enabled: false },
  disableDeepLinking: true,
  toolbarButtons: [],            // Hide ALL default toolbar
  notifications: [],             // Disable all Jitsi notifications
  disableThirdPartyRequests: true,
  hideConferenceSubject: true,
  hideConferenceTimer: true,
  readOnlyName: true,
  disableInviteFunctions: true,
  disableJoinLeaveSounds: false, // Keep join/leave audio cues
  resolution: 360,               // Default to 360p for bandwidth
  constraints: {
    video: { height: { ideal: 360, max: 720, min: 180 } }
  }
},
interfaceConfigOverwrite: {
  DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
  FILM_STRIP_MAX_HEIGHT: 0,
  HIDE_INVITE_MORE_HEADER: true,
  MOBILE_APP_PROMO: false,
  SHOW_JITSI_WATERMARK: false,
  SHOW_WATERMARK_FOR_GUESTS: false,
  TOOLBAR_BUTTONS: [],
  VIDEO_LAYOUT_FIT: 'both'
}
```

**Acceptance criteria:**

- AC-2.1: Jitsi IFrame loads and auto-joins the room without any user interaction.
- AC-2.2: Pre-join/lobby screen is never shown.
- AC-2.3: Only three custom controls are visible: mic toggle (with text label), camera toggle (with text label), end call button.
- AC-2.4: End call button is red, at least 72px tall, with text "End Call."
- AC-2.5: Mic toggle shows clear state: green "Microphone ON" or red "Microphone OFF."
- AC-2.6: Tapping End Call executes `api.dispose()`, writes call end to Firestore, and returns to Home Screen.
- AC-2.7: If the remote participant hangs up, the local user sees a "Call Ended" message for 3 seconds, then returns to Home Screen.
- AC-2.8: Connection quality indicator shows green/yellow/red status with plain text.
- AC-2.9: If bandwidth drops below threshold, auto-reduce to 180p or audio-only with user notification.

### F3: Pre-Call Permission Check

**Description:** Before launching the Jitsi IFrame, the app checks that camera and microphone permissions are granted. If not, it displays a friendly, elderly-oriented guide to enabling them.

**User flow:**

1. User taps a contact to call.
2. App calls `navigator.mediaDevices.getUserMedia({ video: true, audio: true })`.
3. If successful: proceed to call screen.
4. If the browser shows a permission prompt: display a large overlay saying "Tap ALLOW when your phone asks to use the camera and microphone."
5. If permissions are denied/blocked: display step-by-step recovery instructions with screenshots specific to Chrome Android.

**Acceptance criteria:**

- AC-3.1: Permission check completes in <2 seconds.
- AC-3.2: If permissions are already granted, user sees no intermediate screen.
- AC-3.3: If permissions need granting, a helper overlay is shown before the browser prompt.
- AC-3.4: If permissions are permanently denied, recovery instructions are shown with ≥18px text.
- AC-3.5: The user can retry the permission check via a "Try Again" button.
- AC-3.6: Media stream is immediately released after the check (`stream.getTracks().forEach(t => t.stop())`).

### F4: Incoming Call Notification & Answer Screen

**Description:** When another user initiates a call to an elderly user, the elderly user's phone receives a push notification (if backgrounded) or an in-app full-screen alert (if the PWA is open). The alert shows the caller's name and photo with a single "Answer" button.

**Signaling flow:**

1. Caller writes to `users/{elderlyUserId}/incomingCall` in Firestore: `{ callerId, callerName, callerPhoto, jitsiRoomId, status: "ringing", timestamp }`.
2. If the elderly PWA is open: the `onSnapshot` listener fires → full-screen ringing UI appears.
3. If the elderly PWA is closed: a Cloud Function triggers on the Firestore write → sends FCM push notification → elderly user taps notification → PWA opens → reads `incomingCall` doc → shows ringing UI.
4. Elderly user taps "Answer" → navigates to call screen, auto-joins the room.
5. If elderly user doesn't answer within 60 seconds → caller writes `status: "missed"` → ringing stops → call logged as missed.

**Acceptance criteria:**

- AC-4.1: In-app ringing UI appears within 2 seconds of the caller initiating.
- AC-4.2: Ringing UI shows caller's photo (at least 120×120px), name (≥24px bold), and a green "Answer" button (≥80px tall).
- AC-4.3: A red "Decline" button is also shown but is smaller and positioned away from "Answer."
- AC-4.4: A ringtone audio plays on repeat until answered, declined, or timed out.
- AC-4.5: Push notification appears when the PWA is not in foreground (Android Chrome).
- AC-4.6: Tapping the push notification opens the PWA and shows the ringing UI.
- AC-4.7: If the call is missed (60s timeout), the Home Screen shows a "Missed call from [Name]" banner.
- AC-4.8: Call is logged in `callHistory` regardless of outcome (answered, missed, declined).

### F5: Caregiver Dashboard

**Description:** A separate view within the same PWA, accessed by users with the "caregiver" role. Provides full management of linked elderly users' contact lists, settings, and call history.

**Features:**

- View all linked elderly users.
- Add/edit/remove contacts for each elderly user (name, photo upload, phone number for fallback).
- Adjust elderly user's settings: font size (normal/large/extra-large), theme (light/dark/high-contrast), ringtone volume.
- View call history for each elderly user.
- Initiate a call to the elderly user.
- Generate a new pairing code if re-pairing is needed.

**Acceptance criteria:**

- AC-5.1: Caregiver can see a list of all linked elderly users with their last-seen timestamp.
- AC-5.2: Caregiver can add a new contact with name and photo (upload or camera capture).
- AC-5.3: Changes sync to the elderly user's device within 5 seconds.
- AC-5.4: Caregiver can adjust font size setting and the change is reflected on the elderly user's next app open.
- AC-5.5: Caregiver can view the elderly user's last 30 days of call history.
- AC-5.6: Caregiver can initiate a call to the elderly user (triggering the incoming call flow).

### F6: Caregiver-Elderly Pairing

**Description:** A 6-digit numeric code mechanism to link a caregiver's account to an elderly user's device.

**User flow:**

1. Elderly user's app displays a 6-digit code on the Home Screen (when no contacts exist) or in Settings → "Pair with Caregiver."
2. Code is written to Firestore `pairingCodes/{code}` with the elderly user's ID and a 10-minute TTL.
3. Caregiver enters the code in their dashboard → "Link Elderly User."
4. Cloud Function validates the code (not expired, not used), creates the bidirectional link in Firestore.
5. Both devices receive confirmation. Caregiver can now manage the elderly user's contacts.

**Acceptance criteria:**

- AC-6.1: 6-digit code is displayed in ≥48px font on the elderly user's screen.
- AC-6.2: Code refreshes automatically every 10 minutes with a visible countdown timer.
- AC-6.3: Caregiver can enter the code and link is established within 5 seconds.
- AC-6.4: Expired or already-used codes return a clear error message.
- AC-6.5: After successful pairing, both devices show confirmation.
- AC-6.6: An elderly user can be linked to multiple caregivers.
- AC-6.7: A caregiver can be linked to multiple elderly users.

### F7: Elderly Self-Management (Simple Mode)

**Description:** An intentionally minimal settings interface for elderly users who want to manage their own contacts without a caregiver. Accessible via the gear icon on the Home Screen.

**Features:**

- Add a contact: enter name (text input with large keyboard), optionally take/select a photo.
- Remove a contact: long-press on the Home Screen → "Remove" confirmation.
- Adjust own font size (3 options shown as preview text: A, **A**, **A**).
- View pairing code for caregiver linking.

**Acceptance criteria:**

- AC-7.1: "Add Contact" flow has no more than 3 steps.
- AC-7.2: Text input fields use ≥20px font with large input padding.
- AC-7.3: Photo capture uses the device camera directly (HTML input with `capture` attribute).
- AC-7.4: Contact removal requires a single confirmation ("Remove Alex? Yes / No").
- AC-7.5: Settings screen has no more than 4 options visible.
- AC-7.6: All settings are persisted to Firestore immediately.

### F8: PWA Installation & Onboarding

**Description:** A guided first-launch experience that helps the user (or their caregiver) install the PWA to the Home Screen and grant necessary permissions.

**User flow (with caregiver present/on-phone):**

1. Caregiver sends the elderly user a URL (e.g., `https://easycall.app`).
2. Elderly user opens it in Chrome.
3. The app detects first launch → shows a full-screen onboarding flow:
   - Step 1: "Welcome to EasyCall" (large text, friendly illustration).
   - Step 2: "Install this app" → triggers `beforeinstallprompt` on Android → guides user to tap "Add."
   - Step 3: "Allow camera and microphone" → guides through permission grant.
   - Step 4: "Allow notifications" → requests notification permission.
   - Step 5 (if caregiver is helping): "Share this code with your family" → shows pairing code.
4. Onboarding is marked complete in Firestore → never shown again.

**Acceptance criteria:**

- AC-8.1: On Android Chrome, the native install prompt (`beforeinstallprompt`) is intercepted and shown as a custom large-button overlay.
- AC-8.2: On iOS Safari, a manual "Add to Home Screen" guide is shown with step-by-step screenshots.
- AC-8.3: All onboarding steps use ≥20px text and ≥72px buttons.
- AC-8.4: The user can skip any step and complete it later.
- AC-8.5: Onboarding state is stored in Firestore (not just localStorage) to survive cache eviction.
- AC-8.6: Push notification permission is requested with a pre-prompt explanation before the browser dialog.

### F9: Call History

**Description:** A simple, read-only list of recent calls visible to both the elderly user and the caregiver.

**Acceptance criteria:**

- AC-9.1: Shows last 30 days of calls.
- AC-9.2: Each entry shows: contact photo (small), contact name, date/time, duration, and call outcome (completed/missed/declined).
- AC-9.3: Missed calls are highlighted with a subtle red indicator.
- AC-9.4: Tapping a call history entry initiates a new call to that contact.
- AC-9.5: The elderly user's view shows a maximum of 20 entries with a "Show more" button.

### F10: Auto-Rejoin on Disconnect

**Description:** If the elderly user accidentally closes the app or the browser tab during an active call, the app attempts to detect and recover.

**Acceptance criteria:**

- AC-10.1: On page load, if an active `incomingCall` or `activeCall` document exists in Firestore with `status: "active"` and `timestamp` within the last 5 minutes → show "Return to call with [Name]?" prompt.
- AC-10.2: The rejoin prompt uses a ≥72px green button.
- AC-10.3: If the user does not rejoin within 30 seconds, the call is marked as ended.
- AC-10.4: The `beforeunload` event fires a warning during active calls.

---

## 8. Data Model

### Firestore Collections

```
Root
├── users/{userId}
│   ├── Fields:
│   │   ├── displayName: string
│   │   ├── role: "elderly" | "caregiver"
│   │   ├── email: string | null          // For account recovery
│   │   ├── settings: {
│   │   │     fontSize: "normal" | "large" | "xlarge"
│   │   │     theme: "light" | "dark" | "high-contrast"
│   │   │     ringtoneVolume: number (0-100)
│   │   │     language: string (ISO 639-1)
│   │   │   }
│   │   ├── pushTokens: string[]          // FCM tokens (multiple devices)
│   │   ├── onboardingComplete: boolean
│   │   ├── lastSeen: timestamp
│   │   └── createdAt: timestamp
│   │
│   ├── Sub-collection: contacts/{contactId}
│   │   ├── name: string
│   │   ├── photoURL: string | null       // Firebase Storage URL
│   │   ├── jitsiRoomId: string           // Pre-generated, unique per pair
│   │   ├── contactUserId: string | null  // If the contact also has an EasyCall account
│   │   ├── displayOrder: number          // For ordering on Home Screen
│   │   └── createdAt: timestamp
│   │
│   ├── Sub-collection: caregivers/{visitorUserId}
│   │   ├── linkedAt: timestamp
│   │   └── permissions: string[]         // ["manage_contacts", "manage_settings", "view_history"]
│   │
│   ├── Sub-collection: callHistory/{callId}
│   │   ├── contactId: string
│   │   ├── contactName: string
│   │   ├── direction: "outgoing" | "incoming"
│   │   ├── outcome: "completed" | "missed" | "declined"
│   │   ├── duration: number (seconds)
│   │   ├── startedAt: timestamp
│   │   └── endedAt: timestamp
│   │
│   └── Document: incomingCall (single doc, overwritten per call)
│       ├── callerId: string
│       ├── callerName: string
│       ├── callerPhotoURL: string | null
│       ├── jitsiRoomId: string
│       ├── status: "ringing" | "answered" | "missed" | "declined" | "ended"
│       └── timestamp: timestamp
│
└── pairingCodes/{code}                   // 6-digit numeric string
    ├── elderlyUserId: string
    ├── expiresAt: timestamp
    └── used: boolean
```

### Firestore Security Rules (Key Excerpts)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users can read/write their own profile
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;

      // Contacts: owner or linked caregiver
      match /contacts/{contactId} {
        allow read, write: if request.auth.uid == userId
          || isCaregiverOf(userId, request.auth.uid);
      }

      // Incoming call: anyone can write (to initiate a call), owner can read
      match /incomingCall {
        allow read: if request.auth.uid == userId;
        allow write: if request.auth != null; // Any authenticated user can call
      }

      // Call history: owner or linked caregiver can read
      match /callHistory/{callId} {
        allow read: if request.auth.uid == userId
          || isCaregiverOf(userId, request.auth.uid);
        allow write: if request.auth.uid == userId;
      }
    }

    // Pairing codes: anyone authenticated can read (to validate), owner can write
    match /pairingCodes/{code} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
    }
  }
}
```

### Jitsi Room ID Generation

Room IDs are generated when a contact is created and follow the pattern:

```
easycall-{shortElderlyName}-{shortContactName}-{random6chars}
```

Example: `easycall-rose-alex-k8m2p1`

This ensures rooms are unique, human-readable for debugging, and deterministic — both parties always know the room name.

---

## 9. Jitsi Integration Specification

### JaaS Setup

1. **Create a JaaS account** at [https://jaas.8x8.vc](https://jaas.8x8.vc).
2. **Get the App ID** from the JaaS dashboard (format: `vpaas-magic-cookie-xxxxx`).
3. **Generate an API key pair** (RSA) for JWT signing. Download the private key.
4. **Store the private key** as a Firebase Cloud Functions environment secret.

### JWT Token Generation (Cloud Function)

```typescript
// functions/src/generateJitsiToken.ts
import * as functions from 'firebase-functions/v2';
import jwt from 'jsonwebtoken';

export const generateJitsiToken = functions.https.onCall(async (request) => {
  const { uid } = request.auth!;
  const { roomName, displayName } = request.data;

  const privateKey = process.env.JAAS_PRIVATE_KEY;
  const appId = process.env.JAAS_APP_ID;
  const keyId = process.env.JAAS_KEY_ID;

  const token = jwt.sign(
    {
      aud: 'jitsi',
      iss: 'chat',
      sub: appId,
      room: roomName,
      context: {
        user: {
          id: uid,
          name: displayName,
          moderator: 'false',
        },
      },
    },
    privateKey,
    {
      algorithm: 'RS256',
      header: { kid: keyId, typ: 'JWT', alg: 'RS256' },
      expiresIn: '2h',
    },
  );

  return { token };
});
```

### IFrame API Integration (React Component)

```typescript
// src/components/JitsiCall.tsx
import { useEffect, useRef, useCallback } from 'react';

interface JitsiCallProps {
  roomName: string;
  displayName: string;
  jwtToken: string;
  onCallEnded: () => void;
}

export function JitsiCall({ roomName, displayName, jwtToken, onCallEnded }: JitsiCallProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const api = new (window as any).JitsiMeetExternalAPI('8x8.vc', {
      roomName: `${JAAS_APP_ID}/${roomName}`,
      parentNode: containerRef.current,
      jwt: jwtToken,
      userInfo: { displayName },
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        prejoinConfig: { enabled: false },
        disableDeepLinking: true,
        toolbarButtons: [],
        notifications: [],
        hideConferenceSubject: true,
        hideConferenceTimer: true,
        resolution: 360,
      },
      interfaceConfigOverwrite: {
        FILM_STRIP_MAX_HEIGHT: 0,
        MOBILE_APP_PROMO: false,
        SHOW_JITSI_WATERMARK: false,
        TOOLBAR_BUTTONS: [],
        VIDEO_LAYOUT_FIT: 'both',
      }
    });

    apiRef.current = api;

    api.addListener('readyToClose', onCallEnded);
    api.addListener('participantLeft', () => {
      // If we're the only one left, end the call after 5 seconds
      // (handles the case where the remote user hangs up)
    });

    return () => {
      api.dispose();
    };
  }, [roomName, displayName, jwtToken, onCallEnded]);

  const toggleAudio = useCallback(() => {
    apiRef.current?.executeCommand('toggleAudio');
  }, []);

  const toggleVideo = useCallback(() => {
    apiRef.current?.executeCommand('toggleVideo');
  }, []);

  const hangUp = useCallback(() => {
    apiRef.current?.executeCommand('hangup');
  }, []);

  return (
    <div className="relative h-screen w-screen">
      <div ref={containerRef} className="absolute inset-0" />
      {/* Custom overlay controls rendered on top of the iframe */}
      <CallControls
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onHangUp={hangUp}
      />
    </div>
  );
}
```

### Jitsi IFrame API Events to Handle

| Event                    | Action                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `videoConferenceJoined`  | Update `incomingCall.status` to "active," start duration timer                        |
| `videoConferenceLeft`    | Write call history, clean up `incomingCall` doc                                       |
| `readyToClose`           | Dispose API, navigate to Home Screen                                                  |
| `participantJoined`      | Show "Connected" indicator, stop ringtone if applicable                               |
| `participantLeft`        | If alone in room, show "Call ended" → auto-dispose after 5s                           |
| `audioMuteStatusChanged` | Update mic toggle button state                                                        |
| `videoMuteStatusChanged` | Update camera toggle button state                                                     |
| `cameraError`            | Show elderly-friendly error: "Camera problem. Try closing and reopening the app."     |
| `micError`               | Show elderly-friendly error: "Microphone problem. Try closing and reopening the app." |

---

## 10. Push Notification Architecture

### Service Worker Registration

```typescript
// src/firebase-messaging-sw.ts (registered by vite-plugin-pwa)
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

onBackgroundMessage(messaging, (payload) => {
  const { callerName, callerPhoto, roomId, elderlyUserId } = payload.data!;

  self.registration.showNotification(`${callerName} is calling!`, {
    body: 'Tap to answer',
    icon: callerPhoto || '/icons/default-caller.png',
    badge: '/icons/badge-72.png',
    tag: 'incoming-call', // Replaces previous call notifications
    requireInteraction: true, // Stays visible until user acts
    vibrate: [200, 100, 200, 100, 200],
    data: { roomId, elderlyUserId },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { roomId } = event.notification.data;
  // Open the app to the call screen
  event.waitUntil(clients.openWindow(`/call/${roomId}`));
});
```

### Cloud Function: Send Call Notification

```typescript
// functions/src/onIncomingCall.ts
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getMessaging } from 'firebase-admin/messaging';

export const onIncomingCall = onDocumentWritten(
  'users/{elderlyUserId}/incomingCall',
  async (event) => {
    const after = event.data?.after.data();
    if (!after || after.status !== 'ringing') return;

    const elderlyDoc = await getFirestore().doc(`users/${event.params.elderlyUserId}`).get();
    const pushTokens = elderlyDoc.data()?.pushTokens || [];

    if (pushTokens.length === 0) return;

    await getMessaging().sendEachForMulticast({
      tokens: pushTokens,
      data: {
        type: 'incoming_call',
        callerName: after.callerName,
        callerPhoto: after.callerPhotoURL || '',
        roomId: after.jitsiRoomId,
        elderlyUserId: event.params.elderlyUserId,
      },
      android: {
        priority: 'high',
        ttl: 60 * 1000, // 60 second TTL (matches call timeout)
      },
      webpush: {
        headers: { Urgency: 'high' },
        fcmOptions: { link: `/call/${after.jitsiRoomId}` },
      },
    });
  },
);
```

### FCM Token Management

```typescript
// src/hooks/usePushNotifications.ts
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { doc, arrayUnion, arrayRemove, updateDoc } from 'firebase/firestore';

export function usePushNotifications(userId: string) {
  const registerToken = async () => {
    const messaging = getMessaging();
    const token = await getToken(messaging, {
      vapidKey: process.env.VITE_FIREBASE_VAPID_KEY,
    });

    // Store token in user's Firestore document
    await updateDoc(doc(db, 'users', userId), {
      pushTokens: arrayUnion(token),
    });

    return token;
  };

  const unregisterToken = async (token: string) => {
    await updateDoc(doc(db, 'users', userId), {
      pushTokens: arrayRemove(token),
    });
  };

  // Handle foreground messages (show in-app notification)
  onMessage(getMessaging(), (payload) => {
    if (payload.data?.type === 'incoming_call') {
      // Trigger in-app ringing UI via Zustand store
      useCallStore.getState().setIncomingCall(payload.data);
    }
  });

  return { registerToken, unregisterToken };
}
```

---

## 11. UX/UI Specification

### Design Tokens

```css
/* Elderly-optimized design tokens */
:root {
  /* Font sizes (responsive, scale with user preference) */
  --text-body: clamp(18px, 4vw, 22px);
  --text-heading: clamp(24px, 6vw, 32px);
  --text-button: clamp(20px, 5vw, 26px);
  --text-display: clamp(32px, 8vw, 48px); /* For pairing codes */

  /* Touch targets */
  --touch-min: 56px;
  --touch-primary: 80px; /* Primary action buttons */
  --touch-call: 100px; /* Call/answer buttons */

  /* Spacing */
  --space-xs: 8px;
  --space-sm: 12px;
  --space-md: 20px;
  --space-lg: 32px;
  --space-xl: 48px;

  /* Colors (WCAG AAA compliant) */
  --color-call-green: #1b7a1b; /* High contrast green */
  --color-call-red: #c41e1e; /* High contrast red */
  --color-bg: #ffffff;
  --color-text: #1a1a1a; /* Near-black for max contrast */
  --color-text-secondary: #4a4a4a;
  --color-border: #cccccc;
  --color-warning: #b35c00; /* Amber, not yellow (better contrast) */

  /* Fonts */
  --font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-weight-normal: 400;
  --font-weight-bold: 700;
  --line-height: 1.6;

  /* Borders */
  --radius-sm: 12px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --radius-round: 9999px;
}
```

### Screen Wireframes (ASCII)

**Home Screen (Elderly):**

```
┌──────────────────────────┐
│  EasyCall           ⚙️   │
│                          │
│  ┌────────────────────┐  │
│  │   ┌──────┐         │  │
│  │   │ 📷   │  Alex   │  │
│  │   │      │         │  │
│  │   └──────┘         │  │
│  └────────────────────┘  │
│                          │
│  ┌────────────────────┐  │
│  │   ┌──────┐         │  │
│  │   │ 📷   │  Sarah  │  │
│  │   │      │         │  │
│  │   └──────┘         │  │
│  └────────────────────┘  │
│                          │
│  ┌────────────────────┐  │
│  │   ┌──────┐         │  │
│  │   │ 📷   │  David  │  │
│  │   │      │         │  │
│  │   └──────┘         │  │
│  └────────────────────┘  │
│                          │
│          📋 History      │
└──────────────────────────┘
```

**Call Screen (Elderly):**

```
┌──────────────────────────┐
│                          │
│   ╔══════════════════╗   │
│   ║                  ║   │
│   ║  Remote Video    ║   │
│   ║  (Full Screen)   ║   │
│   ║                  ║   │
│   ║        ┌──────┐  ║   │
│   ║        │ Self │  ║   │
│   ║        │ PiP  │  ║   │
│   ║        └──────┘  ║   │
│   ╚══════════════════╝   │
│                          │
│  🟢 Connected            │
│                          │
│  ┌──────┐ ┌──────┐      │
│  │ 🎤   │ │ 📹   │      │
│  │ Mic  │ │ Cam  │      │
│  │ ON   │ │ ON   │      │
│  └──────┘ └──────┘      │
│                          │
│    ┌──────────────┐      │
│    │   End Call    │      │
│    │   🔴         │      │
│    └──────────────┘      │
└──────────────────────────┘
```

**Incoming Call Screen:**

```
┌──────────────────────────┐
│                          │
│                          │
│       ┌──────────┐       │
│       │          │       │
│       │   📷     │       │
│       │  Alex    │       │
│       │          │       │
│       └──────────┘       │
│                          │
│      Alex is calling     │
│                          │
│                          │
│    ┌──────────────┐      │
│    │              │      │
│    │   ANSWER     │      │
│    │   🟢         │      │
│    │              │      │
│    └──────────────┘      │
│                          │
│       ┌────────┐         │
│       │Decline │         │
│       └────────┘         │
│                          │
└──────────────────────────┘
```

### Accessibility Checklist (Apply to Every Screen)

- [ ] All text ≥18px (body) or ≥16px (secondary).
- [ ] All interactive elements ≥56×56px touch target.
- [ ] Color contrast ≥7:1 (WCAG AAA) for body text.
- [ ] Color contrast ≥4.5:1 for large text (≥24px).
- [ ] No information conveyed by color alone (always include text labels or icons).
- [ ] All images have descriptive `alt` text.
- [ ] All buttons have visible text labels (not icon-only).
- [ ] Focusable elements have visible focus indicators (`:focus-visible` ring).
- [ ] No auto-playing animations or videos (except the video call itself).
- [ ] Screen reader compatible: semantic HTML (`<button>`, `<nav>`, `<main>`, `<h1>`), ARIA labels where needed.
- [ ] Orientation locked to portrait via manifest and JS.

---

## 12. Security & Privacy

### Threat Model

| Threat                                        | Mitigation                                                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unauthorized access to elderly user's account | Firebase Anonymous Auth + optional biometric/PIN lock                                                                                                                        |
| Stranger initiating a call to elderly user    | Only users with a contact entry (and thus the room ID) can call. Room IDs are unguessable (6 random chars). JaaS JWT authentication prevents room hijacking.                 |
| Eavesdropping on calls                        | Jitsi uses SRTP (Secure Real-Time Protocol) encryption for all media streams. JaaS rooms are JWT-authenticated.                                                              |
| Caregiver privilege abuse                     | Permissions are scoped (manage_contacts, manage_settings, view_history). Elderly user can remove caregivers from settings.                                                   |
| Push token theft                              | FCM tokens are stored in Firestore with per-user security rules. Only the user and Cloud Functions (admin SDK) can access them.                                              |
| Pairing code brute force                      | 6-digit codes (1M possibilities) with 10-minute TTL and single-use flag. Rate limiting on the Cloud Function.                                                                |
| Data breach                                   | Firestore security rules enforce per-user data isolation. No sensitive PII stored (no passwords, no SSN). Photos stored in Firebase Storage with per-user read access rules. |

### Privacy Considerations

- **No analytics by default.** Optional Plausible (privacy-first, no cookies) can be added later.
- **No third-party trackers.** Firebase is the only third-party service, operating under Google's data processing terms.
- **Call recordings:** Not supported. Jitsi's recording feature is disabled via config.
- **Data retention:** Call history auto-deletes after 90 days via a scheduled Cloud Function.
- **GDPR compliance:** Users can delete their account via settings, which triggers cascading deletion of all sub-collections.

---

## 13. Testing Strategy (TDD)

### TDD Workflow

Every feature follows the Red → Green → Refactor cycle:

1. **Red:** Write a failing test that describes the expected behavior.
2. **Green:** Write the minimum code to make the test pass.
3. **Refactor:** Clean up the code while keeping tests green.

### Test Pyramid

```
         ╱  E2E Tests (Playwright)  ╲         ~10 tests
        ╱   - Full user flows         ╲
       ╱   - Cross-browser             ╲
      ╱─────────────────────────────────╲
     ╱  Integration Tests (Vitest+RTL)   ╲    ~30 tests
    ╱   - Component interactions          ╲
   ╱   - Firebase mock interactions        ╲
  ╱   - Jitsi API mock interactions         ╲
 ╱───────────────────────────────────────────╲
╱     Unit Tests (Vitest)                      ╲  ~50 tests
│     - Utility functions                       │
│     - Hooks (useCallState, useContacts)       │
│     - Store logic (Zustand)                   │
│     - Room ID generation                      │
│     - Pairing code validation                 │
╲──────────────────────────────────────────────╱
```

### Testing Configuration

**vitest.config.ts:**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
    },
  },
});
```

**Playwright config (E2E):**

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:5173',
    permissions: ['camera', 'microphone', 'notifications'],
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Pixel 7'] } },
    { name: 'webkit', use: { ...devices['iPad Mini'] } }, // iOS secondary
  ],
});
```

### Mock Strategy

**Firebase mocking (MSW):**

```typescript
// src/test/mocks/firebase.ts
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const firebaseHandlers = [
  http.post('https://firestore.googleapis.com/*', () => {
    return HttpResponse.json({
      /* mock Firestore response */
    });
  }),
];

export const server = setupServer(...firebaseHandlers);
```

**Jitsi IFrame API mocking:**

```typescript
// src/test/mocks/jitsi.ts
export class MockJitsiMeetExternalAPI {
  private listeners: Record<string, Function[]> = {};

  constructor(domain: string, options: any) {
    // Store options for assertions
  }

  addListener(event: string, fn: Function) {
    this.listeners[event] = [...(this.listeners[event] || []), fn];
  }

  executeCommand(command: string, ...args: any[]) {
    // Track commands for assertions
  }

  dispose() {}

  // Test helper: simulate events
  _emit(event: string, data?: any) {
    this.listeners[event]?.forEach((fn) => fn(data));
  }
}

// Inject into window before tests
(window as any).JitsiMeetExternalAPI = MockJitsiMeetExternalAPI;
```

### Accessibility Testing

```typescript
// src/test/setup.ts
import { toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);

// Usage in component tests:
import { axe } from 'jest-axe';
import { render } from '@testing-library/react';

test('HomeScreen passes accessibility audit', async () => {
  const { container } = render(<HomeScreen />);
  const results = await axe(container, {
    rules: {
      'color-contrast': { enabled: true },  // WCAG AAA
    }
  });
  expect(results).toHaveNoViolations();
});
```

### CI Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run lint
      - run: npm run test:unit -- --coverage
      - run: npm run test:e2e
      - run: npx lighthouse-ci --config=lighthouserc.json

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci && npm run build
      - uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          projectName: easycall
          directory: dist
```

---

## 14. Deployment & Infrastructure

### Infrastructure Map

```
GitHub (source) ─── push ──→ GitHub Actions (CI)
                                  │
                         build + test
                                  │
                     ┌────────────┼────────────┐
                     ▼            ▼             ▼
              Cloudflare     Firebase       Firebase
              Pages          Functions      Firestore
              (PWA static)   (JaaS JWT,     (data)
                             call signal)
                                  │
                                  ▼
                           JaaS (8x8.vc)
                           (video infra)
```

### Cloudflare Pages Setup

1. Connect GitHub repository to Cloudflare Pages.
2. Build command: `npm run build`
3. Build output directory: `dist`
4. Environment variables: `VITE_FIREBASE_*`, `VITE_JAAS_APP_ID`
5. Custom domain: `easycall.app` (or similar) — ~$10/year for domain.

### Firebase Project Setup

```bash
# Initialize Firebase in the project
firebase init

# Select: Firestore, Functions (TypeScript), Hosting (skip — using CF Pages)

# Deploy functions
cd functions && npm install && cd ..
firebase deploy --only functions

# Deploy Firestore rules and indexes
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

### Environment Variables

```bash
# .env.local (PWA — public, embedded in client bundle)
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=easycall-xxxxx.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=easycall-xxxxx
VITE_FIREBASE_STORAGE_BUCKET=easycall-xxxxx.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
VITE_FIREBASE_VAPID_KEY=BNx...  # For FCM Web Push
VITE_JAAS_APP_ID=vpaas-magic-cookie-xxxxx

# Firebase Cloud Functions (.env or Secret Manager — private)
JAAS_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----...
JAAS_APP_ID=vpaas-magic-cookie-xxxxx
JAAS_KEY_ID=vpaas-magic-cookie-xxxxx/abcdef
```

### Self-Hosted Jitsi Fallback (>25 MAU)

If migration to self-hosted is needed:

1. Provision Hetzner CX33 (4 vCPU, 8 GB RAM, ~€5.50/month).
2. Install Docker + docker-jitsi-meet.
3. Configure Let's Encrypt SSL.
4. Set up coturn for TURN/TLS relay.
5. Update PWA: change Jitsi domain from `8x8.vc` to `meet.yourdomain.com`.
6. Remove JWT token generation (or configure Prosody JWT auth).

Estimated migration effort: 4–8 hours.

---

## 15. Claude Code Setup & MCP Plugins

### Claude Code Configuration

Claude Code is the primary AI co-developer for this project. Configure it for maximum effectiveness:

**Project instructions file (`.claude/instructions.md`):**

```markdown
# EasyCall Project Instructions for Claude Code

## Project Context

EasyCall is a PWA for elderly video calling using Jitsi. See PRD_EasyCall.md for full specs.

## Development Approach

- TDD: Always write tests FIRST, then implement.
- TypeScript strict mode is enabled.
- All components must pass jest-axe accessibility checks.
- Follow the task list in PRD_EasyCall.md — check off tasks as completed.

## Code Style

- React functional components only (no class components).
- Use Zustand for global state, React Query for server state.
- Tailwind CSS for styling — use DaisyUI component classes where applicable.
- All text must use design tokens from src/styles/tokens.css.
- All touch targets must be ≥56px (use min-h-14 min-w-14 in Tailwind).

## File Structure

src/
components/ # React components
elderly/ # Elderly-facing UI
caregiver/ # Caregiver dashboard UI
shared/ # Shared components (buttons, modals)
hooks/ # Custom React hooks
stores/ # Zustand stores
services/ # Firebase, Jitsi, FCM service layers
utils/ # Pure utility functions
test/ # Test setup, mocks, fixtures
types/ # TypeScript type definitions

## Testing Rules

- Every new file in components/, hooks/, stores/, or services/ must have a
  corresponding .test.ts(x) file.
- Test file goes next to the source file: Component.tsx → Component.test.tsx
- Use @testing-library/react for component tests.
- Use MSW for API mocking.
- Mock JitsiMeetExternalAPI using the mock in src/test/mocks/jitsi.ts.
- Run `npm test` before committing.

## Key Libraries

- Firebase v10 (modular SDK)
- JitsiMeetExternalAPI (loaded via script tag, not npm)
- vite-plugin-pwa + Workbox
- Zustand v5
- React Router v7

## Environment

- macOS (Apple Silicon)
- Node 20+
- pnpm preferred
```

### Recommended MCP Servers for Claude Code

MCP (Model Context Protocol) servers extend Claude Code's capabilities. The following are relevant to this project:

**1. Firebase MCP Server**
Allows Claude Code to directly interact with Firestore during development.

```json
// .claude/mcp_servers.json
{
  "servers": [
    {
      "name": "firebase",
      "command": "npx",
      "args": ["@anthropic/firebase-mcp-server"],
      "env": {
        "FIREBASE_PROJECT_ID": "easycall-xxxxx",
        "GOOGLE_APPLICATION_CREDENTIALS": "./service-account.json"
      }
    }
  ]
}
```

**2. Filesystem MCP Server (built-in)**
Claude Code already has filesystem access. Ensure the project root is in the allowed paths.

**3. GitHub MCP Server**
For managing issues, PRs, and the task backlog directly from Claude Code.

```json
{
  "name": "github",
  "command": "npx",
  "args": ["@anthropic/github-mcp-server"],
  "env": {
    "GITHUB_TOKEN": "<your-token>"
  }
}
```

**4. Browser / Playwright MCP Server**
For automated testing and visual verification.

```json
{
  "name": "playwright",
  "command": "npx",
  "args": ["@anthropic/playwright-mcp-server"]
}
```

### Claude Code Workflow Per Task

For each task in the backlog:

1. **Read the task** from the JSON backlog (this document).
2. **Create the test file** first (Red phase).
3. **Run tests** to confirm they fail: `npm test -- --filter <testFile>`.
4. **Implement the feature** (Green phase).
5. **Run tests** to confirm they pass.
6. **Refactor** if needed.
7. **Run full test suite** + lint: `npm test && npm run lint`.
8. **Update the task JSON** — set `"done": true`.
9. **Commit** with conventional commit message: `feat(F1): implement elderly home screen`.

---

## 16. Risk Register

| ID  | Risk                                             | Probability | Impact | Mitigation                                                                                                                      |
| --- | ------------------------------------------------ | ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| R1  | JaaS free tier discontinued or limits reduced    | Low         | High   | Architecture supports migration to self-hosted Jitsi (4–8 hrs effort). IFrame API code identical — only domain changes.         |
| R2  | iOS PWA push notifications unreliable            | Medium      | Medium | Primary target is Android. iOS documented as second-class. Caregiver can call elderly user's phone number as fallback.          |
| R3  | Elderly user unable to complete onboarding alone | High        | Medium | Onboarding designed to require caregiver assistance. Remote pairing flow + phone call guidance.                                 |
| R4  | Jitsi IFrame API breaking changes                | Low         | High   | Pin Jitsi external API script version. Test against JaaS staging environment before updates.                                    |
| R5  | Firebase free tier exceeded                      | Very Low    | Low    | Family-sized usage is <1% of free tier limits. Monitoring alerts at 50% usage.                                                  |
| R6  | WebRTC quality on poor mobile networks           | Medium      | High   | Default 360p resolution, auto-degrade to 180p/audio-only. Connection quality indicator. Plain-language error messages.          |
| R7  | Developer burnout (solo side project)            | Medium      | High   | MVP scoped to 4–6 weeks. Phases are independently valuable. Claude Code handles boilerplate. Tasks sized for 1–4 hour sessions. |
| R8  | Camera permissions permanently denied            | Medium      | Medium | Pre-call check with step-by-step recovery guide. Caregiver can assist remotely via phone call.                                  |

---

## 17. Task Backlog (JSON)

The following JSON represents the complete task backlog. Each task has:

- `id`: Unique identifier (phase.feature.task)
- `phase`: Development phase (1 = MVP, 2 = Notifications & Pairing, 3 = Polish)
- `feature`: Feature reference from Section 7
- `title`: Task title
- `description`: Detailed description of what to implement
- `acceptance_criteria`: Testable criteria (map to AC codes from Feature Specs)
- `test_first`: What tests to write before implementing
- `estimated_hours`: Estimated hours for a solo developer (with Claude Code)
- `dependencies`: Task IDs that must be completed first
- `done`: Boolean — set to true when task is complete

```json
[
  {
    "id": "1.0.1",
    "phase": 1,
    "feature": "setup",
    "title": "Project Scaffolding",
    "description": "Initialize a Vite + React + TypeScript project with pnpm. Configure Tailwind CSS 4, DaisyUI 5, React Router 7 (BrowserRouter), Zustand 5, and vite-plugin-pwa. Set up ESLint + Prettier. Create the folder structure per the Claude Code instructions. Initialize Git repo with .gitignore and README.",
    "acceptance_criteria": [
      "Running 'pnpm dev' starts the dev server without errors",
      "TypeScript strict mode is enabled in tsconfig.json",
      "Tailwind CSS classes render correctly in a test component",
      "DaisyUI theme classes work (e.g., btn btn-primary)",
      "PWA manifest is generated at /manifest.webmanifest",
      "Service worker is registered in production build",
      "ESLint and Prettier pass with zero errors on all files",
      "Folder structure matches the specification in Claude Code instructions"
    ],
    "test_first": "Create a smoke test that renders the App component and verifies it mounts without errors. Create a PWA manifest validation test that checks required fields (name, icons, start_url, display: standalone, orientation: portrait).",
    "estimated_hours": 3,
    "dependencies": [],
    "done": false
  },
  {
    "id": "1.0.2",
    "phase": 1,
    "feature": "setup",
    "title": "Testing Infrastructure",
    "description": "Configure Vitest with jsdom environment, React Testing Library, jest-axe for accessibility testing, and MSW for API mocking. Create mock files for JitsiMeetExternalAPI and Firebase services. Set up Playwright with Chrome (Pixel 7 device profile) and fake media stream flags. Create test utility helpers (renderWithProviders, createMockUser, createMockContact).",
    "acceptance_criteria": [
      "Running 'pnpm test' executes Vitest and finds test files",
      "A sample component test renders and queries the DOM via RTL",
      "jest-axe integration works: a test with a contrast violation fails",
      "MSW intercepts a mock Firebase request in a test",
      "JitsiMeetExternalAPI mock can be instantiated and emit events",
      "Playwright launches Chrome with fake media stream and can navigate to localhost",
      "Code coverage report is generated with thresholds: 80% lines, 75% branches"
    ],
    "test_first": "Write meta-tests: a test that verifies jest-axe catches a known violation, a test that verifies MSW intercepts requests, a test that verifies the Jitsi mock emits events correctly.",
    "estimated_hours": 4,
    "dependencies": ["1.0.1"],
    "done": false
  },
  {
    "id": "1.0.3",
    "phase": 1,
    "feature": "setup",
    "title": "Firebase Project Setup",
    "description": "Create a Firebase project (easycall). Enable Anonymous Authentication, Firestore, Cloud Messaging, and Cloud Functions (v2). Initialize firebase-tools in the project. Create the Firestore security rules file. Create the initial Firestore indexes file. Set up environment variables (.env.local for Vite, .env for Cloud Functions). Create a firebase service layer (src/services/firebase.ts) with initialized app, auth, db, and messaging instances.",
    "acceptance_criteria": [
      "Firebase project exists and is accessible via firebase CLI",
      "Anonymous auth is enabled in the Firebase console",
      "Firestore security rules file exists and deploys without errors",
      "Firebase service layer exports initialized instances: app, auth, db, messaging",
      "Environment variables are loaded correctly in both dev and build",
      ".env.local is in .gitignore"
    ],
    "test_first": "Write a test that imports the firebase service layer and verifies that app, auth, db, and messaging are defined (mock Firebase initialization).",
    "estimated_hours": 3,
    "dependencies": ["1.0.1"],
    "done": false
  },
  {
    "id": "1.0.4",
    "phase": 1,
    "feature": "setup",
    "title": "Design Tokens & Base Styles",
    "description": "Create the CSS design tokens file (src/styles/tokens.css) with all variables from the UX/UI Specification. Configure DaisyUI with a custom 'elderly' theme that uses the high-contrast color palette. Create a Tailwind plugin or preset that enforces minimum touch target sizes. Create base component styles: EasyCallButton (primary action), EasyCallCard (contact card), EasyCallText (accessible text with configurable size).",
    "acceptance_criteria": [
      "Design tokens CSS file exists with all variables from the spec",
      "DaisyUI 'elderly' theme uses WCAG AAA compliant colors",
      "EasyCallButton has minimum 56×56px touch target at all screen sizes",
      "EasyCallButton renders with ≥20px bold text",
      "EasyCallText respects the fontSize setting (normal/large/xlarge)",
      "All base components pass jest-axe accessibility audit"
    ],
    "test_first": "Write tests for each base component: verify minimum dimensions via computed styles, verify text sizes, verify ARIA attributes, verify jest-axe passes.",
    "estimated_hours": 4,
    "dependencies": ["1.0.1", "1.0.2"],
    "done": false
  },
  {
    "id": "1.1.1",
    "phase": 1,
    "feature": "F1",
    "title": "Contact List Store",
    "description": "Create a Zustand store (src/stores/contactStore.ts) that manages the elderly user's contact list. The store should: fetch contacts from Firestore on initialization, provide a sorted list (by displayOrder), support add/edit/remove operations that write to Firestore, and sync in real-time via onSnapshot listener. Include types: Contact (id, name, photoURL, jitsiRoomId, contactUserId, displayOrder).",
    "acceptance_criteria": [
      "Store initializes with an empty contact list",
      "fetchContacts() loads contacts from Firestore (mocked) and sorts by displayOrder",
      "addContact() writes to Firestore and updates local state",
      "removeContact() deletes from Firestore and updates local state",
      "Real-time onSnapshot listener updates the store when Firestore data changes",
      "Types are correctly defined and exported"
    ],
    "test_first": "Write unit tests for each store action using MSW to mock Firestore. Test: initial state is empty, fetchContacts populates the list sorted by displayOrder, addContact adds to both Firestore and local state, removeContact removes from both, onSnapshot callback updates local state.",
    "estimated_hours": 4,
    "dependencies": ["1.0.2", "1.0.3"],
    "done": false
  },
  {
    "id": "1.1.2",
    "phase": 1,
    "feature": "F1",
    "title": "Home Screen — Contact Photo Buttons",
    "description": "Implement the HomeScreen component (src/components/elderly/HomeScreen.tsx). Renders a vertical list of ContactCard components, one per contact. Each ContactCard shows: circular/rounded contact photo (80×80px min), contact name (≥20px bold), and the entire card is tappable (navigates to /call/:contactId). If no contacts exist, show the empty state message with pairing code. Include the settings gear icon (top-right, ≥48×48px).",
    "acceptance_criteria": [
      "AC-1.1: Contacts rendered as vertical list, each card ≥120px tall",
      "AC-1.2: Contact photo is circular, ≥80×80px",
      "AC-1.3: Contact name displayed in ≥20px bold sans-serif",
      "AC-1.4: All contacts visible or scrollable on 5.5-inch viewport",
      "AC-1.5: Tapping a card navigates to /call/:contactId",
      "AC-1.6: Empty state shows 'No contacts yet' message and pairing code",
      "AC-1.7: Settings gear icon is ≥48×48px and navigates to /settings",
      "AC-1.8: All touch targets ≥56×56px",
      "AC-1.9: All text passes WCAG AAA contrast check (jest-axe)"
    ],
    "test_first": "Write component tests: renders N contact cards for N contacts, each card has correct name text, tapping a card calls navigate('/call/contactId'), empty state renders when contacts=[], settings icon renders with correct size, jest-axe passes on the full component.",
    "estimated_hours": 5,
    "dependencies": ["1.0.4", "1.1.1"],
    "done": false
  },
  {
    "id": "1.2.1",
    "phase": 1,
    "feature": "F3",
    "title": "Camera/Mic Permission Check Hook",
    "description": "Create a custom hook (src/hooks/useMediaPermissions.ts) that checks and requests camera+microphone permissions. States: 'checking', 'granted', 'prompt', 'denied'. Uses navigator.mediaDevices.getUserMedia() and navigator.permissions.query(). Immediately releases the media stream after a successful check. Provides a retry() function for re-requesting after denial.",
    "acceptance_criteria": [
      "AC-3.1: Permission check resolves in <2 seconds (test with mock)",
      "AC-3.6: Media stream tracks are stopped immediately after successful check",
      "Hook returns status: 'checking' initially, then 'granted' or 'denied'",
      "retry() re-invokes getUserMedia and updates status",
      "If getUserMedia throws NotAllowedError, status is 'denied'",
      "If getUserMedia throws NotFoundError, status is 'no-device'"
    ],
    "test_first": "Write unit tests mocking navigator.mediaDevices: test granted path (mock resolves with stream, verify tracks stopped), test denied path (mock rejects with NotAllowedError), test no-device path, test retry resets state and re-invokes.",
    "estimated_hours": 3,
    "dependencies": ["1.0.2"],
    "done": false
  },
  {
    "id": "1.2.2",
    "phase": 1,
    "feature": "F3",
    "title": "Pre-Call Permission Screen",
    "description": "Create a PermissionCheck component (src/components/elderly/PermissionCheck.tsx) that wraps useMediaPermissions. Shows: a loading spinner during 'checking', a helper overlay ('Tap ALLOW when asked') during 'prompt', step-by-step recovery instructions during 'denied' (with Chrome Android screenshots), and auto-proceeds to the call when 'granted'. Includes a 'Try Again' button for the denied state.",
    "acceptance_criteria": [
      "AC-3.2: If permissions already granted, component renders nothing / auto-proceeds",
      "AC-3.3: Helper overlay shown with ≥20px text before browser prompt",
      "AC-3.4: Denied state shows recovery instructions with ≥18px text",
      "AC-3.5: 'Try Again' button calls retry() and returns to checking state",
      "Component passes jest-axe accessibility audit"
    ],
    "test_first": "Write component tests for each state: checking shows spinner, granted calls onReady callback, denied shows recovery text and Try Again button, Try Again click calls retry.",
    "estimated_hours": 4,
    "dependencies": ["1.0.4", "1.2.1"],
    "done": false
  },
  {
    "id": "1.3.1",
    "phase": 1,
    "feature": "F2",
    "title": "Jitsi IFrame API Loader",
    "description": "Create a service (src/services/jitsi.ts) that dynamically loads the Jitsi Meet external API script from JaaS CDN. Uses a promise-based loader that: checks if the script is already loaded, appends the script tag to <head>, resolves when the script loads, rejects on error. Provides a typed wrapper around JitsiMeetExternalAPI constructor and key methods.",
    "acceptance_criteria": [
      "loadJitsiApi() returns a promise that resolves when the script is loaded",
      "Calling loadJitsiApi() twice does not append a duplicate script tag",
      "If the script fails to load, the promise rejects with a descriptive error",
      "TypeScript types are defined for JitsiMeetExternalAPI (constructor options, commands, events)",
      "Types cover all events and commands listed in Section 9"
    ],
    "test_first": "Write unit tests: mock document.createElement and script onload/onerror. Test single load resolves, double load returns same promise, error rejects with message.",
    "estimated_hours": 3,
    "dependencies": ["1.0.2"],
    "done": false
  },
  {
    "id": "1.3.2",
    "phase": 1,
    "feature": "F2",
    "title": "JaaS JWT Token Cloud Function",
    "description": "Create a Firebase Cloud Function (functions/src/generateJitsiToken.ts) that generates JWT tokens for JaaS authentication. The function: requires Firebase auth (onCall), takes roomName and displayName as parameters, signs a JWT with the JaaS private key (RS256), returns the token. Set up the JaaS API key in Firebase Functions environment secrets.",
    "acceptance_criteria": [
      "Cloud Function deploys without errors",
      "Unauthenticated calls are rejected with 401",
      "Authenticated calls return a valid JWT string",
      "JWT payload contains correct fields: aud, iss, sub, room, context.user",
      "JWT expires in 2 hours",
      "JWT header contains kid and RS256 algorithm"
    ],
    "test_first": "Write unit tests for the token generation logic (extract to a pure function): verify JWT structure with jsonwebtoken.verify(), verify payload fields, verify expiration. Test the Cloud Function wrapper separately with a mock auth context.",
    "estimated_hours": 4,
    "dependencies": ["1.0.3"],
    "done": false
  },
  {
    "id": "1.3.3",
    "phase": 1,
    "feature": "F2",
    "title": "Call Screen — Jitsi Integration",
    "description": "Implement the CallScreen component (src/components/elderly/CallScreen.tsx). The component: loads Jitsi API via the loader service, fetches a JWT token from the Cloud Function, creates the JitsiMeetExternalAPI instance with the full config from Section 9, renders the IFrame in a full-screen container, renders custom overlay controls (mic toggle, camera toggle, end call), handles all events from the event table in Section 9, on call end navigates back to Home Screen.",
    "acceptance_criteria": [
      "AC-2.1: Jitsi IFrame auto-joins the room (mock API constructor called with correct options)",
      "AC-2.2: prejoinConfig.enabled is false in the config",
      "AC-2.3: Custom controls rendered: mic toggle, camera toggle, end call",
      "AC-2.4: End call button is red, ≥72px tall, displays 'End Call' text",
      "AC-2.5: Mic toggle shows 'Microphone ON' (green) or 'Microphone OFF' (red) based on state",
      "AC-2.6: End call calls api.dispose() and navigates to home",
      "AC-2.7: When participantLeft fires and room is empty, 'Call Ended' shown for 3s then navigate home",
      "All controls pass jest-axe audit"
    ],
    "test_first": "Write component tests using the Jitsi mock: verify API constructor options, verify toggleAudio command on mic button click, verify toggleVideo on camera click, verify hangup on end call click, verify navigation on readyToClose event, verify 'Call Ended' message on participantLeft with empty room.",
    "estimated_hours": 8,
    "dependencies": ["1.0.4", "1.2.2", "1.3.1", "1.3.2"],
    "done": false
  },
  {
    "id": "1.3.4",
    "phase": 1,
    "feature": "F2",
    "title": "Connection Quality Indicator",
    "description": "Create a ConnectionIndicator component that subscribes to Jitsi's connection quality stats and displays a simplified traffic-light indicator: green ('Connection good'), yellow ('Connection fair'), red ('Connection poor'). When quality drops to red, auto-reduce video to 180p via setVideoQuality command. Show a toast: 'Your internet is slow — we turned off video to keep the call working' when auto-degrading to audio-only.",
    "acceptance_criteria": [
      "AC-2.8: Green/yellow/red indicator displays with plain text label",
      "AC-2.9: Video auto-reduces to 180p when quality is poor",
      "Toast notification shown when auto-degrading",
      "Indicator is visible but non-intrusive (small, top of screen)",
      "Text label uses ≥16px font"
    ],
    "test_first": "Write tests using the Jitsi mock: emit connectionQuality events with varying quality levels, verify indicator color changes, verify setVideoQuality command called when quality drops below threshold.",
    "estimated_hours": 3,
    "dependencies": ["1.3.3"],
    "done": false
  },
  {
    "id": "1.4.1",
    "phase": 1,
    "feature": "F7",
    "title": "Elderly Settings Screen",
    "description": "Create a simple SettingsScreen component (src/components/elderly/SettingsScreen.tsx) with: font size selector (3 options with preview), pairing code display (links to F6), 'Add Contact' button, and a back button to Home Screen. All text ≥20px. Maximum 4 options visible.",
    "acceptance_criteria": [
      "AC-7.5: No more than 4 options visible on screen",
      "Font size selector shows 3 options with visual preview",
      "Selecting a font size updates the Zustand store and persists to Firestore",
      "Pairing code section displays the current code in ≥48px font",
      "'Add Contact' navigates to the add contact flow",
      "Back button returns to Home Screen",
      "All elements pass jest-axe accessibility audit"
    ],
    "test_first": "Write component tests: renders all 4 options, font size change updates store, pairing code displays, navigation works on button clicks.",
    "estimated_hours": 4,
    "dependencies": ["1.0.4", "1.1.1"],
    "done": false
  },
  {
    "id": "1.4.2",
    "phase": 1,
    "feature": "F7",
    "title": "Add Contact Flow (Elderly Self-Management)",
    "description": "Create an AddContact multi-step component (src/components/elderly/AddContact.tsx): Step 1 — enter contact name (large text input, ≥20px font). Step 2 — take or select a photo (HTML input with accept='image/*' and capture='user'). Step 3 — confirm and save. Generates a unique jitsiRoomId on save. Writes to Firestore via the contact store.",
    "acceptance_criteria": [
      "AC-7.1: Flow has exactly 3 steps",
      "AC-7.2: Text input uses ≥20px font",
      "AC-7.3: Photo capture uses device camera",
      "Name input is required, photo is optional",
      "On save, a jitsiRoomId is generated (easycall-{name}-{name}-{random})",
      "Contact is added to Firestore and appears on Home Screen",
      "User can go back at any step"
    ],
    "test_first": "Write component tests for each step: step 1 renders name input with correct font size, step 2 renders file input with capture attribute, step 3 shows confirmation, save button calls addContact with correct data including generated roomId.",
    "estimated_hours": 4,
    "dependencies": ["1.1.1", "1.0.4"],
    "done": false
  },
  {
    "id": "1.5.1",
    "phase": 1,
    "feature": "F5",
    "title": "Caregiver Dashboard — Basic Layout",
    "description": "Create the CaregiverDashboard component (src/components/caregiver/Dashboard.tsx). Shows a list of linked elderly users (fetched from Firestore). Each elderly user card shows: name, last seen timestamp, and buttons for 'Manage Contacts' and 'Call'. If no elderly users are linked, show a 'Link Elderly User' button that navigates to the pairing code entry.",
    "acceptance_criteria": [
      "AC-5.1: Lists all linked elderly users with last-seen timestamp",
      "Each elderly user card has 'Manage Contacts' and 'Call' buttons",
      "Empty state shows 'Link Elderly User' button",
      "'Manage Contacts' navigates to /caregiver/manage/:elderlyUserId",
      "'Call' triggers the outgoing call flow (covered in Phase 2)",
      "Standard (non-elderly) UI sizing — normal text and button sizes"
    ],
    "test_first": "Write component tests: renders N cards for N linked users, each card shows name and last-seen, empty state renders link button, manage button navigates correctly.",
    "estimated_hours": 4,
    "dependencies": ["1.0.3", "1.0.4"],
    "done": false
  },
  {
    "id": "1.5.2",
    "phase": 1,
    "feature": "F5",
    "title": "Caregiver Contact Management",
    "description": "Create a ManageContacts component (src/components/caregiver/ManageContacts.tsx) for a specific elderly user. Shows the elderly user's contact list. Provides: add contact (name + photo upload), edit contact (change name, change photo), remove contact (with confirmation), drag-to-reorder contacts (updates displayOrder). All changes write to the elderly user's Firestore contacts sub-collection.",
    "acceptance_criteria": [
      "AC-5.2: Add contact with name and photo upload",
      "AC-5.3: Changes sync within 5 seconds (Firestore write → elderly device onSnapshot)",
      "Contact list is editable: inline name edit, photo replace",
      "Remove contact requires confirmation dialog",
      "Drag-to-reorder updates displayOrder in Firestore",
      "Photo upload compresses images to ≤200KB before storing"
    ],
    "test_first": "Write component tests: add form renders and submits to Firestore, edit inline works, remove shows confirmation, reorder updates displayOrder values, photo upload triggers compression.",
    "estimated_hours": 6,
    "dependencies": ["1.1.1", "1.5.1"],
    "done": false
  },
  {
    "id": "1.6.1",
    "phase": 1,
    "feature": "setup",
    "title": "Routing & Role-Based Views",
    "description": "Set up React Router with BrowserRouter. Define routes: / (redirects based on role), /elderly (HomeScreen), /elderly/settings, /elderly/add-contact, /call/:contactId, /caregiver (Dashboard), /caregiver/manage/:elderlyUserId, /caregiver/pair. Create an AuthGuard component that: initializes Firebase Anonymous Auth on first load, fetches the user's role from Firestore, redirects to appropriate route. Create a RoleSelector component for first-time users to choose 'I am an elderly user' or 'I am a family caregiver'.",
    "acceptance_criteria": [
      "BrowserRouter is used (not HashRouter)",
      "Anonymous auth initializes silently on first load",
      "Users with role 'elderly' are redirected to /elderly",
      "Users with role 'caregiver' are redirected to /caregiver",
      "First-time users (no role in Firestore) see the RoleSelector",
      "RoleSelector has two large buttons with clear labels",
      "All routes are protected by AuthGuard"
    ],
    "test_first": "Write tests: AuthGuard renders children when authenticated, redirects when not, RoleSelector renders two buttons, clicking a role button writes to Firestore and redirects.",
    "estimated_hours": 5,
    "dependencies": ["1.0.3", "1.1.2", "1.5.1"],
    "done": false
  },
  {
    "id": "1.7.1",
    "phase": 1,
    "feature": "F8",
    "title": "PWA Manifest & Install Prompt",
    "description": "Configure vite-plugin-pwa with: app name 'EasyCall', short_name 'EasyCall', display: 'standalone', orientation: 'portrait', theme_color and background_color matching the elderly theme, icons at 192×192 and 512×512. Create an InstallPrompt component that intercepts the beforeinstallprompt event on Android and shows a custom large-button overlay: 'Install EasyCall for easier access' with an 'Install' button (≥72px).",
    "acceptance_criteria": [
      "AC-8.1: beforeinstallprompt is intercepted and deferred",
      "AC-8.1: Custom install overlay shown with ≥72px Install button",
      "PWA manifest contains all required fields",
      "Icons are generated at correct sizes",
      "Orientation is locked to portrait",
      "Service worker caches the app shell for offline loading"
    ],
    "test_first": "Write tests: manifest JSON has correct fields (parse the generated file), InstallPrompt component renders when beforeinstallprompt fires, Install button calls prompt() on the deferred event, component hides after install.",
    "estimated_hours": 4,
    "dependencies": ["1.0.1"],
    "done": false
  },
  {
    "id": "1.8.1",
    "phase": 1,
    "feature": "E2E",
    "title": "E2E Test: Elderly Makes a Call",
    "description": "Write a Playwright E2E test for the core happy path: elderly user opens app → sees contacts → taps a contact → permission check passes → Jitsi loads → call screen appears with controls → user ends call → returns to home. Uses fake media streams. Mocks Firebase with local emulator or MSW.",
    "acceptance_criteria": [
      "Test runs headlessly in CI (GitHub Actions)",
      "Test uses Pixel 7 device profile",
      "Test uses --use-fake-device-for-media-stream",
      "Test verifies: home screen renders contacts, navigation to call screen works, custom controls are visible, end call returns to home",
      "Test completes in <30 seconds"
    ],
    "test_first": "This IS the test. Write the Playwright test file first, verify it fails, then ensure all prior components support it.",
    "estimated_hours": 5,
    "dependencies": ["1.1.2", "1.3.3", "1.6.1"],
    "done": false
  },
  {
    "id": "2.1.1",
    "phase": 2,
    "feature": "F4",
    "title": "FCM Push Notification Setup",
    "description": "Configure Firebase Cloud Messaging for Web Push. Generate VAPID key pair. Create the custom service worker for background message handling (firebase-messaging-sw.js) integrated with vite-plugin-pwa's InjectManifest strategy. Implement the usePushNotifications hook that: requests notification permission, registers the FCM token, stores the token in the user's Firestore document, handles token refresh.",
    "acceptance_criteria": [
      "VAPID key is configured in .env.local",
      "Service worker receives background messages (test with Firebase console)",
      "usePushNotifications hook requests permission and returns the token",
      "Token is stored in users/{userId}.pushTokens array in Firestore",
      "Token refresh is handled (old token removed, new token added)"
    ],
    "test_first": "Write unit tests for usePushNotifications: mock getToken to return a token, verify updateDoc called with arrayUnion, mock token refresh event, verify arrayRemove + arrayUnion.",
    "estimated_hours": 6,
    "dependencies": ["1.0.3"],
    "done": false
  },
  {
    "id": "2.1.2",
    "phase": 2,
    "feature": "F4",
    "title": "Incoming Call Signaling (Firestore + Cloud Function)",
    "description": "Implement the call signaling flow: Create a useIncomingCall hook (src/hooks/useIncomingCall.ts) that subscribes to users/{elderlyUserId}/incomingCall via onSnapshot. When status changes to 'ringing', trigger the in-app ringing UI. Create the Cloud Function (onIncomingCall) that triggers on incomingCall document write and sends FCM push notification. Create initiateCall service function that writes the incomingCall document from the caller's side.",
    "acceptance_criteria": [
      "AC-4.1: In-app ringing UI appears within 2 seconds of Firestore write (test with mock)",
      "AC-4.5: Cloud Function sends FCM notification when status is 'ringing'",
      "initiateCall() writes correct fields to the elderly user's incomingCall document",
      "Hook cleans up listener on unmount",
      "Hook ignores stale calls (timestamp older than 60 seconds)"
    ],
    "test_first": "Write unit tests: mock onSnapshot to emit 'ringing' status → verify ringing state set, mock onSnapshot to emit 'ended' → verify ringing stopped. Write Cloud Function test: verify FCM sendEachForMulticast called with correct tokens and data.",
    "estimated_hours": 6,
    "dependencies": ["2.1.1", "1.0.3"],
    "done": false
  },
  {
    "id": "2.1.3",
    "phase": 2,
    "feature": "F4",
    "title": "Incoming Call Full-Screen Answer UI",
    "description": "Create an IncomingCallScreen component (src/components/elderly/IncomingCallScreen.tsx). Renders full-screen over the app when an incoming call is detected. Shows: caller's photo (≥120×120px), caller's name (≥24px bold), pulsing animation, 'Answer' button (green, ≥80px tall), 'Decline' button (smaller, red). Plays ringtone audio on loop. Auto-dismisses after 60 seconds (missed call). On answer: navigate to /call/:roomId. On decline: write status 'declined' to Firestore.",
    "acceptance_criteria": [
      "AC-4.2: Caller photo ≥120×120px, name ≥24px bold, green Answer ≥80px",
      "AC-4.3: Decline button is smaller and positioned away from Answer",
      "AC-4.4: Ringtone audio plays on repeat",
      "AC-4.7: After 60s timeout, screen dismisses and shows 'Missed call' banner on Home Screen",
      "AC-4.8: Call logged in callHistory (any outcome)",
      "Answer button navigates to call screen",
      "Decline button writes 'declined' status and dismisses"
    ],
    "test_first": "Write component tests: verify photo, name, and button sizes. Verify Answer click navigates. Verify Decline click writes to Firestore. Mock timers to verify 60s auto-dismiss. Verify callHistory written on each outcome.",
    "estimated_hours": 6,
    "dependencies": ["2.1.2", "1.3.3"],
    "done": false
  },
  {
    "id": "2.2.1",
    "phase": 2,
    "feature": "F6",
    "title": "Pairing Code Generation & Display",
    "description": "Create a usePairingCode hook (src/hooks/usePairingCode.ts) that: generates a random 6-digit numeric code, writes it to Firestore pairingCodes/{code} with the elderly user's ID and 10-minute TTL, auto-refreshes every 10 minutes, provides the current code and a countdown timer. Create a PairingCodeDisplay component that shows the code in ≥48px font with the countdown.",
    "acceptance_criteria": [
      "AC-6.1: Code displayed in ≥48px font",
      "AC-6.2: Code auto-refreshes every 10 minutes with visible countdown",
      "Code is 6 digits, written to Firestore with correct fields",
      "Expired codes have expiresAt set to 10 minutes from creation",
      "Component shows remaining time in MM:SS format"
    ],
    "test_first": "Write tests: hook generates 6-digit string, writes to Firestore, countdown decrements, auto-refresh triggers at 0. Component renders code at correct size, countdown updates.",
    "estimated_hours": 4,
    "dependencies": ["1.0.3"],
    "done": false
  },
  {
    "id": "2.2.2",
    "phase": 2,
    "feature": "F6",
    "title": "Pairing Code Entry & Linking (Caregiver Side)",
    "description": "Create a PairElderlyUser component (src/components/caregiver/PairElderlyUser.tsx) with a 6-digit numeric input. On submit: calls a Cloud Function (validatePairingCode) that checks Firestore for the code, verifies it's not expired or used, creates the bidirectional caregiver link (writes to both users' documents), marks the code as used. Shows success/error feedback.",
    "acceptance_criteria": [
      "AC-6.3: Link established within 5 seconds of code entry",
      "AC-6.4: Expired code shows clear error message",
      "AC-6.4: Already-used code shows clear error message",
      "AC-6.5: Both devices show confirmation after successful pairing",
      "AC-6.6: Elderly user can have multiple caregivers",
      "AC-6.7: Caregiver can link multiple elderly users",
      "Cloud Function creates caregivers sub-document on both users"
    ],
    "test_first": "Write Cloud Function tests: valid code succeeds, expired code fails, used code fails. Write component tests: submit calls function, success shows confirmation, error shows message.",
    "estimated_hours": 5,
    "dependencies": ["2.2.1", "1.5.1"],
    "done": false
  },
  {
    "id": "2.3.1",
    "phase": 2,
    "feature": "F5",
    "title": "Caregiver Settings Management",
    "description": "Extend the caregiver dashboard with a settings panel for each linked elderly user. Settings include: font size (normal/large/xlarge), theme (light/dark/high-contrast), ringtone volume (slider). Changes write to the elderly user's Firestore settings field and sync in real-time.",
    "acceptance_criteria": [
      "AC-5.4: Font size change reflected on elderly device on next app open",
      "Settings panel shows current values loaded from Firestore",
      "Font size, theme, and ringtone volume all persist to Firestore",
      "Changes use optimistic updates (immediate UI feedback)"
    ],
    "test_first": "Write component tests: renders current settings from mock Firestore, changing font size calls updateDoc, verify optimistic UI update.",
    "estimated_hours": 3,
    "dependencies": ["1.5.1"],
    "done": false
  },
  {
    "id": "2.4.1",
    "phase": 2,
    "feature": "F8",
    "title": "Onboarding Flow",
    "description": "Create a multi-step OnboardingFlow component (src/components/shared/OnboardingFlow.tsx). Steps: (1) Welcome screen with app description, (2) PWA install prompt, (3) Camera/mic permission request, (4) Notification permission request, (5) Pairing code display (if elderly) or pairing code entry (if caregiver). Each step has ≥20px text and ≥72px buttons. Steps are skippable. Completion state persisted to Firestore (not just localStorage).",
    "acceptance_criteria": [
      "AC-8.3: All text ≥20px, all buttons ≥72px",
      "AC-8.4: Each step has a 'Skip' option",
      "AC-8.5: onboardingComplete flag saved to Firestore",
      "AC-8.6: Notification permission requested with pre-prompt explanation",
      "Flow shows only once (subsequent launches skip to Home Screen)",
      "Flow adapts based on role (elderly vs caregiver)"
    ],
    "test_first": "Write component tests for each step: renders correct content, skip advances to next step, final step writes onboardingComplete=true to Firestore, subsequent render skips onboarding if flag is true.",
    "estimated_hours": 6,
    "dependencies": ["1.2.2", "1.7.1", "2.1.1", "2.2.1"],
    "done": false
  },
  {
    "id": "2.5.1",
    "phase": 2,
    "feature": "E2E",
    "title": "E2E Test: Incoming Call Flow",
    "description": "Write a Playwright E2E test simulating an incoming call: seed Firestore with an incomingCall document (status: ringing) → verify the ringing screen appears → tap Answer → verify call screen loads → end call → verify return to home + call history entry. Uses two browser contexts to simulate caller and receiver.",
    "acceptance_criteria": [
      "Test runs in CI with Firebase emulator",
      "Ringing screen appears after Firestore write",
      "Answer button leads to call screen",
      "End call returns to home",
      "Call history entry is created"
    ],
    "test_first": "This IS the test.",
    "estimated_hours": 5,
    "dependencies": ["2.1.3", "1.8.1"],
    "done": false
  },
  {
    "id": "3.1.1",
    "phase": 3,
    "feature": "F10",
    "title": "Auto-Rejoin on Disconnect",
    "description": "Implement disconnect recovery: on page load/mount, check Firestore for an activeCall document with status 'active' and timestamp within last 5 minutes. If found, show a 'Return to call with [Name]?' prompt with ≥72px green button. If user doesn't act within 30 seconds, mark call as ended. Add beforeunload warning during active calls.",
    "acceptance_criteria": [
      "AC-10.1: Active call detected on page load → rejoin prompt shown",
      "AC-10.2: Rejoin button is ≥72px green",
      "AC-10.3: Auto-dismiss after 30 seconds, call marked ended",
      "AC-10.4: beforeunload event fires during active calls"
    ],
    "test_first": "Write tests: mock Firestore with active call doc → verify prompt renders, mock stale call (>5min) → verify no prompt, verify 30s timeout marks call ended, verify beforeunload handler registered during call.",
    "estimated_hours": 4,
    "dependencies": ["1.3.3"],
    "done": false
  },
  {
    "id": "3.2.1",
    "phase": 3,
    "feature": "F9",
    "title": "Call History Screen",
    "description": "Create a CallHistory component (src/components/elderly/CallHistory.tsx) showing the last 30 days of calls. Each entry shows: small contact photo, contact name, date/time, duration, and outcome badge (completed=green, missed=red, declined=gray). Missed calls have a subtle red background. Tapping an entry initiates a call to that contact. Paginated with 'Show more' button after 20 entries.",
    "acceptance_criteria": [
      "AC-9.1: Shows last 30 days of calls",
      "AC-9.2: Each entry has photo, name, date/time, duration, outcome",
      "AC-9.3: Missed calls highlighted with red indicator",
      "AC-9.4: Tapping entry initiates call",
      "AC-9.5: 'Show more' after 20 entries",
      "Empty state shows 'No calls yet' message"
    ],
    "test_first": "Write component tests: renders N entries from mock data, missed calls have red styling, tap navigates to call screen, pagination shows after 20, empty state renders message.",
    "estimated_hours": 4,
    "dependencies": ["1.1.1"],
    "done": false
  },
  {
    "id": "3.3.1",
    "phase": 3,
    "feature": "security",
    "title": "Optional Biometric/PIN Lock",
    "description": "Create an AppLock component that, when enabled by the caregiver, requires authentication before showing the app content. Supports: WebAuthn/passkey (fingerprint, face) as primary, 4-digit PIN as fallback. The caregiver enables/disables the lock and sets the PIN from their dashboard. Lock engages when the app is opened or after 5 minutes of inactivity. EXCEPTION: incoming call notification bypasses the lock (shows answer screen directly).",
    "acceptance_criteria": [
      "WebAuthn authentication works on supported devices",
      "4-digit PIN input uses large numeric keypad (≥56px buttons)",
      "Lock engages on app open and after 5-minute inactivity",
      "Incoming calls bypass the lock screen",
      "Caregiver can enable/disable lock and set PIN remotely",
      "3 failed PIN attempts show 30-second cooldown"
    ],
    "test_first": "Write tests: lock screen renders when enabled, correct PIN dismisses lock, wrong PIN shows error, 3 wrong attempts shows cooldown, incoming call bypasses lock, inactivity timer triggers lock.",
    "estimated_hours": 6,
    "dependencies": ["2.3.1", "2.1.3"],
    "done": false
  },
  {
    "id": "3.4.1",
    "phase": 3,
    "feature": "accessibility",
    "title": "Full Accessibility Audit & Fixes",
    "description": "Run a comprehensive accessibility audit across all screens: automated (Lighthouse, axe-core via jest-axe), semi-automated (WAVE browser extension), and manual (keyboard navigation, screen reader with TalkBack on Android). Fix all identified issues. Ensure all screens meet WCAG AAA for contrast and WCAG AA for all other criteria. Document the audit results.",
    "acceptance_criteria": [
      "Lighthouse Accessibility score ≥95 on all routes",
      "axe-core reports zero violations on all components",
      "All interactive elements reachable via keyboard (Tab/Enter)",
      "TalkBack (Android) reads all screen content meaningfully",
      "Focus management: focus moves to modal content when opened, returns when closed",
      "Skip-to-content link is available on pages with repetitive navigation",
      "Audit report document created in /docs"
    ],
    "test_first": "Run existing jest-axe tests as baseline. Add Lighthouse CI to GitHub Actions with score threshold of 95. Manual testing is documented as a checklist.",
    "estimated_hours": 8,
    "dependencies": ["All Phase 1 and 2 tasks"],
    "done": false
  },
  {
    "id": "3.5.1",
    "phase": 3,
    "feature": "i18n",
    "title": "Multi-Language Support",
    "description": "Integrate react-i18next. Extract all user-facing strings to translation JSON files. Create initial translations for: English (default), Spanish, Hebrew, Russian (common languages for elderly populations). The caregiver can set the language from the settings panel. The elderly user sees the app in their configured language.",
    "acceptance_criteria": [
      "All user-facing strings use t('key') from react-i18next",
      "Language files exist for en, es, he, ru",
      "Caregiver can change language setting",
      "Language change persists and applies on next load",
      "RTL layout support for Hebrew (dir='rtl' on html element)",
      "Language bundles are lazy-loaded (not in main bundle)"
    ],
    "test_first": "Write tests: component renders correct text for each language, RTL class applied for Hebrew, language switch updates rendered text.",
    "estimated_hours": 6,
    "dependencies": ["2.3.1"],
    "done": false
  },
  {
    "id": "3.6.1",
    "phase": 3,
    "feature": "E2E",
    "title": "E2E Test: Full Caregiver Flow",
    "description": "Write a Playwright E2E test for the caregiver flow: register as caregiver → enter pairing code → link elderly user → add a contact (with photo) → change font size setting → call elderly user. Verify all actions persist and sync correctly.",
    "acceptance_criteria": [
      "Test runs in CI with Firebase emulator",
      "Caregiver links with elderly user via pairing code",
      "Added contact appears on elderly user's home screen (second browser context)",
      "Font size change reflects on elderly user's app",
      "Call initiation triggers incoming call on elderly user's side"
    ],
    "test_first": "This IS the test.",
    "estimated_hours": 6,
    "dependencies": ["2.5.1", "2.2.2", "2.3.1"],
    "done": false
  },
  {
    "id": "3.7.1",
    "phase": 3,
    "feature": "deploy",
    "title": "Production Deployment & Monitoring",
    "description": "Deploy the full application to production: Cloudflare Pages (PWA), Firebase (backend), JaaS (video). Set up Sentry for error tracking (free tier). Configure Firebase Performance Monitoring. Set up Firebase usage alerts at 50% of free tier. Create a deployment runbook document. Verify PWA Lighthouse score in production.",
    "acceptance_criteria": [
      "PWA accessible at production URL with valid HTTPS",
      "Service worker caches app shell — app loads offline (minus Firebase/Jitsi)",
      "Sentry captures and reports JavaScript errors",
      "Firebase console shows usage metrics",
      "Lighthouse PWA audit passes (installable, offline-capable, fast)",
      "Deployment runbook document exists in /docs",
      "Custom domain configured and working"
    ],
    "test_first": "Run Lighthouse CI against production URL. Verify Sentry receives a test error. Verify Firebase emulator tests pass against production rules.",
    "estimated_hours": 5,
    "dependencies": ["All previous tasks"],
    "done": false
  }
]
```

---

## Appendix A: Glossary

| Term           | Definition                                                                 |
| -------------- | -------------------------------------------------------------------------- |
| **JaaS**       | Jitsi as a Service — 8x8's managed Jitsi infrastructure with free tier     |
| **IFrame API** | Jitsi's JavaScript API for embedding video calls in an iframe              |
| **FCM**        | Firebase Cloud Messaging — Google's push notification service              |
| **PWA**        | Progressive Web Application — web app installable to Home Screen           |
| **VAPID**      | Voluntary Application Server Identification — key pair for Web Push        |
| **JWT**        | JSON Web Token — used for JaaS authentication                              |
| **MAU**        | Monthly Active Users                                                       |
| **SFU**        | Selective Forwarding Unit — Jitsi's video routing architecture             |
| **TURN/STUN**  | NAT traversal protocols required for WebRTC connectivity                   |
| **TDD**        | Test-Driven Development — write tests before implementation                |
| **WCAG AAA**   | Web Content Accessibility Guidelines Level AAA — highest contrast standard |

## Appendix B: Reference Links

- Jitsi IFrame API docs: https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe/
- Jitsi IFrame API commands: https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe-commands/
- JaaS portal: https://jaas.8x8.vc
- Firebase Web Push guide: https://firebase.google.com/docs/cloud-messaging/js/client
- vite-plugin-pwa: https://vite-pwa-org.netlify.app/
- WCAG AAA contrast requirements: https://www.w3.org/WAI/WCAG21/Understanding/contrast-enhanced.html
- Jitsi self-hosting guide: https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-quickstart/
- Docker Jitsi Meet: https://github.com/jitsi/docker-jitsi-meet
