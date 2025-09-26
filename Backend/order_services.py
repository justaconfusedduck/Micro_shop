import os
from pymongo import MongoClient
import json
import uuid
from flask import Flask, jsonify
from flask_cors import CORS
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)
CORS(app, supports_credentials=True, origins=["http://localhost:5173"])
PRODUCT_SERVICE_URL = "http://product_service:5002"
INVENTORY_SERVICE_URL = "http://inventory_service:5003"
CART_SERVICE_URL = "http://cart_service:5004"
MONGO_URI = os.environ.get('ORDER_DB_URI')
SECRET_KEY = os.environ.get('SECRET_KEY')
if not MONGO_URI or not SECRET_KEY:
    raise RuntimeError("Database URI or SECRET_KEY not found in .env file")
client = MongoClient(MONGO_URI)
db = client.order_db
orders_collection = db.orders


@app.route("/orders/create/<string:user_id>", methods=['POST'])
def create_order(user_id):
    print(f"Attempting to create order for user: {user_id}")
    try:
        print(f"--> Calling Cart Service at {CART_SERVICE_URL}/cart/{user_id}")
        cart_response = requests.get(f"{CART_SERVICE_URL}/cart/{user_id}",
                                     timeout=5)
        cart_response.raise_for_status()
        cart_items = cart_response.json()
        if not cart_items:
            return jsonify({"message": "Cart is empty"}), 400
        print(f"<-- Cart Service responded with {len(cart_items)} items.")
    except requests.exceptions.RequestException as e:
        print(f"!!! ERROR connecting to Cart Service: {e}")
        return jsonify({"message": f"Could not fetch cart: {e}"}), 500
    order_items = []
    total_price = 0
    try:
        for item in cart_items:
            print(
                f"--> Calling Product Service for product: {item['product_id']}"
            )
            product_response = requests.get(
                f"{PRODUCT_SERVICE_URL}/products/{item['product_id']}",
                timeout=5)
            product_response.raise_for_status()
            product = product_response.json()
            order_items.append({
                "product_id": product['id'],
                "name": product['name'],
                "quantity": item['quantity'],
                "price_per_item": float(product['price'])
            })
            total_price += float(product['price']) * item['quantity']
        print("<-- Product details fetched successfully.")
    except requests.exceptions.RequestException as e:
        print(f"!!! ERROR connecting to Product Service: {e}")
        return jsonify({"message":
                        f"Could not fetch product details: {e}"}), 500
    try:
        for item in order_items:
            print(
                f"--> Calling Inventory Service to decrease stock for: {item['product_id']}"
            )
            inventory_response = requests.post(
                f"{INVENTORY_SERVICE_URL}/inventory/decrease",
                json={
                    "product_id": item['product_id'],
                    "quantity": item['quantity']
                },
                timeout=5)
            inventory_response.raise_for_status()
        print("<-- Inventory updated successfully.")
    except requests.exceptions.RequestException as e:
        print(f"!!! ERROR connecting to Inventory Service: {e}")
        return jsonify({"message": f"Could not update inventory: {e}"}), 500
    try:
        print("--> Saving final order to database...")
        new_order = {
            "order_id": str(uuid.uuid4()),
            "user_id": user_id,
            "items": order_items,
            "total_price": total_price,
            "status": "completed",
            "created_at": datetime.now(timezone.utc)
        }
        orders_collection.insert_one(new_order)
        print("<-- Order saved successfully.")
    except Exception as e:
        print(f"!!! ERROR saving order to MongoDB: {e}")
        return jsonify({"message": "Could not save order"}), 500
    try:
        print(f"--> Calling Cart Service to clear cart for user: {user_id}")
        requests.post(f"{CART_SERVICE_URL}/cart/{user_id}/clear", timeout=5)
        print("<-- Cart cleared.")
    except requests.exceptions.RequestException as e:
        print(
            f"!!! WARNING: Could not clear cart for user {user_id}. Error: {e}"
        )
    return jsonify({
        "message": "Order placed successfully",
        "order_id": new_order['order_id']
    }), 201


@app.route("/orders/<string:user_id>", methods=['GET'])
def get_orders(user_id):
    orders = list(
        orders_collection.find({
            'user_id': user_id
        }, {
            '_id': 0
        }).sort('created_at', -1))
    return jsonify(orders)


if __name__ == '__main__':
    orders_collection.create_index('user_id')
    orders_collection.create_index('order_id', unique=True)
    print("MongoDB order indexes checked/created.")
    app.run(host='0.0.0.0', port=5005, debug=True)
