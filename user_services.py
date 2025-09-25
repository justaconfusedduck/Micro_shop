from flask import Flask, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
users = {}


@app.route("/")
def index():
    return "Welcome to the User Service!"


@app.route("/register", methods=['POST'])
def register():
    data = request.get_json()
    if not data or 'username' not in data or 'password' not in data:
        return jsonify({"message": "Username and password are required"}), 400
    username = data['username']
    password = data['password']
    if username in users:
        return jsonify({"message": "Username already exists"}), 409
    hashed_password = generate_password_hash(password)
    users[username] = hashed_password
    print(f"User registered: {username}")
    print("Current users:", users)
    return jsonify({"message":
                    f"User {username} registered successfully"}), 201


@app.route("/login", methods=['POST'])
def login():
    data = request.get_json()
    if not data or 'username' not in data or 'password' not in data:
        return jsonify({"message": "Username and password are required"}), 400
    username = data['username']
    password = data['password']
    user_hashed_password = users.get(username)
    if user_hashed_password and check_password_hash(user_hashed_password,
                                                    password):
        print(f"User logged in: {username}")
        return jsonify({"message": "Login successful"}), 200
    else:
        return jsonify({"message": "Invalid username or password"}), 401


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
