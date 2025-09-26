import os
from pymongo import MongoClient
import json
import uuid
from flask import Flask, jsonify
from flask_cors import CORS
import requests
from datetime import datetime, timezone

app = Flask(__name__)
CORS(app, supports_credentials=True, origins=["null", "http://127.0.0.1:8080"])
PRODUCT_SERVICE_URL = "http://1227.0.0.1:5002"
INVENTORY_SERVICE_URL = "http://127.0.0.1:5003"
CART_SERVICE_URL = "http://127.0.0.1:5004"
MONGO_URI = os.environ.get(
    'ORDER_DB_URI',
    'mongodb+srv://Not_GB:4Fuoje4xVWMt7yRb@zero.uvzi6xo.mongodb.net/?retryWrites=true&w=majority&appName=Zero'
)
client = MongoClient(MONGO_URI)
db = client.order_db
orders_collection = db.orders


@app.route("/orders/create/<string:user_id>", methods=['POST'])
def create_order(user_id):
    try:
        cart_response = requests.get(f"{CART_SERVICE_URL}/cart/{user_id}")
        cart_response.raise_for_status()
        cart_items = cart_response.json()
        if not cart_items:
            return jsonify({"message": "Cart is empty"}), 400
    except requests.RequestException as e:
        print(f"Error fetching cart: {e}")
        return jsonify({"message": "Could not fetch cart"}), 500
    order_items = []
    total_price = 0
    try:
        for item in cart_items:
            product_response = requests.get(
                f"{PRODUCT_SERVICE_URL}/products/{item['product_id']}")
            product_response.raise_for_status()
            product = product_response.json()
            order_items.append({
                "product_id": product['id'],
                "name": product['name'],
                "quantity": item['quantity'],
                "price_per_item": float(product['price'])
            })
            total_price += float(product['price']) * item['quantity']
    except requests.RequestException as e:
        print(f"Error fetching product details: {e}")
        return jsonify({"message": "Could not fetch product details"}), 500
    for item in order_items:
        try:
            inventory_response = requests.post(
                f"{INVENTORY_SERVICE_URL}/inventory/decrease",
                json={
                    "product_id": item['product_id'],
                    "quantity": item['quantity']
                })
            if inventory_response.status_code != 200:
                error_details = inventory_response.json()
                return jsonify({
                    "message": f"Insufficient stock for {item['name']}",
                    "details": error_details
                }), 400
        except requests.RequestException as e:
            print(f"Error updating inventory: {e}")
            return jsonify({"message": "Could not update inventory"}), 500
    try:
        new_order = {
            "order_id": str(uuid.uuid4()),
            "user_id": user_id,
            "items": order_items,
            "total_price": total_price,
            "status": "completed",
            "created_at": datetime.now(timezone.utc)
        }
        orders_collection.insert_one(new_order)
    except Exception as e:
        print(f"Database error on order insert: {e}")
        return jsonify({"message": "Could not save order"}), 500
    try:
        requests.post(f"{CART_SERVICE_URL}/cart/{user_id}/clear")
    except requests.RequestException as e:
        print(f"Warning: Could not clear cart for user {user_id}. Error: {e}")
    return jsonify({
        "message": "Order placed successfully",
        "order_id": new_order['order_id']
    }), 201


@app.route("/orders/<string:user_id>", methods=['GET'])
def get_orders(user_id):
    try:
        orders = list(
            orders_collection.find({
                'user_id': user_id
            }, {
                '_id': 0
            }).sort('created_at', -1))
        return jsonify(orders)
    except Exception as e:
        print(f"Database error fetching orders: {e}")
        return jsonify({"message": "Error fetching orders"}), 500


if __name__ == '__main__':
    orders_collection.create_index('user_id')
    orders_collection.create_index('order_id', unique=True)
    print("MongoDB order indexes checked/created.")
    app.run(host='0.0.0.0', port=5005, debug=True)
