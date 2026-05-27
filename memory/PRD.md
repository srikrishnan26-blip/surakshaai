# SurakshaAI — PRD

## Overview
SurakshaAI is a mobile women's safety app (Expo / React Native + FastAPI + MongoDB) providing real-time tracking, AI route risk analysis, voice-activated and one-tap SOS alerts, emergency contact management, and SMS notification of contacts during SOS.

## Tech Stack
- **Frontend**: Expo Router (React Native, TypeScript), AsyncStorage
- **Backend**: FastAPI (Python), MongoDB (motor), emergentintegrations, **Twilio SMS**
- **AI**: OpenAI gpt-4o-mini (route risk), whisper-1 (voice SOS) via Emergent LLM key

## Core Features
- Onboarding with name (creates server-side user or local fallback)
- Emergency Contacts CRUD (offline-first, syncs with backend)
- AI-powered Route Risk analysis
- SOS Alerts (manual + voice-triggered) — **now sends real SMS via Twilio**
- Live tracking updates
- Safe Locations directory (police, hospital, shelter, fire)

## Recent Changes
- 2026-05-21: Imported codebase from https://github.com/srikrishnan26-blip/surakshaai
- 2026-05-21: **Bug fix** — Adding emergency contacts manually no longer fails.
  - Offline-first contacts: saved to AsyncStorage immediately, then synced to backend.
  - Modal closes right after local save — no longer waits on backend response.
  - Ensures `user_id` always exists.
  - File: `frontend/app/(tabs)/contacts.tsx`.
- 2026-05-27: **Feature** — Twilio SMS integration for SOS alerts.
  - `POST /api/sos` and `POST /api/voice-sos` now dispatch SMS to every saved emergency contact in parallel with the user's name, custom message, and a Google Maps link to their live location.
  - Response now includes `sms_sent`, `sms_failed`, and per-contact `sms_results`.
  - Twilio creds in `backend/.env`: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`.
  - Trial-account limitation: SMS only delivered to phone numbers verified in the Twilio console.
  - File: `backend/server.py`.

## Open Issue
- The provided Twilio phone number `+19121551510` returned Twilio error `21659` ("not a Twilio phone number on this account"). User to verify the correct "From" number from console.twilio.com → Phone Numbers → Active Numbers and resupply.

## Backlog / Next Items
- Verify correct Twilio "From" number and re-test SMS dispatch end-to-end
- Background sync to push any `local-*` contacts to the backend when network returns
- Phone number format validation (E.164) at the input layer
- Import contacts from device contact list (one-tap onboarding)
- Push notifications for SOS acknowledgement
- Upgrade Twilio out of trial to remove the verified-numbers restriction
