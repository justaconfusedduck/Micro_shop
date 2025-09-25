from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
carts = {}


@app.route("/")
def index():
    return "Welcome to the Shopping Cart Service!"


@app.route("/cart/<string:user_id>", methods=['GET'])
def get_cart(user_id):
    print(f"Request to get cart for user: {user_id}")
    user_cart = carts.get(user_id, [])
    return jsonify(user_cart), 200


@app.route("/cart/<string:user_id>/add", methods=['POST'])
def add_to_cart(user_id):
    data = request.get_json()
    if not data or 'product_id' not in data or 'quantity' not in data:
        return jsonify({"message":
                        "product_id and quantity are required"}), 400
    product_id = data['product_id']
    quantity = int(data['quantity'])
    user_cart = carts.get(user_id, [])
    item_found = False
    for item in user_cart:
        if item['product_id'] == product_id:
            item['quantity'] += quantity
            item_found = True
            break
    if not item_found:
        user_cart.append({"product_id": product_id, "quantity": quantity})
    carts[user_id] = user_cart
    print(f"Updated cart for user {user_id}: {carts[user_id]}")
    return jsonify({"message": "Item added to cart", "cart": user_cart}), 201


@app.route("/cart/<string:user_id>/remove", methods=['POST'])
def remove_from_cart(user_id):
    data = request.get_json()
    if 'product_id' not in data:
        return jsonify({"message": "product_id is required"}), 400
    product_id_to_remove = data['product_id']
    user_cart = carts.get(user_id, [])
    original_cart_size = len(user_cart)
    updated_cart = [
        item for item in user_cart
        if item['product_id'] != product_id_to_remove
    ]
    if len(updated_cart) < original_cart_size:
        carts[user_id] = updated_cart
        print(f"Removed {product_id_to_remove} from cart for user {user_id}")
        return jsonify({
            "message": "Item removed from cart",
            "cart": updated_cart
        }), 200
    else:
        return jsonify({"message": "Item not found in cart"}), 404


@app.route("/cart/<string:user_id>/clear", methods=['POST'])
def clear_cart(user_id):
    if user_id in carts:
        carts[user_id] = []
        print(f"Cart cleared for user {user_id}")
        return jsonify({"message": "Cart cleared successfully"}), 200
    else:
        return jsonify({"message": "No active cart to clear"}), 200


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5004, debug=True)
