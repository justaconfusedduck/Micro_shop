import os
from pymongo import MongoClient
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
import jwt
from functools import wraps
import uuid

load_dotenv()
app = Flask(__name__)
CORS(app,
     supports_credentials=True,
     origins=["null", "http://127.0.0.1:8080", "http://localhost:5173"])
MONGO_URI = os.environ.get('PRODUCT_DB_URI')
SECRET_KEY = os.environ.get('SECRET_KEY')
if not MONGO_URI or not SECRET_KEY:
    raise RuntimeError("Database URI or SECRET_KEY not found in .env file")
client = MongoClient(MONGO_URI)
db = client.product_db
products_collection = db.products


def seller_required(f):

    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            token = request.headers['Authorization'].split(" ")[1]
        if not token:
            return jsonify({'message':
                            'Authentication Token is missing!'}), 401
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            current_user_role = data.get('role')
            current_user_name = data.get('sub')
            if current_user_role != 'seller':
                return jsonify(
                    {'message': 'This action requires a seller account!'}), 403
        except jwt.ExpiredSignatureError:
            return jsonify({'message': 'Token has expired!'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'message': 'Token is invalid!'}), 401
        return f(current_user_name, *args, **kwargs)

    return decorated


@app.route("/products", methods=['GET'])
def get_products():
    try:
        products = list(products_collection.find({}, {'_id': 0}))
        return jsonify(products)
    except Exception as e:
        return jsonify({"message": "Error fetching products"}), 500


@app.route("/products/<string:product_id>", methods=['GET'])
def get_product(product_id):
    try:
        product = products_collection.find_one({'id': product_id}, {'_id': 0})
        if product is None:
            return jsonify({"message": "Product not found"}), 404
        return jsonify(product)
    except Exception as e:
        return jsonify({"message": "Error fetching product details"}), 500


@app.route("/products/search", methods=['GET'])
def search_products():
    query = request.args.get('q', '')
    try:
        results = list(
            products_collection.find({'$text': {
                '$search': query
            }}, {'_id': 0}))
        return jsonify(results)
    except Exception as e:
        return jsonify({"message": "Error during search"}), 500


@app.route("/products", methods=['POST'])
@seller_required
def create_product(current_seller):
    data = request.get_json()
    if not data or not data.get('name') or not data.get('price'):
        return jsonify({'message': 'Name and price are required!'}), 400
    new_product = {
        'id': f"P{uuid.uuid4().hex[:4]}",
        'name': data['name'],
        'description': data.get('description', ''),
        'price': float(data['price']),
        'owner_id': current_seller
    }
    try:
        products_collection.insert_one(new_product)
        new_product.pop('_id', None)
        return jsonify(new_product), 201
    except Exception as e:
        return jsonify({'message': f'Could not create product: {e}'}), 500


@app.route("/products/<string:product_id>", methods=['PUT'])
@seller_required
def update_product(current_seller, product_id):
    data = request.get_json()
    if not data:
        return jsonify({'message': 'No update data provided!'}), 400
    try:
        product = products_collection.find_one({'id': product_id})
        if not product:
            return jsonify({'message': 'Product not found!'}), 404
        if product.get('owner_id') != current_seller:
            return jsonify(
                {'message':
                 'You are not authorized to edit this product!'}), 403
        update_data = {
            k: v
            for k, v in data.items() if k not in ['id', 'owner_id', '_id']
        }
        if 'price' in update_data:
            update_data['price'] = float(update_data['price'])
        products_collection.update_one({'id': product_id},
                                       {'$set': update_data})
        return jsonify({'message': 'Product updated successfully'}), 200
    except Exception as e:
        return jsonify({'message': f'Could not update product: {e}'}), 500


@app.route("/products/<string:product_id>", methods=['DELETE'])
@seller_required
def delete_product(current_seller, product_id):
    try:
        product = products_collection.find_one({'id': product_id})
        if not product:
            return jsonify({'message': 'Product not found!'}), 404
        if product.get('owner_id') != current_seller:
            return jsonify(
                {'message':
                 'You are not authorized to delete this product!'}), 403
        products_collection.delete_one({'id': product_id})
        return jsonify({'message': 'Product deleted successfully'}), 200
    except Exception as e:
        return jsonify({'message': f'Could not delete product: {e}'}), 500


if __name__ == '__main__':
    products_collection.create_index([('name', 'text'),
                                      ('description', 'text')])
    products_collection.create_index('id', unique=True)
    products_collection.create_index('owner_id')
    print("MongoDB product indexes checked/created.")
    app.run(host='0.0.0.0', port=5002, debug=True)
