from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import tempfile
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone
from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai import OpenAISpeechToText
from twilio.rest import Client as TwilioClient
from twilio.base.exceptions import TwilioRestException
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Emergent LLM key
EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']

# Twilio SMS client (lazy-initialized so backend still boots if credentials are missing)
TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID', '')
TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN', '')
TWILIO_PHONE_NUMBER = os.environ.get('TWILIO_PHONE_NUMBER', '')
twilio_client = (
    TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN
    else None
)


def _send_sms_sync(to_number: str, body: str) -> dict:
    """Synchronous Twilio send used inside a thread."""
    if not twilio_client or not TWILIO_PHONE_NUMBER:
        return {"to": to_number, "status": "skipped", "error": "Twilio not configured"}
    try:
        msg = twilio_client.messages.create(body=body, from_=TWILIO_PHONE_NUMBER, to=to_number)
        return {"to": to_number, "status": msg.status, "sid": msg.sid}
    except TwilioRestException as e:
        return {"to": to_number, "status": "failed", "error": f"{e.code}: {e.msg}"}
    except Exception as e:
        return {"to": to_number, "status": "failed", "error": str(e)}


async def send_sos_sms(contacts: list, user_name: str, latitude: float, longitude: float, custom_message: str = "") -> list:
    """Send SOS SMS to all emergency contacts in parallel threads."""
    if not contacts:
        return []
    map_link = f"https://maps.google.com/?q={latitude},{longitude}"
    base_body = (
        f"🚨 SOS Alert from {user_name or 'SurakshaAI user'}!\n"
        f"They need help. Location: {map_link}\n"
    )
    if custom_message:
        base_body += f"Message: {custom_message}\n"
    base_body += "— Sent via SurakshaAI"

    loop = asyncio.get_event_loop()
    tasks = [
        loop.run_in_executor(None, _send_sms_sync, c["phone"], base_body)
        for c in contacts
        if c.get("phone")
    ]
    results = await asyncio.gather(*tasks, return_exceptions=False)
    return results

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ── Models ──

class UserCreate(BaseModel):
    name: str

class UserResponse(BaseModel):
    user_id: str
    name: str
    created_at: str

class ContactCreate(BaseModel):
    user_id: str
    name: str
    phone: str
    relation: str = ""

class ContactResponse(BaseModel):
    contact_id: str
    user_id: str
    name: str
    phone: str
    relation: str
    created_at: str

class RouteRiskRequest(BaseModel):
    destination: str
    origin: Optional[str] = "Current Location"
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class RouteRiskResponse(BaseModel):
    risk: str
    score: int
    summary: str
    tips: List[str]
    safe_alternatives: List[str]

class SOSRequest(BaseModel):
    user_id: str
    latitude: float
    longitude: float
    message: str = ""

class SOSResponse(BaseModel):
    alert_id: str
    status: str
    contacts_notified: int
    sms_sent: int = 0
    sms_failed: int = 0
    sms_results: List[dict] = []
    timestamp: str

class TrackingUpdate(BaseModel):
    user_id: str
    latitude: float
    longitude: float
    destination: str = ""

class SafeLocation(BaseModel):
    location_id: str
    name: str
    type: str
    latitude: float
    longitude: float
    address: str
    phone: str = ""

# ── Routes ──

@api_router.get("/")
async def root():
    return {"message": "SurakshaAI API is running"}

# User
@api_router.post("/user", response_model=UserResponse)
async def create_user(data: UserCreate):
    user_id = str(uuid.uuid4())
    user = {
        "user_id": user_id,
        "name": data.name,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    return UserResponse(user_id=user["user_id"], name=user["name"], created_at=user["created_at"])

@api_router.get("/user/{user_id}", response_model=UserResponse)
async def get_user(user_id: str):
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(**user)

# Emergency Contacts
@api_router.post("/contacts", response_model=ContactResponse)
async def add_contact(data: ContactCreate):
    contact_id = str(uuid.uuid4())
    contact = {
        "contact_id": contact_id,
        "user_id": data.user_id,
        "name": data.name,
        "phone": data.phone,
        "relation": data.relation,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.contacts.insert_one(contact)
    return ContactResponse(**{k: v for k, v in contact.items() if k != "_id"})

@api_router.get("/contacts/{user_id}", response_model=List[ContactResponse])
async def get_contacts(user_id: str):
    contacts = await db.contacts.find({"user_id": user_id}, {"_id": 0}).to_list(100)
    return [ContactResponse(**c) for c in contacts]

@api_router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str):
    result = await db.contacts.delete_one({"contact_id": contact_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"status": "deleted", "contact_id": contact_id}

# AI Route Risk Analysis
@api_router.post("/route-risk", response_model=RouteRiskResponse)
async def analyze_route_risk(data: RouteRiskRequest):
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"route-{uuid.uuid4()}",
            system_message="""You are a safety analysis AI for a women's safety app called SurakshaAI. 
Your job is to analyze travel routes and provide safety assessments.
You MUST respond in EXACTLY this JSON format, no other text:
{
  "risk": "Low" or "Moderate" or "High",
  "score": number between 1-100 (100 = safest),
  "summary": "brief 1-2 sentence safety summary",
  "tips": ["tip1", "tip2", "tip3"],
  "safe_alternatives": ["alternative1", "alternative2"]
}
Consider factors like: time of day, area reputation, lighting, crowd density, transport options.
Always provide actionable safety tips."""
        )
        chat.with_model("openai", "gpt-4o-mini")

        prompt = f"Analyze the safety of traveling from {data.origin} to {data.destination}."
        if data.latitude and data.longitude:
            prompt += f" Current coordinates: ({data.latitude}, {data.longitude})."
        prompt += " Respond ONLY with valid JSON."

        msg = UserMessage(text=prompt)
        response = await chat.send_message(msg)
        
        import json
        # Try to parse JSON from response
        response_text = response.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
        
        result = json.loads(response_text)
        
        return RouteRiskResponse(
            risk=result.get("risk", "Moderate"),
            score=result.get("score", 50),
            summary=result.get("summary", "Analysis complete"),
            tips=result.get("tips", ["Stay alert", "Share your location"]),
            safe_alternatives=result.get("safe_alternatives", [])
        )
    except Exception as e:
        logger.error(f"AI analysis error: {e}")
        return RouteRiskResponse(
            risk="Moderate",
            score=50,
            summary="Unable to perform full AI analysis. General safety precautions recommended.",
            tips=["Share your live location with someone you trust", "Stay in well-lit areas", "Keep your phone charged"],
            safe_alternatives=["Consider using main roads", "Use public transport when possible"]
        )

# SOS Alert
@api_router.post("/sos", response_model=SOSResponse)
async def trigger_sos(data: SOSRequest):
    alert_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()
    
    alert = {
        "alert_id": alert_id,
        "user_id": data.user_id,
        "latitude": data.latitude,
        "longitude": data.longitude,
        "message": data.message,
        "timestamp": timestamp,
        "status": "active",
    }
    await db.sos_alerts.insert_one(alert)
    
    # Get contacts to notify
    contacts = await db.contacts.find({"user_id": data.user_id}, {"_id": 0}).to_list(100)

    # Get user name for SMS personalization
    user = await db.users.find_one({"user_id": data.user_id}, {"_id": 0})
    user_name = user["name"] if user else ""

    # Dispatch SMS to every contact via Twilio
    sms_results = await send_sos_sms(
        contacts=contacts,
        user_name=user_name,
        latitude=data.latitude,
        longitude=data.longitude,
        custom_message=data.message,
    )
    sent_count = sum(1 for r in sms_results if r.get("status") not in ("failed", "skipped"))
    failed_count = sum(1 for r in sms_results if r.get("status") in ("failed", "skipped"))

    logger.warning(
        f"SOS ALERT: User {data.user_id} at ({data.latitude}, {data.longitude}) — "
        f"SMS sent={sent_count}, failed={failed_count}"
    )

    return SOSResponse(
        alert_id=alert_id,
        status="active",
        contacts_notified=len(contacts),
        sms_sent=sent_count,
        sms_failed=failed_count,
        sms_results=sms_results,
        timestamp=timestamp,
    )

@api_router.get("/sos/{user_id}")
async def get_sos_alerts(user_id: str):
    alerts = await db.sos_alerts.find({"user_id": user_id}, {"_id": 0}).sort("timestamp", -1).to_list(50)
    return alerts

# Tracking
@api_router.post("/tracking")
async def update_tracking(data: TrackingUpdate):
    tracking = {
        "tracking_id": str(uuid.uuid4()),
        "user_id": data.user_id,
        "latitude": data.latitude,
        "longitude": data.longitude,
        "destination": data.destination,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await db.tracking.insert_one(tracking)
    return {"status": "updated"}

# Safe Locations
@api_router.get("/safe-locations", response_model=List[SafeLocation])
async def get_safe_locations(lat: float = 0, lng: float = 0):
    # Return safe locations near coordinates
    locations = await db.safe_locations.find({"_id": 0}).to_list(100)
    if not locations:
        # Seed default safe locations if none exist
        defaults = [
            {"location_id": str(uuid.uuid4()), "name": "Central Police Station", "type": "police", "latitude": lat + 0.005, "longitude": lng + 0.003, "address": "Main Road", "phone": "100"},
            {"location_id": str(uuid.uuid4()), "name": "City Hospital", "type": "hospital", "latitude": lat - 0.004, "longitude": lng + 0.006, "address": "Hospital Road", "phone": "108"},
            {"location_id": str(uuid.uuid4()), "name": "Women Help Center", "type": "shelter", "latitude": lat + 0.007, "longitude": lng - 0.002, "address": "Help Street", "phone": "1091"},
            {"location_id": str(uuid.uuid4()), "name": "Fire Station", "type": "fire", "latitude": lat - 0.006, "longitude": lng - 0.005, "address": "Fire Lane", "phone": "101"},
            {"location_id": str(uuid.uuid4()), "name": "District Hospital", "type": "hospital", "latitude": lat + 0.009, "longitude": lng + 0.008, "address": "Medical College Road", "phone": "108"},
            {"location_id": str(uuid.uuid4()), "name": "Women Police Station", "type": "police", "latitude": lat - 0.003, "longitude": lng + 0.009, "address": "Women Safety Road", "phone": "1091"},
        ]
        for loc in defaults:
            await db.safe_locations.insert_one(loc)
        return [SafeLocation(**{k: v for k, v in loc.items() if k != "_id"}) for loc in defaults]
    
    return [SafeLocation(**{k: v for k, v in loc.items() if k != "_id"}) for loc in locations]

@api_router.post("/safe-locations/seed")
async def seed_safe_locations(lat: float = 28.6139, lng: float = 77.2090):
    """Seed safe locations around given coordinates"""
    await db.safe_locations.delete_many({})
    locations = [
        {"location_id": str(uuid.uuid4()), "name": "Central Police Station", "type": "police", "latitude": lat + 0.005, "longitude": lng + 0.003, "address": "Main Road, City Center", "phone": "100"},
        {"location_id": str(uuid.uuid4()), "name": "City General Hospital", "type": "hospital", "latitude": lat - 0.004, "longitude": lng + 0.006, "address": "Hospital Road", "phone": "108"},
        {"location_id": str(uuid.uuid4()), "name": "Women Help Center", "type": "shelter", "latitude": lat + 0.007, "longitude": lng - 0.002, "address": "Help Street", "phone": "1091"},
        {"location_id": str(uuid.uuid4()), "name": "Fire & Rescue Station", "type": "fire", "latitude": lat - 0.006, "longitude": lng - 0.005, "address": "Fire Lane", "phone": "101"},
        {"location_id": str(uuid.uuid4()), "name": "District Medical Center", "type": "hospital", "latitude": lat + 0.009, "longitude": lng + 0.008, "address": "Medical College Road", "phone": "108"},
        {"location_id": str(uuid.uuid4()), "name": "Women Police Station", "type": "police", "latitude": lat - 0.003, "longitude": lng + 0.009, "address": "Women Safety Road", "phone": "1091"},
        {"location_id": str(uuid.uuid4()), "name": "24x7 Pharmacy", "type": "hospital", "latitude": lat + 0.002, "longitude": lng - 0.007, "address": "Market Street", "phone": ""},
        {"location_id": str(uuid.uuid4()), "name": "Safe Shelter Home", "type": "shelter", "latitude": lat - 0.008, "longitude": lng + 0.004, "address": "Shelter Avenue", "phone": "181"},
    ]
    for loc in locations:
        await db.safe_locations.insert_one(loc)
    return {"status": "seeded", "count": len(locations)}

# Voice SOS - Trigger words detection
TRIGGER_WORDS = [
    "help", "sos", "bachao", "emergency", "save me", "danger",
    "please help", "call police", "mujhe bachao", "koi bachao",
    "i need help", "someone help", "help me", "police",
]

@api_router.post("/voice-sos")
async def voice_sos(
    audio: UploadFile = File(...),
    user_id: str = Form(""),
    latitude: float = Form(0.0),
    longitude: float = Form(0.0),
):
    """Transcribe audio and check for SOS trigger words"""
    try:
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)

        # Save uploaded file to temp
        suffix = ".wav"
        if audio.filename:
            ext = Path(audio.filename).suffix
            if ext in [".mp3", ".mp4", ".m4a", ".wav", ".webm", ".mpeg", ".mpga"]:
                suffix = ext

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            content = await audio.read()
            tmp.write(content)
            tmp_path = tmp.name

        # Transcribe
        with open(tmp_path, "rb") as f:
            response = await stt.transcribe(
                file=f,
                model="whisper-1",
                response_format="json",
                language="en",
                prompt="This may contain emergency words like help, SOS, bachao, emergency, save me, danger, police."
            )

        # Cleanup temp file
        os.unlink(tmp_path)

        transcribed = response.text.strip().lower()
        logger.info(f"Voice SOS transcription: '{transcribed}'")

        # Check for trigger words
        triggered = False
        matched_word = ""
        for word in TRIGGER_WORDS:
            if word in transcribed:
                triggered = True
                matched_word = word
                break

        result = {
            "transcription": response.text.strip(),
            "triggered": triggered,
            "matched_word": matched_word,
        }

        # If triggered and we have location, auto-create SOS alert
        if triggered and user_id and (latitude != 0 or longitude != 0):
            alert_id = str(uuid.uuid4())
            timestamp = datetime.now(timezone.utc).isoformat()
            alert = {
                "alert_id": alert_id,
                "user_id": user_id,
                "latitude": latitude,
                "longitude": longitude,
                "message": f"Voice SOS: '{response.text.strip()}' (trigger: {matched_word})",
                "timestamp": timestamp,
                "status": "active",
                "type": "voice",
            }
            await db.sos_alerts.insert_one(alert)
            contacts = await db.contacts.find({"user_id": user_id}, {"_id": 0}).to_list(100)
            user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
            user_name = user["name"] if user else ""

            sms_results = await send_sos_sms(
                contacts=contacts,
                user_name=user_name,
                latitude=latitude,
                longitude=longitude,
                custom_message=f"Voice-triggered SOS (word: '{matched_word}')",
            )
            sent_count = sum(1 for r in sms_results if r.get("status") not in ("failed", "skipped"))
            failed_count = sum(1 for r in sms_results if r.get("status") in ("failed", "skipped"))

            result["alert_id"] = alert_id
            result["contacts_notified"] = len(contacts)
            result["sms_sent"] = sent_count
            result["sms_failed"] = failed_count
            result["sms_results"] = sms_results
            result["timestamp"] = timestamp
            logger.warning(
                f"VOICE SOS ALERT: User {user_id} at ({latitude}, {longitude}) — "
                f"trigger='{matched_word}', SMS sent={sent_count}, failed={failed_count}"
            )

        return result

    except Exception as e:
        logger.error(f"Voice SOS error: {e}")
        return {
            "transcription": "",
            "triggered": False,
            "matched_word": "",
            "error": str(e),
        }

# Include router and middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
