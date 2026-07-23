# Session-cookie signing for the shared-password login gate: no user accounts, just a signed
# token proving the visitor once submitted APP_PASSWORD. Exposes create_session_token/verify_session_token.
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

SESSION_COOKIE_NAME = "session"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30  # 30 days
_SESSION_PAYLOAD = "ok"

def create_session_token(secret: str) -> str:
    return URLSafeTimedSerializer(secret).dumps(_SESSION_PAYLOAD)

def verify_session_token(token: str, secret: str) -> bool:
    try:
        return URLSafeTimedSerializer(secret).loads(token, max_age=SESSION_MAX_AGE_SECONDS) == _SESSION_PAYLOAD
    except (BadSignature, SignatureExpired):
        return False
