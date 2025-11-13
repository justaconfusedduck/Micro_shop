import os
from pymongo import MongoClient
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import jwt
from functools import wraps

load_dotenv()

app = Flask(__name__)
CORS(app, supports_credentials=True, origins=["http://localhost:5173", "http://127.0.0.1:5173","http://192.168.1.*","http://172.31.30.*"])

MONGO_URI = os.environ.get('INVENTORY_DB_URI')
SECRET_KEY = os.environ.get('SECRET_KEY')

if not MONGO_URI or not SECRET_KEY:
    raise RuntimeError("Database URI or SECRET_KEY not found in .env file")

client = MongoClient(MONGO_URI)
db = client.inventory_db
inventory_collection = db.inventory

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.method == 'OPTIONS':
            return jsonify({}), 200

        token = request.headers.get('Authorization', ' ').split(" ")[-1]
        if not token: return jsonify({'message': 'Authentication Token is missing!'}), 401
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            if data.get('role') != 'admin': return jsonify({'message': 'This action requires an admin account!'}), 403
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return jsonify({'message': 'Token is invalid or expired!'}), 401
        return f(*args, **kwargs)
    return decorated

def seed_database():
    if inventory_collection.count_documents({}) == 0:
        seed_data = [
            {'product_id': 'P001', 'quantity': 100},
            {'product_id': 'P002', 'quantity': 25},
            {'product_id': 'P003', 'quantity': 50},
            {'product_id': 'P004', 'quantity': 15}
        ]
        inventory_collection.insert_many(seed_data)
        print("Inventory database seeded with initial stock levels.")

@app.route("/inventory", methods=['GET'])
def get_public_inventory():
    try:
        all_stock = list(inventory_collection.find({}, {'_id': 0}))
        return jsonify(all_stock), 200
    except Exception as e:
        print(f"Database error: {e}")
        return jsonify({"message": "Error fetching all inventory"}), 500

@app.route("/inventory/<string:product_id>", methods=['GET'])
def get_inventory(product_id):
    try:
        stock = inventory_collection.find_one({'product_id': product_id}, {'_id': 0})
        
        if stock is None:
            return jsonify({"product_id": product_id, "quantity": 0})
            
        return jsonify(stock)
    except Exception as e:
        print(f"Database error: {e}")
        return jsonify({"message": "Error fetching inventory"}), 500

@app.route("/inventory/decrease", methods=['POST'])
def decrease_inventory():
    data = request.get_json()
    product_id = data.get('product_id')
    quantity_to_decrease = data.get('quantity')

    if not product_id or not isinstance(quantity_to_decrease, int) or quantity_to_decrease <= 0:
        return jsonify({"message": "Valid Product ID and positive quantity are required"}), 400

    try:
        result = inventory_collection.find_one_and_update(
            {'product_id': product_id, 'quantity': {'$gte': quantity_to_decrease}},
            {'$inc': {'quantity': -quantity_to_decrease}}
        )

        if result is None:
            return jsonify({"message": "Insufficient stock or product not found"}), 400
        
        return jsonify({"message": "Inventory updated successfully"}), 200
        
    except Exception as e:
        print(f"Database error: {e}")
        return jsonify({"message": "Error updating inventory"}), 500

@app.route("/admin/inventory", methods=['GET', 'OPTIONS'])
@admin_required
def get_all_inventory():
    try:
        all_stock = list(inventory_collection.find({}, {'_id': 0}))
        return jsonify(all_stock), 200
    except Exception as e:
        print(f"Database error: {e}")
        return jsonify({"message": "Error fetching all inventory"}), 500

@app.route("/admin/inventory/update", methods=['POST', 'OPTIONS'])
@admin_required
def update_inventory():
    data = request.get_json()
    product_id = data.get('product_id')
    new_quantity = data.get('quantity')

    if not product_id or not isinstance(new_quantity, int) or new_quantity < 0:
        return jsonify({"message": "Valid Product ID and non-negative quantity are required"}), 400

    try:
        result = inventory_collection.update_one(
            {'product_id': product_id},
            {'$set': {'quantity': new_quantity}},
            upsert=True
        )
        
        if result.upserted_id:
            message = "New product added to inventory."
        else:
            message = "Inventory updated successfully."
            
        return jsonify({"message": message, "product_id": product_id, "new_quantity": new_quantity}), 200
        
    except Exception as e:
        print(f"Database error: {e}")
        return jsonify({"message": "Error updating inventory"}), 500

if __name__ == '__main__':
    inventory_collection.create_index('product_id', unique=True)
    print("MongoDB inventory 'product_id' index checked/created.")
    
    seed_database()
    
    app.run(host='0.0.0.0', port=5003, debug=True)