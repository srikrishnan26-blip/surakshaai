"""Test suite for SurakshaAI API endpoints

Tests cover:
- User management (create, get)
- Emergency contacts CRUD
- Route risk analysis (AI-powered)
- SOS alerts
- Location tracking
- Safe locations
"""

import pytest
import requests
import time

class TestHealthCheck:
    """API health check"""
    
    def test_api_root(self, api_client, base_url):
        """Test API root endpoint is accessible"""
        try:
            response = api_client.get(f"{base_url}/api/")
            assert response.status_code == 200
            data = response.json()
            assert "message" in data
            print(f"✓ API health check passed: {data}")
        except Exception as e:
            pytest.fail(f"API health check failed: {e}")

class TestUserManagement:
    """User creation and retrieval tests"""
    
    def test_create_user_and_verify(self, api_client, base_url):
        """Test user creation and verify persistence with GET"""
        try:
            # Create user
            create_payload = {"name": "TEST_Priya Sharma"}
            create_response = api_client.post(f"{base_url}/api/user", json=create_payload)
            assert create_response.status_code == 200, f"Create failed: {create_response.text}"
            
            created_user = create_response.json()
            assert "user_id" in created_user
            assert created_user["name"] == create_payload["name"]
            assert "created_at" in created_user
            user_id = created_user["user_id"]
            print(f"✓ User created: {user_id}")
            
            # Verify with GET
            get_response = api_client.get(f"{base_url}/api/user/{user_id}")
            assert get_response.status_code == 200
            retrieved_user = get_response.json()
            assert retrieved_user["user_id"] == user_id
            assert retrieved_user["name"] == create_payload["name"]
            print(f"✓ User verified via GET: {retrieved_user['name']}")
            
        except Exception as e:
            pytest.fail(f"User creation/verification failed: {e}")
    
    def test_get_nonexistent_user(self, api_client, base_url):
        """Test GET for non-existent user returns 404"""
        try:
            response = api_client.get(f"{base_url}/api/user/nonexistent-user-id")
            assert response.status_code == 404
            print("✓ Non-existent user returns 404")
        except Exception as e:
            pytest.fail(f"Non-existent user test failed: {e}")

class TestEmergencyContacts:
    """Emergency contacts CRUD tests"""
    
    @pytest.fixture
    def test_user(self, api_client, base_url):
        """Create a test user for contact tests"""
        response = api_client.post(f"{base_url}/api/user", json={"name": "TEST_Contact_User"})
        return response.json()["user_id"]
    
    def test_add_contact_and_verify(self, api_client, base_url, test_user):
        """Test adding emergency contact and verify persistence"""
        try:
            # Add contact
            contact_payload = {
                "user_id": test_user,
                "name": "TEST_Mom",
                "phone": "+91-9876543210",
                "relation": "Mother"
            }
            create_response = api_client.post(f"{base_url}/api/contacts", json=contact_payload)
            assert create_response.status_code == 200, f"Add contact failed: {create_response.text}"
            
            created_contact = create_response.json()
            assert "contact_id" in created_contact
            assert created_contact["name"] == contact_payload["name"]
            assert created_contact["phone"] == contact_payload["phone"]
            assert created_contact["relation"] == contact_payload["relation"]
            contact_id = created_contact["contact_id"]
            print(f"✓ Contact created: {contact_id}")
            
            # Verify with GET
            get_response = api_client.get(f"{base_url}/api/contacts/{test_user}")
            assert get_response.status_code == 200
            contacts = get_response.json()
            assert isinstance(contacts, list)
            assert len(contacts) >= 1
            
            # Find our contact
            our_contact = next((c for c in contacts if c["contact_id"] == contact_id), None)
            assert our_contact is not None
            assert our_contact["name"] == contact_payload["name"]
            print(f"✓ Contact verified via GET: {our_contact['name']}")
            
        except Exception as e:
            pytest.fail(f"Add contact test failed: {e}")
    
    def test_get_contacts_empty_list(self, api_client, base_url):
        """Test GET contacts for user with no contacts returns empty list"""
        try:
            # Create new user with no contacts
            user_response = api_client.post(f"{base_url}/api/user", json={"name": "TEST_No_Contacts"})
            user_id = user_response.json()["user_id"]
            
            response = api_client.get(f"{base_url}/api/contacts/{user_id}")
            assert response.status_code == 200
            contacts = response.json()
            assert isinstance(contacts, list)
            assert len(contacts) == 0
            print("✓ Empty contacts list returned correctly")
        except Exception as e:
            pytest.fail(f"Empty contacts test failed: {e}")
    
    def test_delete_contact_and_verify(self, api_client, base_url, test_user):
        """Test deleting contact and verify it's removed"""
        try:
            # Add contact first
            contact_payload = {
                "user_id": test_user,
                "name": "TEST_Delete_Contact",
                "phone": "+91-1234567890",
                "relation": "Friend"
            }
            create_response = api_client.post(f"{base_url}/api/contacts", json=contact_payload)
            contact_id = create_response.json()["contact_id"]
            print(f"✓ Contact created for deletion: {contact_id}")
            
            # Delete contact
            delete_response = api_client.delete(f"{base_url}/api/contacts/{contact_id}")
            assert delete_response.status_code == 200
            delete_data = delete_response.json()
            assert delete_data["status"] == "deleted"
            assert delete_data["contact_id"] == contact_id
            print(f"✓ Contact deleted: {contact_id}")
            
            # Verify deletion - contact should not be in list
            get_response = api_client.get(f"{base_url}/api/contacts/{test_user}")
            contacts = get_response.json()
            deleted_contact = next((c for c in contacts if c["contact_id"] == contact_id), None)
            assert deleted_contact is None
            print("✓ Contact deletion verified")
            
        except Exception as e:
            pytest.fail(f"Delete contact test failed: {e}")
    
    def test_delete_nonexistent_contact(self, api_client, base_url):
        """Test deleting non-existent contact returns 404"""
        try:
            response = api_client.delete(f"{base_url}/api/contacts/nonexistent-contact-id")
            assert response.status_code == 404
            print("✓ Delete non-existent contact returns 404")
        except Exception as e:
            pytest.fail(f"Delete non-existent contact test failed: {e}")

class TestRouteRiskAnalysis:
    """AI-powered route risk analysis tests"""
    
    def test_route_risk_analysis(self, api_client, base_url):
        """Test route risk analysis with AI (may take a few seconds)"""
        try:
            route_payload = {
                "destination": "Connaught Place, New Delhi",
                "origin": "India Gate, New Delhi",
                "latitude": 28.6139,
                "longitude": 77.2090
            }
            
            print("⏳ Analyzing route with AI (this may take 3-5 seconds)...")
            response = api_client.post(f"{base_url}/api/route-risk", json=route_payload, timeout=15)
            assert response.status_code == 200, f"Route analysis failed: {response.text}"
            
            result = response.json()
            assert "risk" in result
            assert result["risk"] in ["Low", "Moderate", "High"]
            assert "score" in result
            assert isinstance(result["score"], int)
            assert 1 <= result["score"] <= 100
            assert "summary" in result
            assert isinstance(result["summary"], str)
            assert len(result["summary"]) > 0
            assert "tips" in result
            assert isinstance(result["tips"], list)
            assert len(result["tips"]) > 0
            assert "safe_alternatives" in result
            assert isinstance(result["safe_alternatives"], list)
            
            print(f"✓ Route analysis completed: Risk={result['risk']}, Score={result['score']}")
            print(f"  Summary: {result['summary'][:80]}...")
            print(f"  Tips count: {len(result['tips'])}")
            
        except Exception as e:
            pytest.fail(f"Route risk analysis test failed: {e}")
    
    def test_route_risk_minimal_data(self, api_client, base_url):
        """Test route risk with minimal data (destination only)"""
        try:
            route_payload = {"destination": "Mumbai Central Station"}
            
            print("⏳ Analyzing route with minimal data...")
            response = api_client.post(f"{base_url}/api/route-risk", json=route_payload, timeout=15)
            assert response.status_code == 200
            
            result = response.json()
            assert "risk" in result
            assert "score" in result
            assert "summary" in result
            print(f"✓ Minimal route analysis completed: Risk={result['risk']}")
            
        except Exception as e:
            pytest.fail(f"Minimal route risk test failed: {e}")

class TestSOSAlerts:
    """SOS alert tests"""
    
    @pytest.fixture
    def test_user_with_contacts(self, api_client, base_url):
        """Create user with emergency contacts"""
        # Create user
        user_response = api_client.post(f"{base_url}/api/user", json={"name": "TEST_SOS_User"})
        user_id = user_response.json()["user_id"]
        
        # Add 2 emergency contacts
        api_client.post(f"{base_url}/api/contacts", json={
            "user_id": user_id,
            "name": "TEST_Emergency_Contact_1",
            "phone": "+91-9999999999",
            "relation": "Family"
        })
        api_client.post(f"{base_url}/api/contacts", json={
            "user_id": user_id,
            "name": "TEST_Emergency_Contact_2",
            "phone": "+91-8888888888",
            "relation": "Friend"
        })
        
        return user_id
    
    def test_trigger_sos_and_verify(self, api_client, base_url, test_user_with_contacts):
        """Test SOS alert trigger and verify persistence"""
        try:
            sos_payload = {
                "user_id": test_user_with_contacts,
                "latitude": 28.6139,
                "longitude": 77.2090,
                "message": "TEST Emergency - Help needed!"
            }
            
            # Trigger SOS
            sos_response = api_client.post(f"{base_url}/api/sos", json=sos_payload)
            assert sos_response.status_code == 200, f"SOS trigger failed: {sos_response.text}"
            
            sos_result = sos_response.json()
            assert "alert_id" in sos_result
            assert sos_result["status"] == "active"
            assert "contacts_notified" in sos_result
            assert sos_result["contacts_notified"] == 2  # We added 2 contacts
            assert "timestamp" in sos_result
            alert_id = sos_result["alert_id"]
            print(f"✓ SOS alert triggered: {alert_id}, {sos_result['contacts_notified']} contacts notified")
            
            # Verify with GET
            get_response = api_client.get(f"{base_url}/api/sos/{test_user_with_contacts}")
            assert get_response.status_code == 200
            alerts = get_response.json()
            assert isinstance(alerts, list)
            assert len(alerts) >= 1
            
            # Find our alert
            our_alert = next((a for a in alerts if a["alert_id"] == alert_id), None)
            assert our_alert is not None
            assert our_alert["latitude"] == sos_payload["latitude"]
            assert our_alert["longitude"] == sos_payload["longitude"]
            print(f"✓ SOS alert verified via GET")
            
        except Exception as e:
            pytest.fail(f"SOS alert test failed: {e}")
    
    def test_sos_with_no_contacts(self, api_client, base_url):
        """Test SOS alert for user with no emergency contacts"""
        try:
            # Create user without contacts
            user_response = api_client.post(f"{base_url}/api/user", json={"name": "TEST_No_Contacts_SOS"})
            user_id = user_response.json()["user_id"]
            
            sos_payload = {
                "user_id": user_id,
                "latitude": 19.0760,
                "longitude": 72.8777,
                "message": "TEST SOS with no contacts"
            }
            
            response = api_client.post(f"{base_url}/api/sos", json=sos_payload)
            assert response.status_code == 200
            result = response.json()
            assert result["contacts_notified"] == 0
            print("✓ SOS with no contacts works (0 notified)")
            
        except Exception as e:
            pytest.fail(f"SOS with no contacts test failed: {e}")

class TestLocationTracking:
    """Location tracking tests"""
    
    def test_update_tracking(self, api_client, base_url):
        """Test location tracking update"""
        try:
            # Create user
            user_response = api_client.post(f"{base_url}/api/user", json={"name": "TEST_Tracking_User"})
            user_id = user_response.json()["user_id"]
            
            tracking_payload = {
                "user_id": user_id,
                "latitude": 28.7041,
                "longitude": 77.1025,
                "destination": "Rajiv Chowk Metro Station"
            }
            
            response = api_client.post(f"{base_url}/api/tracking", json=tracking_payload)
            assert response.status_code == 200
            result = response.json()
            assert result["status"] == "updated"
            print(f"✓ Location tracking updated for user {user_id}")
            
        except Exception as e:
            pytest.fail(f"Location tracking test failed: {e}")

class TestSafeLocations:
    """Safe locations tests"""
    
    def test_seed_safe_locations(self, api_client, base_url):
        """Test seeding safe locations"""
        try:
            lat, lng = 28.6139, 77.2090
            response = api_client.post(f"{base_url}/api/safe-locations/seed?lat={lat}&lng={lng}")
            assert response.status_code == 200
            result = response.json()
            assert result["status"] == "seeded"
            assert "count" in result
            assert result["count"] > 0
            print(f"✓ Safe locations seeded: {result['count']} locations")
            
        except Exception as e:
            pytest.fail(f"Seed safe locations test failed: {e}")
    
    def test_get_safe_locations(self, api_client, base_url):
        """Test getting safe locations"""
        try:
            # Seed first
            lat, lng = 28.6139, 77.2090
            api_client.post(f"{base_url}/api/safe-locations/seed?lat={lat}&lng={lng}")
            
            # Get locations
            response = api_client.get(f"{base_url}/api/safe-locations?lat={lat}&lng={lng}")
            assert response.status_code == 200
            locations = response.json()
            assert isinstance(locations, list)
            assert len(locations) > 0
            
            # Verify structure of first location
            first_loc = locations[0]
            assert "location_id" in first_loc
            assert "name" in first_loc
            assert "type" in first_loc
            assert first_loc["type"] in ["police", "hospital", "shelter", "fire"]
            assert "latitude" in first_loc
            assert "longitude" in first_loc
            assert "address" in first_loc
            assert "phone" in first_loc
            
            print(f"✓ Safe locations retrieved: {len(locations)} locations")
            print(f"  Sample: {first_loc['name']} ({first_loc['type']})")
            
        except Exception as e:
            pytest.fail(f"Get safe locations test failed: {e}")

class TestVoiceSOS:
    """Voice-activated SOS tests (NEW FEATURE)"""
    
    @pytest.fixture
    def test_user_with_contacts(self, api_client, base_url):
        """Create user with emergency contacts for voice SOS"""
        user_response = api_client.post(f"{base_url}/api/user", json={"name": "TEST_Voice_SOS_User"})
        user_id = user_response.json()["user_id"]
        
        # Add emergency contact
        api_client.post(f"{base_url}/api/contacts", json={
            "user_id": user_id,
            "name": "TEST_Voice_Contact",
            "phone": "+91-9876543210",
            "relation": "Family"
        })
        
        return user_id
    
    def test_voice_sos_with_trigger_word(self, api_client, base_url, test_user_with_contacts):
        """Test voice SOS with trigger word detection (using sample audio)"""
        try:
            import tempfile
            import os
            
            # Create a minimal WAV file for testing
            wav_header = b'RIFF' + (36).to_bytes(4, 'little') + b'WAVEfmt ' + (16).to_bytes(4, 'little')
            wav_header += (1).to_bytes(2, 'little')  # Audio format (PCM)
            wav_header += (1).to_bytes(2, 'little')  # Channels
            wav_header += (16000).to_bytes(4, 'little')  # Sample rate
            wav_header += (32000).to_bytes(4, 'little')  # Byte rate
            wav_header += (2).to_bytes(2, 'little')  # Block align
            wav_header += (16).to_bytes(2, 'little')  # Bits per sample
            wav_header += b'data' + (0).to_bytes(4, 'little')
            
            # Write to temp file
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                tmp.write(wav_header)
                tmp_path = tmp.name
            
            try:
                # Prepare multipart form data
                with open(tmp_path, 'rb') as audio_file:
                    files = {'audio': ('test_audio.wav', audio_file, 'audio/wav')}
                    data = {
                        'user_id': test_user_with_contacts,
                        'latitude': '28.6139',
                        'longitude': '77.2090'
                    }
                    
                    print("⏳ Testing voice SOS endpoint (Whisper transcription may take 5-10 seconds)...")
                    
                    # Remove Content-Type header for multipart
                    headers = {k: v for k, v in api_client.headers.items() if k.lower() != 'content-type'}
                    
                    response = requests.post(
                        f"{base_url}/api/voice-sos",
                        files=files,
                        data=data,
                        headers=headers,
                        timeout=30
                    )
                
                assert response.status_code == 200, f"Voice SOS failed: {response.text}"
                
                result = response.json()
                assert "transcription" in result
                assert "triggered" in result
                assert isinstance(result["triggered"], bool)
                assert "matched_word" in result
                
                print(f"✓ Voice SOS endpoint working")
                print(f"  Transcription: '{result.get('transcription', 'N/A')}'")
                print(f"  Triggered: {result['triggered']}")
                
                if result["triggered"]:
                    assert "alert_id" in result
                    assert "contacts_notified" in result
                    assert "timestamp" in result
                    print(f"  Alert created: {result['alert_id']}")
                    print(f"  Contacts notified: {result['contacts_notified']}")
                
            finally:
                # Cleanup temp file
                os.unlink(tmp_path)
            
        except Exception as e:
            pytest.fail(f"Voice SOS test failed: {e}")
    
    def test_voice_sos_endpoint_structure(self, api_client, base_url):
        """Test voice SOS endpoint accepts required parameters"""
        try:
            import tempfile
            import os
            
            # Minimal WAV file
            wav_header = b'RIFF' + (36).to_bytes(4, 'little') + b'WAVEfmt ' + (16).to_bytes(4, 'little')
            wav_header += (1).to_bytes(2, 'little') + (1).to_bytes(2, 'little')
            wav_header += (16000).to_bytes(4, 'little') + (32000).to_bytes(4, 'little')
            wav_header += (2).to_bytes(2, 'little') + (16).to_bytes(2, 'little')
            wav_header += b'data' + (0).to_bytes(4, 'little')
            
            # Write to temp file
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                tmp.write(wav_header)
                tmp_path = tmp.name
            
            try:
                with open(tmp_path, 'rb') as audio_file:
                    files = {'audio': ('test.wav', audio_file, 'audio/wav')}
                    data = {
                        'user_id': '',
                        'latitude': '0.0',
                        'longitude': '0.0'
                    }
                    
                    print("⏳ Testing voice SOS endpoint structure...")
                    
                    # Remove Content-Type header for multipart
                    headers = {k: v for k, v in api_client.headers.items() if k.lower() != 'content-type'}
                    
                    response = requests.post(
                        f"{base_url}/api/voice-sos",
                        files=files,
                        data=data,
                        headers=headers,
                        timeout=30
                    )
                
                assert response.status_code == 200
                result = response.json()
                assert "transcription" in result
                assert "triggered" in result
                assert "matched_word" in result
                
                print("✓ Voice SOS endpoint structure validated")
                
            finally:
                os.unlink(tmp_path)
            
        except Exception as e:
            pytest.fail(f"Voice SOS structure test failed: {e}")
