# Tests for app.auth's session-cookie signing: round-trip, wrong secret, and tampering.
from app.auth import create_session_token, verify_session_token

def test_valid_token_round_trips():
    token = create_session_token("my-secret")
    assert verify_session_token(token, "my-secret") is True

def test_wrong_secret_fails():
    token = create_session_token("my-secret")
    assert verify_session_token(token, "different-secret") is False

def test_tampered_token_fails():
    token = create_session_token("my-secret")
    tampered = token[:-1] + ("a" if token[-1] != "a" else "b")
    assert verify_session_token(tampered, "my-secret") is False

def test_garbage_token_fails():
    assert verify_session_token("not-a-real-token", "my-secret") is False
