import os
from pymongo import MongoClient, DESCENDING
import json
import uuid
from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv
import jwt
from functools import wraps

load_dotenv()

app = Flask(__name__)
CORS(app, supports_credentials=True, origins=["http://localhost:5173", "http://127.0.0.1:5173"])

PRODUCT_SERVICE_URL = "http://product_service:5002"
INVENTORY_SERVICE_URL = "http://inventory_service:5003"
CART_SERVICE_URL = "http://cart_service:5004"
PAYMENT_SERVICE_URL = "http://payment_service:5007"

MONGO_URI = os.environ.get('ORDER_DB_URI')
SECRET_KEY = os.environ.get('SECRET_KEY')
if not MONGO_URI or not SECRET_KEY:
    raise RuntimeError("Database URI or SECRET_KEY not found in .env file")
client = MongoClient(MONGO_URI)
db = client.order_db
orders_collection = db.orders

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

@app.route("/orders/create/<string:user_id>", methods=['POST', 'OPTIONS'])
def create_order(user_id):
    if request.method == 'OPTIONS':
        return jsonify({}), 200

    print(f"Attempting to create order for user: {user_id}")

    # Step 1: Get cart contents
    try:
        print(f"--> Calling Cart Service at {CART_SERVICE_URL}/cart/{user_id}")
        cart_response = requests.get(f"{CART_SERVICE_URL}/cart/{user_id}", timeout=5)
        cart_response.raise_for_status()
        cart_items = cart_response.json()
        if not cart_items:
            return jsonify({"message": "Cart is empty"}), 400
        print(f"<-- Cart Service responded with {len(cart_items)} items.")
    except requests.exceptions.RequestException as e:
        print(f"!!! ERROR connecting to Cart Service: {e}")
        return jsonify({"message": f"Could not fetch cart: {e}"}), 500

    # Step 2: Get product details and calculate total
    order_items = []
    total_price = 0
    try:
        for item in cart_items:
            print(f"--> Calling Product Service for product: {item['product_id']}")
            product_response = requests.get(f"{PRODUCT_SERVICE_URL}/products/{item['product_id']}", timeout=5)
            product_response.raise_for_status()
            product = product_response.json()
            
            order_items.append({
                "product_id": product['id'], "name": product['name'],
                "quantity": item['quantity'], "price_per_item": float(product['price'])
            })
            total_price += float(product['price']) * item['quantity']
        print("<-- Product details fetched successfully.")
    except requests.exceptions.RequestException as e:
        print(f"!!! ERROR connecting to Product Service: {e}")
        return jsonify({"message": f"Could not fetch product details: {e}"}), 500

    # Step 3: Decrease inventory (MOVED UP)
    try:
        for item in order_items:
            print(f"--> Calling Inventory Service to decrease stock for: {item['product_id']}")
            inventory_response = requests.post(
                f"{INVENTORY_SERVICE_URL}/inventory/decrease",
                json={"product_id": item['product_id'], "quantity": item['quantity']},
                timeout=5
            )
            
            if inventory_response.status_code != 200:
                error_data = inventory_response.json()
                print(f"!!! Inventory Failed: {error_data.get('message')}")
                return jsonify({"message": error_data.get('message')}), 400

        print("<-- Inventory updated successfully.")
    except requests.exceptions.RequestException as e:
        print(f"!!! ERROR connecting to Inventory Service: {e}")
        return jsonify({"message": "Inventory service unavailable."}), 503

    # Step 4: Process Payment (MOVED DOWN)
    try:
        print(f"--> Calling Payment Service for ${total_price}...")
        payment_response = requests.post(
            f"{PAYMENT_SERVICE_URL}/payment/process",
            json={"user_id": user_id, "amount": total_price},
            timeout=10
        )
        
        if payment_response.status_code != 200:
            error_data = payment_response.json()
            print(f"!!! Payment Failed: {error_data.get('error')}")
            
            # TODO: Add logic here to *refund* the inventory decrease
            
            return jsonify({"message": f"Payment failed: {error_data.get('error')}"}), 402
            
        payment_data = payment_response.json()
        transaction_id = payment_data['transaction_id']
        print(f"<-- Payment successful. Transaction ID: {transaction_id}")

    except requests.exceptions.RequestException as e:
        print(f"!!! ERROR connecting to Payment Service: {e}")
        
        # TODO: Add logic here to *refund* the inventory decrease
        
        return jsonify({"message": "Payment service unavailable. Try again later."}), 503

    # Step 5: Create and save the order
    try:
        print("--> Saving final order to database...")
        new_order = {
            "order_id": str(uuid.uuid4()),
            "user_id": user_id,
            "items": order_items,
            "total_price": total_price,
            "transaction_id": transaction_id,
            "status": "completed",
            "created_at": datetime.now(timezone.utc)
        }
        orders_collection.insert_one(new_order)
        print("<-- Order saved successfully.")
    except Exception as e:
        print(f"!!! ERROR saving order to MongoDB: {e}")
        return jsonify({"message": "Could not save order"}), 500

    # Step 6: Clear the cart
    try:
        print(f"--> Calling Cart Service to clear cart for user: {user_id}")
        requests.post(f"{CART_SERVICE_URL}/cart/{user_id}/clear", timeout=5)
        print("<-- Cart cleared.")
    except requests.exceptions.RequestException as e:
        print(f"!!! WARNING: Could not clear cart for user {user_id}. Error: {e}")

    return jsonify({"message": "Order placed successfully", "order_id": new_order['order_id']}), 201


@app.route("/orders/<string:user_id>", methods=['GET'])
def get_orders(user_id):
    orders = list(orders_collection.find({'user_id': user_id}, {'_id': 0}).sort('created_at', -1))
    return jsonify(orders)

@app.route("/admin/orders", methods=['GET', 'OPTIONS'])
@admin_required
def get_all_orders():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    try:
        orders = list(orders_collection.find({}, {'_id': 0}).sort('created_at', DESCENDING))
        return jsonify(orders), 200
    except Exception as e:
        print(f"Database error: {e}")
        return jsonify({"message": "Error fetching all orders"}), 500

@app.route("/admin/stats", methods=['GET', 'OPTIONS'])
@admin_required
def get_admin_stats():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    try:
        pipeline = [
            {
                "$group": {
                    "_id": None,
                    "totalRevenue": {"$sum": "$total_price"},
                    "totalOrders": {"$sum": 1}
                }
            }
        ]
        stats = list(orders_collection.aggregate(pipeline))
        
        if not stats:
            return jsonify({"totalRevenue": 0, "totalOrders": 0}), 200
            
        return jsonify({
            "totalRevenue": stats[0]['totalRevenue'],
            "totalOrders": stats[0]['totalOrders']
        }), 200
    except Exception as e:
        print(f"Database error: {e}")
        return jsonify({"message": "Error calculating stats"}), 500

if __name__ == '__main__':
    orders_collection.create_index('user_id')
    orders_collection.create_index('order_id', unique=True)
    orders_collection.create_index([('created_at', DESCENDING)])
    print("MongoDB order indexes checked/created.")
    app.run(host='0.0.0.0', port=5005, debug=True)