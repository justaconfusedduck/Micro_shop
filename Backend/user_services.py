import os
from pymongo import MongoClient
from werkzeug.security import generate_password_hash, check_password_hash
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
import jwt
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from functools import wraps
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

load_dotenv()
app = Flask(__name__)
CORS(app,
     supports_credentials=True,
     origins=["null", "http://127.0.0.1:8080", "http://localhost:5173"])
limiter = Limiter(get_remote_address,
                  app=app,
                  default_limits=["200 per day", "50 per hour"],
                  storage_uri="memory://")
SECRET_KEY = os.environ.get('SECRET_KEY')
ACCESS_TOKEN_EXPIRES = timedelta(minutes=10)
REFRESH_TOKEN_EXPIRES = timedelta(days=7)
MONGO_URI = os.environ.get('USER_DB_URI')
if not MONGO_URI or not SECRET_KEY:
    raise RuntimeError("Database URI or SECRET_KEY not found in .env file")
client = MongoClient(MONGO_URI)
db = client.user_db
users_collection = db.users
refresh_tokens_collection = db.refresh_tokens


def admin_required(f):

    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers['Authorization'].split(
            " ")[1] if 'Authorization' in request.headers else None
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


@app.route("/register", methods=['POST'])
@limiter.limit("10 per hour")
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    role = data.get('role', 'buyer')
    if not username or not password:
        return jsonify({"message": "Username and password are required"}), 400
    if role not in ['buyer', 'seller']:
        return jsonify({"message": "Invalid role specified"}), 400
    if users_collection.find_one({"username": username}):
        return jsonify({"message": "User already exists"}), 409
    hashed_password = generate_password_hash(password, method='pbkdf2:sha256')
    users_collection.insert_one({
        "username": username,
        "password": hashed_password,
        "role": role
    })
    return jsonify(
        {"message":
         f"User {username} registered successfully as a {role}"}), 201


@app.route("/login", methods=['POST'])
@limiter.limit("5 per minute")
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    if not username or not password:
        return jsonify({"message": "Invalid username or password"}), 401
    user = users_collection.find_one({"username": username})
    if user and check_password_hash(user['password'], password):
        refresh_tokens_collection.delete_many({'username': username})
        user_role = user.get("role", "buyer")
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
    return jsonify({"message": "Invalid username or password"}), 401


@app.route("/refresh", methods=['POST'])
def refresh():
    token = request.cookies.get('refresh_token')
    if not token: return jsonify({'message': 'Refresh token is missing!'}), 401
    if not refresh_tokens_collection.find_one({'token': token}):
        return jsonify({'message':
                        'Refresh token is invalid or revoked!'}), 401
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user = users_collection.find_one({"username": data['sub']})
        if not user: return jsonify({'message': 'User not found!'}), 401
        user_role = user.get("role", "buyer")
        new_access_token = jwt.encode(
            {
                'sub': data['sub'],
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
    return jsonify(list(users_collection.find({}, {'_id': 0, 'password': 0})))


@app.route("/admin/users/<string:username>/role", methods=['PUT'])
@admin_required
def update_user_role(username):
    data = request.get_json()
    new_role = data.get('role')
    if not new_role or new_role not in ['buyer', 'seller', 'admin']:
        return jsonify({"message": "Valid new role is required"}), 400
    result = users_collection.update_one({'username': username},
                                         {'$set': {
                                             'role': new_role
                                         }})
    if result.matched_count == 0:
        return jsonify({"message": "User not found"}), 404
    return jsonify(
        {"message": f"User {username}'s role updated to {new_role}"}), 200


if __name__ == '__main__':
    users_collection.create_index('username', unique=True)
    refresh_tokens_collection.create_index('token', unique=True)
    print("MongoDB indexes checked/created.")
    app.run(host='0.0.0.0', port=5001, debug=True)
