from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
import uuid
from datetime import datetime

app = Flask(__name__)
CORS(app)
orders = {}
CART_SERVICE_URL = "http://127.0.0.1:5004"
PRODUCT_SERVICE_URL = "http://127.0.0.1:5002"
INVENTORY_SERVICE_URL = "http://127.0.0.1:5003"


@app.route("/")
def index():
    return "Welcome to the Order Service!"


@app.route("/orders/<string:user_id>", methods=['GET'])
def get_user_orders(user_id):
    user_orders = orders.get(user_id, [])
    return jsonify(user_orders)


@app.route("/orders/create/<string:user_id>", methods=['POST'])
def create_order(user_id):
    print(f"Attempting to create order for user: {user_id}")
    try:
        cart_response = requests.get(f"{CART_SERVICE_URL}/cart/{user_id}")
        cart_response.raise_for_status()
        cart_items = cart_response.json()
        if not cart_items:
            return jsonify({"message":
                            "Cart is empty, cannot create order"}), 400
    except requests.exceptions.RequestException as e:
        print(f"Error communicating with Cart Service: {e}")
        return jsonify({"message": "Could not retrieve cart"}), 500
    order_items = []
    total_price = 0
    for item in cart_items:
        product_id = item['product_id']
        quantity = item['quantity']
        try:
            product_response = requests.get(
                f"{PRODUCT_SERVICE_URL}/products/{product_id}")
            product_response.raise_for_status()
            product_data = product_response.json()
        except requests.exceptions.RequestException as e:
            print(
                f"Error communicating with Product Service for ID {product_id}: {e}"
            )
            return jsonify({
                "message":
                f"Could not retrieve details for product {product_id}"
            }), 500
        try:
            inventory_payload = {
                "product_id": product_id,
                "quantity": quantity
            }
            inventory_response = requests.post(
                f"{INVENTORY_SERVICE_URL}/inventory/decrease",
                json=inventory_payload)
            inventory_response.raise_for_status()
        except requests.exceptions.RequestException as e:
            print(
                f"Error communicating with Inventory Service for ID {product_id}: {e}"
            )
            return jsonify({
                "message":
                f"Could not update inventory for product {product_id}. Order cancelled."
            }), 500
        order_items.append({
            "product_id": product_id,
            "name": product_data['name'],
            "quantity": quantity,
            "price_per_item": product_data['price']
        })
        total_price += product_data['price'] * quantity
    payment_status = "SUCCESSFUL"
    new_order = {
        "order_id": str(uuid.uuid4()),
        "user_id": user_id,
        "items": order_items,
        "total_price": total_price,
        "status": "completed",
        "payment_status": payment_status,
        "created_at": datetime.utcnow().isoformat()
    }
    if user_id not in orders:
        orders[user_id] = []
    orders[user_id].append(new_order)
    print(
        f"Successfully created new order: {new_order['order_id']} for user {user_id}"
    )
    try:
        clear_cart_response = requests.post(
            f"{CART_SERVICE_URL}/cart/{user_id}/clear")
        clear_cart_response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(
            f"Warning: Could not clear cart for user {user_id} after order completion: {e}"
        )
    return jsonify(new_order), 201


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5005, debug=True)
