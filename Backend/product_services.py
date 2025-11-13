# product_service.py (Updated with an Admin-only delete route)

import os
from pymongo import MongoClient
from flask import Flask, jsonify, request # Make sure 'request' is imported
from flask_cors import CORS
from dotenv import load_dotenv
import jwt
from functools import wraps
import uuid

# Load environment variables
load_dotenv()

# 1. --- SETUP ---
app = Flask(__name__)
# Updated CORS origins to match your other services
CORS(app, supports_credentials=True, origins=["http://localhost:5173", "http://127.0.0.1:5173","http://192.168.1.*","http://172.31.30.*"])

MONGO_URI = os.environ.get('PRODUCT_DB_URI')
SECRET_KEY = os.environ.get('SECRET_KEY') # Needed to decode JWTs

if not MONGO_URI or not SECRET_KEY:
    raise RuntimeError("Database URI or SECRET_KEY not found in .env file")

client = MongoClient(MONGO_URI)
db = client.product_db
products_collection = db.products

# 2. --- SECURITY DECORATORS (THE FIX IS HERE) ---
def seller_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # --- THIS IS THE FIX ---
        # Allow all OPTIONS requests to pass through for CORS preflight
        if request.method == 'OPTIONS':
            return f(*args, **kwargs)
        # --- END OF FIX ---
            
        token = request.headers.get('Authorization', ' ').split(" ")[-1]
        if not token: return jsonify({'message': 'Authentication Token is missing!'}), 401
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            if data.get('role') != 'seller': return jsonify({'message': 'This action requires a seller account!'}), 403
            return f(data.get('sub'), *args, **kwargs)
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return jsonify({'message': 'Token is invalid or expired!'}), 401
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # --- THIS IS THE FIX ---
        # Allow all OPTIONS requests to pass through for CORS preflight
        if request.method == 'OPTIONS':
            return f(*args, **kwargs)
        # --- END OF FIX ---
            
        token = request.headers.get('Authorization', ' ').split(" ")[-1]
        if not token: return jsonify({'message': 'Authentication Token is missing!'}), 401
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            if data.get('role') != 'admin': return jsonify({'message': 'This action requires an admin account!'}), 403
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return jsonify({'message': 'Token is invalid or expired!'}), 401
        return f(*args, **kwargs)
    return decorated

# 3. --- API ENDPOINTS ---

# --- Public Endpoints (No change needed) ---
@app.route("/products", methods=['GET'])
def get_products():
    return jsonify(list(products_collection.find({}, {'_id': 0})))

@app.route("/products/<string:product_id>", methods=['GET'])
def get_product(product_id):
    product = products_collection.find_one({'id': product_id}, {'_id': 0})
    return jsonify(product) if product else (jsonify({"message": "Product not found"}), 404)

@app.route("/products/search", methods=['GET'])
def search_products():
    query = request.args.get('q', '')
    return jsonify(list(products_collection.find({'$text': {'$search': query}}, {'_id': 0})))

# --- Seller-Only Endpoints (Added 'OPTIONS') ---
@app.route("/products", methods=['POST', 'OPTIONS'])
@seller_required
def create_product(current_seller):
    data = request.get_json()
    new_product = { 'id': f"P{uuid.uuid4().hex[:4]}", 'name': data['name'], 'description': data.get('description', ''), 'price': float(data['price']), 'owner_id': current_seller }
    products_collection.insert_one(new_product)
    new_product.pop('_id', None)
    return jsonify(new_product), 201

@app.route("/products/<string:product_id>", methods=['PUT', 'OPTIONS'])
@seller_required
def update_product(current_seller, product_id):
    data = request.get_json()
    product = products_collection.find_one({'id': product_id})
    if not product: return jsonify({'message': 'Product not found!'}), 404
    if product.get('owner_id') != current_seller: return jsonify({'message': 'You are not authorized to edit this product!'}), 403
    update_data = {k: v for k, v in data.items() if k not in ['id', 'owner_id', '_id']}
    if 'price' in update_data: update_data['price'] = float(update_data['price'])
    products_collection.update_one({'id': product_id}, {'$set': update_data})
    return jsonify({'message': 'Product updated successfully'}), 200

@app.route("/products/<string:product_id>", methods=['DELETE', 'OPTIONS'])
@seller_required
def delete_product(current_seller, product_id):
    product = products_collection.find_one({'id': product_id})
    if not product: return jsonify({'message': 'Product not found!'}), 404
    if product.get('owner_id') != current_seller: return jsonify({'message': 'You are not authorized to delete this product!'}), 403
    products_collection.delete_one({'id': product_id})
    return jsonify({'message': 'Product deleted successfully'}), 200

# --- ADMIN-ONLY ENDPOINT (Added 'OPTIONS') ---
@app.route("/admin/products/<string:product_id>", methods=['DELETE', 'OPTIONS'])
@admin_required
def admin_delete_product(product_id):
    """Deletes any product by ID. Only accessible to admins."""
    try:
        result = products_collection.delete_one({'id': product_id})
        if result.deleted_count == 0:
            return jsonify({'message': 'Product not found!'}), 404
        return jsonify({'message': 'Product deleted by admin successfully'}), 200
    except Exception as e:
        return jsonify({'message': f'Could not delete product: {e}'}), 500
        
# 4. --- RUN ---
if __name__ == '__main__':
    products_collection.create_index([('name', 'text'), ('description', 'text')])
    products_collection.create_index('id', unique=True)
    products_collection.create_index('owner_id')
    print("MongoDB product indexes checked/created.")
    app.run(host='0.0.0.0', port=5002, debug=True)