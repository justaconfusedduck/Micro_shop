import os
from pymongo import MongoClient
from werkzeug.security import generate_password_hash, check_password_hash
from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
import jwt
from datetime import datetime, timedelta, timezone

app = Flask(__name__)
CORS(app,
     supports_credentials=True,
     origins=["null", "http://127.0.0.1:8080", "http://localhost:5173"])
app.config['SECRET_KEY'] = os.urandom(24).hex()
ACCESS_TOKEN_EXPIRES = timedelta(minutes=15)
REFRESH_TOKEN_EXPIRES = timedelta(days=7)
MONGO_URI = os.environ.get(
    'USER_DB_URI',
    'mongodb+srv://Not_GB:4Fuoje4xVWMt7yRb@zero.uvzi6xo.mongodb.net/?retryWrites=true&w=majority&appName=Zero'
)
client = MongoClient(MONGO_URI)
db = client.user_db
users_collection = db.users
refresh_tokens_collection = db.refresh_tokens


@app.route("/register", methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    if not username or not password:
        return jsonify({"message": "Username and password are required"}), 400
    if users_collection.find_one({"username": username}):
        return jsonify({"message": "User already exists"}), 409
    hashed_password = generate_password_hash(password, method='pbkdf2:sha256')
    users_collection.insert_one({
        "username": username,
        "password": hashed_password
    })
    print(f"User '{username}' registered.")
    return jsonify({"message":
                    f"User {username} registered successfully"}), 201


@app.route("/login", methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    if not username or not password:
        return jsonify({"message": "Invalid username or password"}), 401
    user = users_collection.find_one({"username": username})
    if user and check_password_hash(user['password'], password):
        access_token = jwt.encode(
            {
                'sub': username,
                'type': 'access',
                'exp': datetime.now(timezone.utc) + ACCESS_TOKEN_EXPIRES
            },
            app.config['SECRET_KEY'],
            algorithm="HS256")
        refresh_token = jwt.encode(
            {
                'sub': username,
                'type': 'refresh',
                'exp': datetime.now(timezone.utc) + REFRESH_TOKEN_EXPIRES
            },
            app.config['SECRET_KEY'],
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
                            secure=True,
                            samesite='Lax',
                            expires=datetime.now(timezone.utc) +
                            REFRESH_TOKEN_EXPIRES)
        return response
    return jsonify({"message": "Invalid username or password"}), 401


@app.route("/refresh", methods=['POST'])
def refresh():
    token = request.cookies.get('refresh_token')
    if not token:
        return jsonify({'message': 'Refresh token is missing!'}), 401
    if not refresh_tokens_collection.find_one({'token': token}):
        return jsonify({'message':
                        'Refresh token is invalid or revoked!'}), 401
    try:
        data = jwt.decode(token,
                          app.config['SECRET_KEY'],
                          algorithms=["HS256"])
        if data.get('type') != 'refresh':
            return jsonify({'message': 'Invalid token type!'}), 401
        current_user = data['sub']
        new_access_token = jwt.encode(
            {
                'sub': current_user,
                'type': 'access',
                'exp': datetime.now(timezone.utc) + ACCESS_TOKEN_EXPIRES
            },
            app.config['SECRET_KEY'],
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
    if token:
        refresh_tokens_collection.delete_one({'token': token})
    response = make_response(jsonify({'message': 'Successfully logged out.'}))
    response.set_cookie('refresh_token', '', expires=0)
    return response


if __name__ == '__main__':
    users_collection.create_index('username', unique=True)
    refresh_tokens_collection.create_index('token', unique=True)
    print("MongoDB indexes checked/created.")
    app.run(port=5001, debug=True)
