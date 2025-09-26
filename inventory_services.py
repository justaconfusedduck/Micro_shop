import os
from pymongo import MongoClient
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app,
     supports_credentials=True,
     origins=["null", "http://127.0.0.1:8080", "http://localhost:5173"])
MONGO_URI = os.environ.get(
    'INVENTORY_DB_URI',
    'mongodb+srv://Not_GB:4Fuoje4xVWMt7yRb@zero.uvzi6xo.mongodb.net/?retryWrites=true&w=majority&appName=Zero'
)
client = MongoClient(MONGO_URI)
db = client.inventory_db
inventory_collection = db.inventory


def seed_database():
    if inventory_collection.count_documents({}) == 0:
        seed_data = [{
            'product_id': 'P001',
            'quantity': 100
        }, {
            'product_id': 'P002',
            'quantity': 25
        }, {
            'product_id': 'P003',
            'quantity': 50
        }, {
            'product_id': 'P004',
            'quantity': 15
        }]
        inventory_collection.insert_many(seed_data)
        print("Inventory database seeded with initial stock levels.")


@app.route("/inventory/<string:product_id>", methods=['GET'])
def get_inventory(product_id):
    try:
        stock = inventory_collection.find_one({'product_id': product_id},
                                              {'_id': 0})
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
    if not product_id or not isinstance(quantity_to_decrease,
                                        int) or quantity_to_decrease <= 0:
        return jsonify(
            {"message":
             "Valid Product ID and positive quantity are required"}), 400
    try:
        result = inventory_collection.find_one_and_update(
            {
                'product_id': product_id,
                'quantity': {
                    '$gte': quantity_to_decrease
                }
            }, {'$inc': {
                'quantity': -quantity_to_decrease
            }})
        if result is None:
            return jsonify(
                {"message": "Insufficient stock or product not found"}), 400
        return jsonify({"message": "Inventory updated successfully"}), 200
    except Exception as e:
        print(f"Database error: {e}")
        return jsonify({"message": "Error updating inventory"}), 500


if __name__ == '__main__':
    inventory_collection.create_index('product_id', unique=True)
    print("MongoDB inventory 'product_id' index checked/created.")
    seed_database()
    app.run(host='0.0.0.0', port=5003, debug=True)
