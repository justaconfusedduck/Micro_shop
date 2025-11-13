import os
import uuid
from datetime import datetime, timezone
from functools import wraps
import jwt
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from pymongo import MongoClient, DESCENDING

load_dotenv()

app = Flask(__name__)
CORS(app, supports_credentials=True, origins=["http://localhost:5173", "http://127.0.0.1:5173"])

MONGO_URI = os.environ.get('REVIEW_DB_URI')
SECRET_KEY = os.environ.get('SECRET_KEY')
ORDER_SERVICE_URL = "http://order_service:5005"

if not MONGO_URI or not SECRET_KEY:
    raise RuntimeError("REVIEW_DB_URI or SECRET_KEY not found in .env file")

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
            if data.get('role') != 'buyer': return jsonify({'message': 'This action requires a buyer account!'}), 403
            return f(data.get('sub'), *args, **kwargs)
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return jsonify({'message': 'Token is invalid or expired!'}), 401
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
            if data.get('role') != 'admin': return jsonify({'message': 'This action requires an admin account!'}), 403
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return jsonify({'message': 'Token is invalid or expired!'}), 401
        return f(*args, **kwargs)
    return decorated

@app.route("/reviews/check_eligibility", methods=['POST', 'OPTIONS'])
@buyer_required
def check_eligibility(current_user):
    data = request.get_json()
    product_id = data.get('product_id')
    if not product_id:
        return jsonify({"message": "Product ID is required"}), 400

    try:
        order_response = requests.get(
            f"{ORDER_SERVICE_URL}/orders/{current_user}",
            headers={'Authorization': request.headers.get('Authorization')}
        )
        if order_response.status_code != 200:
            return jsonify({"message": "Could not verify purchase history"}), 500
        
        orders = order_response.json()
        
        has_purchased = any(
            item['product_id'] == product_id for order in orders for item in order.get('items', [])
        )
        
        if not has_purchased:
            return jsonify({"eligible": False, "message": "You must purchase this item to review it."}), 200

        existing_review = reviews_collection.find_one({
            'user_id': current_user,
            'product_id': product_id
        })
        
        if existing_review:
             return jsonify({"eligible": False, "message": "You have already reviewed this item."}), 200

        return jsonify({"eligible": True}), 200

    except requests.exceptions.RequestException as e:
        print(f"Error connecting to Order Service: {e}")
        return jsonify({"message": "Could not connect to order service"}), 503

@app.route("/reviews", methods=['POST', 'OPTIONS'])
@buyer_required
def submit_review(current_user):
    data = request.get_json()
    product_id = data.get('product_id')
    rating = data.get('rating')
    comment = data.get('comment')

    if not product_id or not rating or not comment:
        return jsonify({"message": "Product ID, rating, and comment are required"}), 400
    
    if not isinstance(rating, int) or not (1 <= rating <= 5):
        return jsonify({"message": "Rating must be an integer between 1 and 5"}), 400

    existing_review = reviews_collection.find_one({
        'user_id': current_user,
        'product_id': product_id
    })
    
    if existing_review:
        return jsonify({"message": "You have already submitted a review for this product"}), 409

    new_review = {
        "review_id": str(uuid.uuid4()),
        "user_id": current_user,
        "product_id": product_id,
        "rating": rating,
        "comment": comment,
        "status": "pending",
        "created_at": datetime.now(timezone.utc)
    }
    reviews_collection.insert_one(new_review)
    
    return jsonify({"message": "Review submitted successfully. It is pending approval."}), 201

@app.route("/reviews/<string:product_id>", methods=['GET', 'OPTIONS'])
def get_reviews(product_id):
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    try:
        reviews = list(reviews_collection.find(
            {'product_id': product_id, 'status': 'approved'},
            {'_id': 0}
        ).sort('created_at', DESCENDING))
        return jsonify(reviews), 200
    except Exception as e:
        return jsonify({"message": f"Error fetching reviews: {e}"}), 500

@app.route("/reviews/average/<string:product_id>", methods=['GET', 'OPTIONS'])
def get_average_rating(product_id):
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    try:
        pipeline = [
            {'$match': {'product_id': product_id, 'status': 'approved'}},
            {'$group': {
                '_id': '$product_id',
                'averageRating': {'$avg': '$rating'},
                'reviewCount': {'$sum': 1}
            }}
        ]
        result = list(reviews_collection.aggregate(pipeline))
        
        if not result:
            return jsonify({"product_id": product_id, "averageRating": 0, "reviewCount": 0}), 200
            
        return jsonify({
            "product_id": product_id,
            "averageRating": round(result[0]['averageRating'], 2),
            "reviewCount": result[0]['reviewCount']
        }), 200
    except Exception as e:
        return jsonify({"message": f"Error calculating average: {e}"}), 500

@app.route("/admin/reviews/pending", methods=['GET', 'OPTIONS'])
@admin_required
def get_pending_reviews():
    try:
        reviews = list(reviews_collection.find(
            {'status': 'pending'},
            {'_id': 0}
        ).sort('created_at', DESCENDING))
        return jsonify(reviews), 200
    except Exception as e:
        return jsonify({"message": f"Error fetching pending reviews: {e}"}), 500

@app.route("/admin/reviews/approve/<string:review_id>", methods=['POST', 'OPTIONS'])
@admin_required
def approve_review(review_id):
    try:
        result = reviews_collection.update_one(
            {'review_id': review_id},
            {'$set': {'status': 'approved'}}
        )
        if result.matched_count == 0:
            return jsonify({"message": "Review not found"}), 404
        return jsonify({"message": "Review approved"}), 200
    except Exception as e:
        return jsonify({"message": f"Error approving review: {e}"}), 500

@app.route("/admin/reviews/reject/<string:review_id>", methods=['POST', 'OPTIONS'])
@admin_required
def reject_review(review_id):
    try:
        result = reviews_collection.update_one(
            {'review_id': review_id},
            {'$set': {'status': 'rejected'}}
        )
        if result.matched_count == 0:
            return jsonify({"message": "Review not found"}), 404
        return jsonify({"message": "Review rejected"}), 200
    except Exception as e:
        return jsonify({"message": f"Error rejecting review: {e}"}), 500

if __name__ == '__main__':
    reviews_collection.create_index('product_id')
    reviews_collection.create_index('user_id')
    reviews_collection.create_index('review_id', unique=True)
    reviews_collection.create_index([('user_id', 1), ('product_id', 1)], unique=True)
    reviews_collection.create_index('status')
    print("MongoDB review indexes checked/created.")
    app.run(host='0.0.0.0', port=5008, debug=True)