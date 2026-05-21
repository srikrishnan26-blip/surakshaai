# SurakshaAI — PRD

## Overview
SurakshaAI is a mobile women's safety app (Expo / React Native + FastAPI + MongoDB) providing real-time tracking, AI route risk analysis, voice-activated and one-tap SOS alerts, and emergency contact management.

## Tech Stack
- **Frontend**: Expo Router (React Native, TypeScript), AsyncStorage
- **Backend**: FastAPI (Python), MongoDB (motor), emergentintegrations
- **AI**: OpenAI gpt-4o-mini (route risk), whisper-1 (voice SOS) via Emergent LLM key

## Core Features
- Onboarding with name (creates server-side user or local fallback)
- Emergency Contacts CRUD (offline-first, syncs with backend)
- AI-powered Route Risk analysis
- SOS Alerts (manual + voice-triggered)
- Live tracking updates
- Safe Locations directory (police, hospital, shelter, fire)

## Recent Changes
- 2026-05-21: Imported codebase from https://github.com/srikrishnan26-blip/surakshaai
- 2026-05-21: **Bug fix** — Adding emergency contacts manually no longer fails.
  - Made the contacts flow **offline-first**: contact is stored to AsyncStorage immediately, then synced to backend in the background. If backend sync fails, the contact remains saved locally and the user sees no error.
  - Ensures `user_id` always exists (auto-creates a local one if the user reaches contacts before completing onboarding).
  - Load merges local + remote contacts so the list is never empty when backend is unreachable.
  - Delete is also offline-first — backend delete only attempted for server-side contact IDs.
  - File changed: `frontend/app/(tabs)/contacts.tsx`.

## Backlog / Next Items
- Background sync job to push any `local-*` contacts to the backend when network returns
- Phone number format validation (E.164) on input
- Import contacts from device contact list
- SMS dispatch to contacts on real SOS (Twilio integration)
- Push notifications for SOS acknowledgement
