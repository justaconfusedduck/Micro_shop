# cart_service.py (Corrected to use .env and include remove functionality)

import os
from pymongo import MongoClient
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv # Import the dotenv library

# Load environment variables from .env file
load_dotenv()

# 1. --- SETUP ---
app = Flask(__name__)
CORS(app, supports_credentials=True, origins=["null", "http://127.0.0.1:8080", "http://localhost:5173","http://192.168.1.*","http://172.31.30.*"])

# --- MONGODB ATLAS CONNECTION ---
# Securely load the URI from the environment variable defined in your .env file
MONGO_URI = os.environ.get('CART_DB_URI')

if not MONGO_URI:
    raise RuntimeError("CART_DB_URI not found in .env file")

client = MongoClient(MONGO_URI)
db = client.cart_db
carts_collection = db.carts

# 2. --- API ENDPOINTS ---

@app.route("/cart/<string:user_id>", methods=['GET'])
def get_cart(user_id):
    """Returns the contents of a user's cart."""
    try:
        cart = carts_collection.find_one({'user_id': user_id}, {'_id': 0, 'user_id': 0})
        if cart is None:
            return jsonify([])
        return jsonify(cart.get('items', []))
    except Exception as e:
        print(f"Database error: {e}")
        return jsonify({"message": "Error fetching cart"}), 500

@app.route("/cart/<string:user_id>/add", methods=['POST'])
def add_to_cart(user_id):
    """Adds a product to a user's cart or increments its quantity."""
    data = request.get_json()
    product_id = data.get('product_id')
    quantity_to_add = data.get('quantity', 1)

    if not product_id or not isinstance(quantity_to_add, int) or quantity_to_add <= 0:
        return jsonify({"message": "Valid Product ID and positive quantity are required"}), 400

    try:
        cart_with_item = carts_collection.find_one({'user_id': user_id, 'items.product_id': product_id})

        if cart_with_item:
            carts_collection.update_one(
                {'user_id': user_id, 'items.product_id': product_id},
                {'$inc': {'items.$.quantity': quantity_to_add}}
            )
        else:
            carts_collection.update_one(
                {'user_id': user_id},
                {'$push': {'items': {'product_id': product_id, 'quantity': quantity_to_add}}},
                upsert=True
            )
        return jsonify({"message": "Item added to cart"}), 200
    except Exception as e:
        print(f"Database error: {e}")
        return jsonify({"message": "Error updating cart"}), 500
        
@app.route("/cart/<string:user_id>/remove", methods=['POST'])
def remove_from_cart(user_id):
    """Decreases an item's quantity by 1 or removes it from the cart if quantity is 1."""
    data = request.get_json()
    product_id = data.get('product_id')

    if not product_id:
        return jsonify({"message": "Product ID is required"}), 400
    
    try:
        cart = carts_collection.find_one(
            {'user_id': user_id, 'items.product_id': product_id},
            {'_id': 0, 'items.$': 1}
        )

        if not cart or not cart.get('items'):
            return jsonify({"message": "Item not in cart"}), 404

        current_quantity = cart['items'][0]['quantity']

        if current_quantity > 1:
            carts_collection.update_one(
                {'user_id': user_id, 'items.product_id': product_id},
                {'$inc': {'items.$.quantity': -1}}
            )
        else:
            carts_collection.update_one(
                {'user_id': user_id},
                {'$pull': {'items': {'product_id': product_id}}}
            )
        return jsonify({"message": "Item updated in cart"}), 200
    except Exception as e:
        print(f"Database error: {e}")
        return jsonify({"message": "Error updating cart"}), 500

@app.route("/cart/<string:user_id>/clear", methods=['POST'])
def clear_cart(user_id):
    """Removes all items from a user's cart."""
    try:
        carts_collection.update_one(
            {'user_id': user_id},
            {'$set': {'items': []}}
        )
        return jsonify({"message": "Cart cleared successfully"}), 200
    except Exception as e:
        print(f"Database error: {e}")
        return jsonify({"message": "Error clearing cart"}), 500

# 3. --- RUN THE APPLICATION ---
if __name__ == '__main__':
    carts_collection.create_index('user_id', unique=True)
    print("MongoDB cart 'user_id' index checked/created.")
    app.run(host='0.0.0.0', port=5004, debug=True)

