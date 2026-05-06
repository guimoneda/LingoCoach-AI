# LingoCoach AI

Improve your English fluency and pronunciation with real-time AI feedback.

## Features

- **Real-time Transcription**: Transcribe your speech as you talk.
- **AI Feedback**: Get scores on fluency and detailed tips on pronunciation, grammar, and vocabulary.
- **Progress Tracking**: Keep a history of your evaluations to track your improvement.
- **Secure Authentication**: Google Authentication with secure Firestore rules.

## Setup

### Prerequisites

- Node.js (v18+)
- A Firebase project

### Environment Variables

Create a `.env` file (or set these in your hosting environment) based on `.env.example`:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
VITE_FIREBASE_FIRESTORE_DATABASE_ID=(default)
GEMINI_API_KEY=your_gemini_api_key
```

### Installation

1. Clone the repository.
2. Run `npm install`.
3. Run `npm run dev` to start the development server.

### Firestore Rules

Deploy the rules found in `firestore.rules` to your Firebase project.

```bash
firebase deploy --only firestore:rules
```
