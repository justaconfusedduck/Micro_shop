import os
from pymongo import MongoClient
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)
CORS(app,
     supports_credentials=True,
     origins=["null", "http://127.0.0.1:8080", "http://localhost:5173"])
MONGO_URI = os.environ.get('WISHLIST_DB_URI')
client = MongoClient(MONGO_URI)
db = client.wishlist_db
wishlists_collection = db.wishlists


@app.route("/wishlist/<string:user_id>", methods=['GET'])
def get_wishlist(user_id):
    try:
        wishlist = wishlists_collection.find_one({'user_id': user_id}, {
            '_id': 0,
            'user_id': 0
        })
        if wishlist is None:
            return jsonify([])
        return jsonify(wishlist.get('product_ids', []))
    except Exception as e:
        print(f"Database error: {e}")
        return jsonify({"message": "Error fetching wishlist"}), 500


@app.route("/wishlist/<string:user_id>/add", methods=['POST'])
def add_to_wishlist(user_id):
    data = request.get_json()
    product_id = data.get('product_id')
    if not product_id:
        return jsonify({"message": "Product ID is required"}), 400
    try:
        wishlists_collection.update_one(
            {'user_id': user_id}, {'$addToSet': {
                'product_ids': product_id
            }},
            upsert=True)
        return jsonify({"message": "Item added to wishlist"}), 200
    except Exception as e:
        print(f"Database error: {e}")
        return jsonify({"message": "Error updating wishlist"}), 500


@app.route("/wishlist/<string:user_id>/remove", methods=['POST'])
def remove_from_wishlist(user_id):
    data = request.get_json()
    product_id = data.get('product_id')
    if not product_id:
        return jsonify({"message": "Product ID is required"}), 400
    try:
        wishlists_collection.update_one({'user_id': user_id},
                                        {'$pull': {
                                            'product_ids': product_id
                                        }})
        return jsonify({"message": "Item removed from wishlist"}), 200
    except Exception as e:
        print(f"Database error: {e}")
        return jsonify({"message": "Error updating wishlist"}), 500


if __name__ == '__main__':
    wishlists_collection.create_index('user_id', unique=True)
    print("MongoDB wishlist 'user_id' index checked/created.")
    app.run(host='0.0.0.0', port=5006, debug=True)
