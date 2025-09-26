import os
from pymongo import MongoClient
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)
CORS(app,
     supports_credentials=True,
     origins=["null", "http://127.0.0.1:8080", "http://localhost:5173"])
MONGO_URI = os.environ.get('PRODUCT_DB_URI')
client = MongoClient(MONGO_URI)
db = client.product_db
products_collection = db.products


def seed_database():
    if products_collection.count_documents({}) == 0:
        seed_data = [{
            'id': 'P001',
            'name': 'The Pragmatic Programmer',
            'description':
            'A classic book for any serious software developer.',
            'price': 45.50
        }, {
            'id': 'P002',
            'name': 'Mechanical Keyboard',
            'description':
            'A high-quality mechanical keyboard with backlit keys.',
            'price': 75.00
        }, {
            'id': 'P003',
            'name': 'Ergonomic Mouse',
            'description':
            'A comfortable mouse designed to reduce wrist strain.',
            'price': 55.25
        }, {
            'id': 'P004',
            'name': '4K Monitor',
            'description': 'A 27-inch 4K UHD monitor with stunning clarity.',
            'price': 350.00
        }]
        products_collection.insert_many(seed_data)
        print("Product database seeded with initial data.")


@app.route("/products", methods=['GET'])
def get_products():
    try:
        products = list(products_collection.find({}, {'_id': 0}))
        return jsonify(products)
    except Exception as e:
        print(f"Database error: {e}")
        return jsonify({"message": "Error fetching products"}), 500


@app.route("/products/<string:product_id>", methods=['GET'])
def get_product(product_id):
    try:
        product = products_collection.find_one({'id': product_id}, {'_id': 0})
        if product is None:
            return jsonify({"message": "Product not found"}), 404
        return jsonify(product)
    except Exception as e:
        print(f"Database error: {e}")
        return jsonify({"message": "Error fetching product details"}), 500


if __name__ == '__main__':
    products_collection.create_index('id', unique=True)
    print("MongoDB product 'id' index checked/created.")
    seed_database()
    app.run(host='0.0.0.0', port=5002, debug=True)
