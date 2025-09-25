from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
inventory = {"P001": 100, "P002": 25, "P003": 50, "P004": 75}


@app.route("/")
def index():
    return "Welcome to the Inventory Service!"


@app.route("/inventory/<string:product_id>", methods=['GET'])
def get_inventory(product_id):
    stock_quantity = inventory.get(product_id)
    if stock_quantity is not None:
        return jsonify({
            "product_id": product_id,
            "stock_quantity": stock_quantity
        }), 200
    else:
        return jsonify({"message": "Product not found in inventory"}), 404


@app.route("/inventory/decrease", methods=['POST'])
def decrease_inventory():
    data = request.get_json()
    if not data or 'product_id' not in data or 'quantity' not in data:
        return jsonify({"message":
                        "product_id and quantity are required"}), 400
    product_id = data['product_id']
    quantity_to_decrease = int(data['quantity'])
    if product_id in inventory:
        if inventory[product_id] >= quantity_to_decrease:
            inventory[product_id] -= quantity_to_decrease
            print(
                f"Decreased stock for {product_id}. New stock: {inventory[product_id]}"
            )
            return jsonify({
                "message": "Inventory updated successfully",
                "product_id": product_id,
                "new_stock": inventory[product_id]
            }), 200
        else:
            return jsonify({"message": "Insufficient stock"}), 400
    else:
        return jsonify({"message": "Product not found in inventory"}), 404


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5003, debug=True)
