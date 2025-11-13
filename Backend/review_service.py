import os
from pymongo import MongoClient, DESCENDING, ASCENDING
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
CORS(app, supports_credentials=True, origins=["http://localhost:5173", "http://127.0.0.1:5173","http://192.168.1.*","http://172.31.30.*"])

MONGO_URI = os.environ.get('REVIEW_DB_URI')
ORDER_SERVICE_URL = "http://order_service:5005"
SECRET_KEY = os.environ.get('SECRET_KEY')

if not MONGO_URI or not SECRET_KEY or not ORDER_SERVICE_URL:
    raise RuntimeError("Database URI, Secret Key, or Order Service URL not found")

client = MongoClient(MONGO_URI)
db = client.review_db
reviews_collection = db.reviews

def buyer_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.method == 'OPTIONS':
            return jsonify({}), 200
        token = request.headers.get('Authorization', ' ').split(" ")[-1]
        if not token: return jsonify({'message': 'Authentication Token is missing!'}), 401
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            if data.get('role') not in ['buyer', 'admin']: 
                return jsonify({'message': 'This action requires a buyer or admin account!'}), 403
            kwargs['current_user_id'] = data.get('sub')
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return jsonify({'message': 'Token is invalid or expired!'}), 401
        return f(*args, **kwargs)
    return decorated

def seller_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.method == 'OPTIONS':
            return jsonify({}), 200
        token = request.headers.get('Authorization', ' ').split(" ")[-1]
        if not token: return jsonify({'message': 'Authentication Token is missing!'}), 401
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            if data.get('role') not in ['seller', 'admin']: 
                return jsonify({'message': 'This action requires a seller or admin account!'}), 403
            kwargs['current_user'] = data
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return jsonify({'message': 'Token is invalid or expired!'}), 401
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if request.method == 'OPTIONS':
            return jsonify({}), 200
        token = request.headers.get('Authorization', ' ').split(" ")[-1]
        if not token: return jsonify({'message': 'Authentication Token is missing!'}), 401
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            if data.get('role') != 'admin': 
                return jsonify({'message': 'This action requires an admin account!'}), 403
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return jsonify({'message': 'Token is invalid or expired!'}), 401
        return f(*args, **kwargs)
    return decorated

@app.route("/reviews/average/<string:product_id>", methods=['GET', 'OPTIONS'])
def get_average_rating(product_id):
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    try:
        pipeline = [
            {"$match": {"product_id": product_id, "status": "approved"}},
            {"$group": {"_id": "$product_id", "averageRating": {"$avg": "$rating"}, "reviewCount": {"$sum": 1}}}
        ]
        result = list(reviews_collection.aggregate(pipeline))
        if not result:
            return jsonify({"product_id": product_id, "averageRating": 0, "reviewCount": 0}), 200
        
        result[0]['product_id'] = result[0].pop('_id')
        return jsonify(result[0]), 200
    except Exception as e:
        return jsonify({"message": f"Error fetching average rating: {e}"}), 500

@app.route("/reviews/<string:product_id>", methods=['GET', 'OPTIONS'])
def get_reviews_for_product(product_id):
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    try:
        reviews = list(reviews_collection.find(
            {"product_id": product_id, "status": "approved"}, 
            {"_id": 0}
        ).sort('created_at', DESCENDING))
        return jsonify(reviews), 200
    except Exception as e:
        return jsonify({"message": f"Error fetching reviews: {e}"}), 500

@app.route("/reviews/check_eligibility", methods=['POST', 'OPTIONS'])
@buyer_required
def check_review_eligibility(current_user_id):
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    
    data = request.get_json()
    product_id = data.get('product_id')
    user_id = current_user_id

    if not product_id:
        return jsonify({"message": "Product ID is required"}), 400

    try:
        purchase_check_response = requests.post(
            f"{ORDER_SERVICE_URL}/orders/check-purchase",
            json={"user_id": user_id, "product_id": product_id},
            timeout=5
        )
        
        if not purchase_check_response.ok:
             return jsonify({"eligible": False, "message": "Could not verify purchase."}), 200

        if not purchase_check_response.json().get('has_purchased'):
            return jsonify({"eligible": False, "message": "You can only review products you have purchased."}), 200
            
    except requests.exceptions.RequestException as e:
        return jsonify({"eligible": False, "message": f"Could not verify purchase: {e}"}), 200

    try:
        existing_review = reviews_collection.find_one({
            "user_id": user_id,
            "product_id": product_id
        })
        if existing_review:
            return jsonify({"eligible": False, "message": "You have already reviewed this product."}), 200

        return jsonify({"eligible": True, "message": ""}), 200
    except Exception as e:
        return jsonify({"eligible": False, "message": f"Error checking eligibility: {e}"}), 500

@app.route("/reviews/submit", methods=['POST', 'OPTIONS'])
@buyer_required
def submit_review(current_user_id):
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    data = request.get_json()
    product_id = data.get('product_id')
    rating = data.get('rating')
    comment = data.get('comment')
    user_id = current_user_id

    if not all([product_id, rating, comment, user_id]):
        return jsonify({"message": "Product ID, rating, comment, and user ID are required"}), 400

    try:
        purchase_check_response = requests.post(
            f"{ORDER_SERVICE_URL}/orders/check-purchase",
            json={"user_id": user_id, "product_id": product_id},
            timeout=5
        )
        if not purchase_check_response.ok or not purchase_check_response.json().get('has_purchased'):
            return jsonify({"message": "You can only review products you have purchased"}), 403
    except requests.exceptions.RequestException as e:
        return jsonify({"message": f"Could not verify purchase: {e}"}), 500

    try:
        existing_review = reviews_collection.find_one({
            "user_id": user_id,
            "product_id": product_id
        })
        if existing_review:
            return jsonify({"message": "You have already reviewed this product"}), 409

        new_review = {
            "review_id": str(uuid.uuid4()),
            "user_id": user_id,
            "product_id": product_id,
            "rating": int(rating),
            "comment": comment,
            "status": "pending",
            "created_at": datetime.now(timezone.utc)
        }
        reviews_collection.insert_one(new_review)
        return jsonify({"message": "Review submitted successfully and is pending approval"}), 201
    except Exception as e:
        return jsonify({"message": f"Error submitting review: {e}"}), 500

@app.route("/admin/reviews/pending", methods=['GET', 'OPTIONS'])
@admin_required
def get_pending_reviews():
    try:
        reviews = list(reviews_collection.find(
            {"status": "pending"}, 
            {"_id": 0}
        ).sort('created_at', ASCENDING))
        return jsonify(reviews), 200
    except Exception as e:
        return jsonify({"message": f"Error fetching pending reviews: {e}"}), 500

@app.route("/admin/reviews/<string:review_id>/status", methods=['PUT', 'OPTIONS'])
@admin_required
def update_review_status(review_id):
    if request.method == 'OPTIONS':
            return jsonify({}), 200
            
    data = request.get_json()
    new_status = data.get('status')

    if new_status not in ['approved', 'rejected']:
        return jsonify({"message": "Invalid status. Must be 'approved' or 'rejected'"}), 400
    
    try:
        result = reviews_collection.update_one(
            {"review_id": review_id},
            {"$set": {"status": new_status}}
        )
        if result.matched_count == 0:
            return jsonify({"message": "Review not found"}), 404
        return jsonify({"message": f"Review status updated to {new_status}"}), 200
    except Exception as e:
        return jsonify({"message": f"Error updating review status: {e}"}), 500

@app.route("/seller/reviews", methods=['POST', 'OPTIONS'])
@seller_required
def get_seller_reviews(current_user):
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    
    data = request.get_json()
    product_ids = data.get('product_ids')
    if not product_ids:
        return jsonify([]), 200

    try:
        reviews = list(reviews_collection.find(
            {"product_id": {"$in": product_ids}},
            {"_id": 0}
        ).sort('created_at', DESCENDING))
        return jsonify(reviews), 200
    except Exception as e:
        return jsonify({"message": f"Error fetching seller reviews: {e}"}), 500

if __name__ == '__main__':
    reviews_collection.create_index('review_id', unique=True)
    reviews_collection.create_index('product_id')
    reviews_collection.create_index('user_id')
    reviews_collection.create_index('status')
    print("MongoDB review indexes checked/created.")
    app.run(host='0.0.0.0', port=5008, debug=True)