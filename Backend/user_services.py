import os
import io
import uuid
import random
import string
import base64
from datetime import datetime, timedelta, timezone
from functools import wraps
import jwt
import requests
from captcha.image import ImageCaptcha
from dotenv import load_dotenv
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from pymongo import MongoClient
from werkzeug.security import generate_password_hash, check_password_hash

load_dotenv()
SECRET_KEY = os.environ.get('SECRET_KEY')
MONGO_URI = os.environ.get('USER_DB_URI')
ACCESS_TOKEN_EXPIRES = timedelta(minutes=10)
REFRESH_TOKEN_EXPIRES = timedelta(days=7)
PRE_AUTH_TOKEN_EXPIRES = timedelta(minutes=5)
OTP_ENABLED = os.environ.get('OTP_ENABLED', 'true').lower() == 'true'
MAILGUN_API_KEY = os.environ.get('MAILGUN_API_KEY')
MAILGUN_DOMAIN = os.environ.get('MAILGUN_DOMAIN')
EMAIL_SENDER = os.environ.get('EMAIL_SENDER')
if not all([MONGO_URI, SECRET_KEY]):
    raise RuntimeError("MONGO_URI and SECRET_KEY must be set.")
if OTP_ENABLED and not all([MAILGUN_API_KEY, MAILGUN_DOMAIN, EMAIL_SENDER]):
    raise RuntimeError(
        "Mailgun settings must be configured in .env when OTP is enabled.")
app = Flask(__name__)
CORS(app, supports_credentials=True, origins=["http://localhost:5173"])
limiter = Limiter(get_remote_address,
                  app=app,
                  default_limits=["200/day", "50/hour"],
                  storage_uri="memory://")
image_captcha = ImageCaptcha(width=280, height=90)
client = MongoClient(MONGO_URI)
db = client.user_db
users_collection = db.users
refresh_tokens_collection = db.refresh_tokens
captcha_store = {}


def admin_required(f):

    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', ' ').split(" ")[-1]
        if not token:
            return jsonify({'message':
                            'Authentication Token is missing!'}), 401
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            if data.get('role') != 'admin':
                return jsonify(
                    {'message': 'This action requires an admin account!'}), 403
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return jsonify({'message': 'Token is invalid or expired!'}), 401
        return f(*args, **kwargs)

    return decorated


def send_otp_email(recipient_email, otp):
    if not recipient_email: return False
    response = requests.post(
        f"https://api.mailgun.net/v3/{MAILGUN_DOMAIN}/messages",
        auth=("api", MAILGUN_API_KEY),
        data={
            "from":
            EMAIL_SENDER,
            "to": [recipient_email],
            "subject":
            "Your E-Commerce Verification Code",
            "text":
            f"Your one-time password is: {otp}\n\nThis code will expire in 5 minutes."
        })
    if response.status_code == 200:
        print(f"OTP email sent to {recipient_email} via Mailgun.")
        return True
    else:
        print(f"Failed to send email via Mailgun: {response.text}")
        return False


def _create_and_set_tokens(username, user_role):
    refresh_tokens_collection.delete_many({'username': username})
    access_token = jwt.encode(
        {
            'sub': username,
            'role': user_role,
            'type': 'access',
            'exp': datetime.now(timezone.utc) + ACCESS_TOKEN_EXPIRES
        },
        SECRET_KEY,
        algorithm="HS256")
    refresh_token = jwt.encode(
        {
            'sub': username,
            'type': 'refresh',
            'exp': datetime.now(timezone.utc) + REFRESH_TOKEN_EXPIRES
        },
        SECRET_KEY,
        algorithm="HS256")
    refresh_tokens_collection.insert_one({
        'token': refresh_token,
        'username': username
    })
    response = make_response(
        jsonify({
            'message': 'Login successful',
            'access_token': access_token,
            'username': username
        }))
    response.set_cookie('refresh_token',
                        refresh_token,
                        httponly=True,
                        samesite='None',
                        expires=datetime.now(timezone.utc) +
                        REFRESH_TOKEN_EXPIRES)
    return response


@app.route("/captcha/new", methods=['GET'])
def new_captcha():
    captcha_id = str(uuid.uuid4())
    captcha_text = "".join(
        random.choices(string.ascii_uppercase + string.digits, k=6))
    captcha_store[captcha_id] = captcha_text
    img_bytes = image_captcha.generate(captcha_text).getvalue()
    img_str = base64.b64encode(img_bytes).decode("utf-8")
    return jsonify({
        'captcha_id': captcha_id,
        'image': f'data:image/png;base64,{img_str}'
    })


@app.route("/register/start", methods=['POST'])
@limiter.limit("10 per hour")
def register_start():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    email = data.get('email')
    role = data.get('role', 'buyer')
    captcha_id = data.get('captcha_id')
    captcha_answer = data.get('captcha_answer')
    if not all([username, password, email, captcha_id, captcha_answer]):
        return jsonify(
            {"message": "All fields, including CAPTCHA, are required"}), 400
    if role not in ['buyer', 'seller']:
        return jsonify({"message": "Invalid role"}), 400
    if users_collection.find_one({"username": username}):
        return jsonify({"message": "Username already exists"}), 409
    if users_collection.find_one({"email": email}):
        return jsonify({"message": "Email is already in use"}), 409
    correct_answer = captcha_store.pop(captcha_id, None)
    if not correct_answer or captcha_answer.upper() != correct_answer.upper():
        return jsonify({"message": "Incorrect CAPTCHA"}), 401
    otp = "".join(random.choices(string.digits, k=6))
    if not send_otp_email(email, otp):
        return jsonify({"message": "Failed to send verification email."}), 500
    pre_reg_token = jwt.encode(
        {
            'scope': 'pre-reg-otp',
            'username': username,
            'password': generate_password_hash(password,
                                               method='pbkdf2:sha256'),
            'email': email,
            'role': role,
            'otp': otp,
            'exp': datetime.now(timezone.utc) + PRE_AUTH_TOKEN_EXPIRES
        },
        SECRET_KEY,
        algorithm="HS256")
    return jsonify({
        'message': 'OTP sent to your email',
        'pre_reg_token': pre_reg_token
    }), 206


@app.route("/register/verify", methods=['POST'])
@limiter.limit("5 per minute")
def register_verify():
    data = request.get_json()
    pre_reg_token = data.get('pre_reg_token')
    otp_code = data.get('otp_code')
    if not pre_reg_token or not otp_code:
        return jsonify({'message': 'Token and OTP are required'}), 400
    try:
        payload = jwt.decode(pre_reg_token, SECRET_KEY, algorithms=["HS256"])
        if payload.get('scope') != 'pre-reg-otp':
            return jsonify({'message': 'Invalid token scope'}), 401
        if payload.get('otp') != otp_code:
            return jsonify({'message': 'Invalid OTP code'}), 401
        users_collection.insert_one({
            "username": payload['username'],
            "password": payload['password'],
            "email": payload['email'],
            "role": payload['role'],
        })
        return jsonify({
            "message":
            f"User '{payload['username']}' registered successfully!"
        }), 201
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return jsonify(
            {'message': 'Verification token is invalid or has expired.'}), 401


@app.route("/login", methods=['POST'])
@limiter.limit("5 per minute")
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    captcha_id = data.get('captcha_id')
    captcha_answer = data.get('captcha_answer')
    if not all([username, password, captcha_id, captcha_answer]):
        return jsonify(
            {"message": "All fields, including CAPTCHA, are required"}), 400
    correct_answer = captcha_store.pop(captcha_id, None)
    if not correct_answer or captcha_answer.upper() != correct_answer.upper():
        return jsonify({"message": "Incorrect CAPTCHA"}), 401
    user = users_collection.find_one({"username": username})
    if user and user.get('password') and isinstance(
            user.get('password'), str) and check_password_hash(
                user['password'], password):
        user_email = user.get("email")
        if OTP_ENABLED and user_email:
            otp = "".join(random.choices(string.digits, k=6))
            otp_expiry = datetime.now(timezone.utc) + PRE_AUTH_TOKEN_EXPIRES
            users_collection.update_one(
                {"username": username},
                {"$set": {
                    "otp": otp,
                    "otp_expiry": otp_expiry
                }})
            if not send_otp_email(user_email, otp):
                return jsonify(
                    {"message": "Failed to send verification email."}), 500
            pre_auth_token = jwt.encode(
                {
                    'sub': username,
                    'scope': 'pre-auth-otp',
                    'exp': otp_expiry
                },
                SECRET_KEY,
                algorithm="HS256")
            return jsonify({
                'message': 'OTP sent to your email',
                'pre_auth_token': pre_auth_token
            }), 206
        user_role = user.get("role", "buyer")
        return _create_and_set_tokens(username, user_role)
    return jsonify({"message": "Invalid username or password"}), 401


@app.route("/login/verify-otp", methods=['POST'])
@limiter.limit("5 per minute")
def verify_otp():
    data = request.get_json()
    pre_auth_token = data.get('pre_auth_token')
    otp_code = data.get('otp_code')
    if not pre_auth_token or not otp_code:
        return jsonify({'message': 'Token and OTP code are required!'}), 400
    try:
        payload = jwt.decode(pre_auth_token, SECRET_KEY, algorithms=["HS256"])
        if payload.get('scope') != 'pre-auth-otp':
            return jsonify({'message': 'Invalid token scope!'}), 401
        username = payload['sub']
        user = users_collection.find_one({"username": username})
        if not user or not user.get("otp") or not user.get("otp_expiry"):
            return jsonify({'message': 'OTP not found!'}), 400
        otp_expiry_aware = user["otp_expiry"].replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > otp_expiry_aware:
            return jsonify({'message': 'OTP has expired!'}), 401
        if user["otp"] != otp_code:
            return jsonify({'message': 'Invalid OTP code!'}), 401
        users_collection.update_one({"username": username},
                                    {"$unset": {
                                        "otp": "",
                                        "otp_expiry": ""
                                    }})
        user_role = user.get("role", "buyer")
        return _create_and_set_tokens(username, user_role)
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return jsonify(
            {'message':
             'Pre-authentication token is invalid or expired!'}), 401


@app.route("/refresh", methods=['POST'])
def refresh():
    token = request.cookies.get('refresh_token')
    if not token or not refresh_tokens_collection.find_one({'token': token}):
        return jsonify({'message':
                        'Refresh token is invalid or revoked!'}), 401
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        username = data['sub']
        user = users_collection.find_one({"username": username})
        if not user: return jsonify({'message': 'User not found!'}), 401
        user_role = user.get("role", "buyer")
        new_access_token = jwt.encode(
            {
                'sub': username,
                'role': user_role,
                'type': 'access',
                'exp': datetime.now(timezone.utc) + ACCESS_TOKEN_EXPIRES
            },
            SECRET_KEY,
            algorithm="HS256")
        return jsonify({'access_token': new_access_token})
    except jwt.ExpiredSignatureError:
        refresh_tokens_collection.delete_one({'token': token})
        return jsonify(
            {'message':
             'Refresh token has expired! Please log in again.'}), 401
    except jwt.InvalidTokenError:
        return jsonify({'message': 'Refresh token is invalid!'}), 401


@app.route("/logout", methods=['POST'])
def logout():
    token = request.cookies.get('refresh_token')
    if token: refresh_tokens_collection.delete_one({'token': token})
    response = make_response(jsonify({'message': 'Successfully logged out.'}))
    response.set_cookie('refresh_token', '', expires=0)
    return response


@app.route("/admin/users", methods=['GET'])
@admin_required
def get_all_users():
    all_users = list(users_collection.find({}, {'_id': 0, 'password': 0}))
    return jsonify(all_users)


@app.route("/admin/users/<string:username>/role", methods=['PUT'])
@admin_required
def update_user_role(username):
    data = request.get_json()
    new_role = data.get('role')
    if not new_role or new_role not in ['buyer', 'seller', 'admin']:
        return jsonify({"message": "Valid role is required"}), 400
    result = users_collection.update_one({'username': username},
                                         {'$set': {
                                             'role': new_role
                                         }})
    if result.matched_count == 0:
        return jsonify({"message": "User not found"}), 404
    return jsonify(
        {"message": f"User '{username}' role updated to '{new_role}'"}), 200


if __name__ == '__main__':
    users_collection.create_index('username', unique=True)
    users_collection.create_index('email', unique=True, sparse=True)
    refresh_tokens_collection.create_index('token', unique=True)
    print(f"OTP Verification is {'ENABLED' if OTP_ENABLED else 'DISABLED'}")
    app.run(host='0.0.0.0', port=5001, debug=True)
