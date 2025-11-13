import os
from pymongo import MongoClient, DESCENDING
import json
import uuid
from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
import jwt
from functools import wraps

load_dotenv()

app = Flask(__name__)
CORS(app, supports_credentials=True, origins=["http://localhost:5173", "http://127.0.0.1:5173"])

PRODUCT_SERVICE_URL = "http://product_service:5002"
INVENTORY_SERVICE_URL = "http://inventory_service:5003"
CART_SERVICE_URL = "http://cart_service:5004"
PAYMENT_SERVICE_URL = "http://payment_service:5007"

MONGO_URI = os.environ.get('ORDER_DB_URI')
SECRET_KEY = os.environ.get('SECRET_KEY')
if not MONGO_URI or not SECRET_KEY:
    raise RuntimeError("Database URI or SECRET_KEY not found in .env file")
client = MongoClient(MONGO_URI)
db = client.order_db
orders_collection = db.orders

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

@app.route("/orders/create", methods=['POST', 'OPTIONS'])
@buyer_required
def create_order(current_user_id):
    user_id = current_user_id
    print(f"Attempting to create order for user: {user_id}")

    try:
        cart_response = requests.get(f"{CART_SERVICE_URL}/cart/{user_id}", timeout=5)
        cart_response.raise_for_status()
        cart_items = cart_response.json()
        if not cart_items:
            return jsonify({"message": "Cart is empty"}), 400
    except requests.exceptions.RequestException as e:
        return jsonify({"message": f"Could not fetch cart: {e}"}), 500

    order_items = []
    total_price = 0
    product_owner_map = {}
    try:
        for item in cart_items:
            product_response = requests.get(f"{PRODUCT_SERVICE_URL}/products/{item['product_id']}", timeout=5)
            product_response.raise_for_status()
            product = product_response.json()
            
            order_items.append({
                "product_id": product['id'],
                "name": product['name'],
                "quantity": item['quantity'],
                "price_per_item": float(product['price']),
                "owner_id": product.get('owner_id')
            })
            total_price += float(product['price']) * item['quantity']
            product_owner_map[product['id']] = product.get('owner_id')
    except requests.exceptions.RequestException as e:
        return jsonify({"message": f"Could not fetch product details: {e}"}), 500

    inventory_decreased_items = []
    try:
        for item in order_items:
            inventory_response = requests.post(
                f"{INVENTORY_SERVICE_URL}/inventory/decrease",
                json={"product_id": item['product_id'], "quantity": item['quantity']},
                timeout=5
            )
            if inventory_response.status_code != 200:
                error_data = inventory_response.json()
                raise Exception(error_data.get("message", "Insufficient stock"))
            
            inventory_decreased_items.append(item)
    except Exception as e:
        return jsonify({"message": f"{e}"}), 400

    try:
        payment_response = requests.post(
            f"{PAYMENT_SERVICE_URL}/payment/process",
            json={"user_id": user_id, "amount": total_price},
            timeout=10
        )
        
        if payment_response.status_code != 200:
            error_data = payment_response.json()
            raise Exception(error_data.get("error", "Payment failed"))
            
        payment_data = payment_response.json()
        transaction_id = payment_data['transaction_id']
    except Exception as e:
        return jsonify({"message": f"Payment failed: {e}"}), 402

    try:
        new_order = {
            "order_id": str(uuid.uuid4()),
            "user_id": user_id,
            "items": order_items,
            "total_price": total_price,
            "transaction_id": transaction_id,
            "status": "completed",
            "created_at": datetime.now(timezone.utc)
        }
        orders_collection.insert_one(new_order)
    except Exception as e:
        return jsonify({"message": "Could not save order"}), 500

    try:
        requests.post(f"{CART_SERVICE_URL}/cart/{user_id}/clear", timeout=5)
    except requests.exceptions.RequestException as e:
        print(f"!!! WARNING: Could not clear cart for user {user_id}. Error: {e}")

    return jsonify({"message": "Order placed successfully", "order_id": new_order['order_id']}), 201


@app.route("/orders/<string:user_id>", methods=['GET', 'OPTIONS'])
def get_orders_for_user(user_id):
    if request.method == 'OPTIONS':
        return jsonify({}), 200
        
    orders = list(orders_collection.find({'user_id': user_id}, {'_id': 0}).sort('created_at', -1))
    return jsonify(orders)

@app.route("/orders/check-purchase", methods=['POST', 'OPTIONS'])
def check_purchase():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
        
    data = request.get_json()
    user_id = data.get('user_id')
    product_id = data.get('product_id')

    if not user_id or not product_id:
        return jsonify({"message": "User ID and Product ID are required"}), 400

    order = orders_collection.find_one({
        "user_id": user_id,
        "items.product_id": product_id,
        "status": "completed"
    })
    
    return jsonify({"has_purchased": order is not None}), 200

@app.route("/admin/orders", methods=['GET', 'OPTIONS'])
@admin_required
def get_all_orders():
    try:
        orders = list(orders_collection.find({}, {'_id': 0}).sort('created_at', DESCENDING))
        return jsonify(orders), 200
    except Exception as e:
        return jsonify({"message": "Error fetching all orders"}), 500

def get_date_range_filter():
    start_date_str = request.args.get('startDate')
    end_date_str = request.args.get('endDate')
    
    date_filter = {}
    
    if start_date_str:
        try:
            start_dt = datetime.strptime(start_date_str, '%Y-%m-%d').replace(tzinfo=timezone.utc)
            date_filter['$gte'] = start_dt
        except ValueError:
            pass
            
    if end_date_str:
        try:
            end_dt = datetime.strptime(end_date_str, '%Y-%m-%d').replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
            date_filter['$lte'] = end_dt
        except ValueError:
            pass
            
    return date_filter

@app.route("/admin/stats", methods=['GET', 'OPTIONS'])
@admin_required
def get_admin_stats():
    try:
        date_filter = get_date_range_filter()
        match_query = {"status": "completed"}
        
        if date_filter:
            match_query["created_at"] = date_filter
            
        pipeline = [
            {
                "$match": match_query
            },
            {
                "$group": {
                    "_id": None,
                    "totalRevenue": {"$sum": "$total_price"},
                    "totalOrders": {"$sum": 1}
                }
            }
        ]
        stats = list(orders_collection.aggregate(pipeline))
        
        if not stats:
            return jsonify({"totalRevenue": 0, "totalOrders": 0}), 200
            
        return jsonify({
            "totalRevenue": stats[0]['totalRevenue'],
            "totalOrders": stats[0]['totalOrders']
        }), 200
    except Exception as e:
        return jsonify({"message": "Error calculating stats"}), 500

@app.route("/seller/stats", methods=['GET', 'OPTIONS'])
@seller_required
def get_seller_stats(current_user):
    seller_id = current_user.get('sub')
    try:
        pipeline = [
            {"$match": {"status": "completed", "items.owner_id": seller_id}},
            {"$unwind": "$items"},
            {"$match": {"items.owner_id": seller_id}},
            {
                "$group": {
                    "_id": None,
                    "totalRevenue": {"$sum": {"$multiply": ["$items.price_per_item", "$items.quantity"]}},
                    "totalSales": {"$sum": "$items.quantity"}
                }
            }
        ]
        stats = list(orders_collection.aggregate(pipeline))
        
        if not stats:
            return jsonify({"totalRevenue": 0, "totalSales": 0}), 200
            
        return jsonify({
            "totalRevenue": stats[0]['totalRevenue'],
            "totalSales": stats[0]['totalSales']
        }), 200
    except Exception as e:
        return jsonify({"message": f"Error calculating seller stats: {e}"}), 500

@app.route("/admin/analytics/revenue-over-time", methods=['GET', 'OPTIONS'])
@admin_required
def get_revenue_over_time():
    try:
        date_filter = get_date_range_filter()
        match_query = {"status": "completed"}
        
        if date_filter:
            match_query["created_at"] = date_filter
        else:
            match_query["created_at"] = {"$gte": datetime.now(timezone.utc) - timedelta(days=30)}
            
        pipeline = [
            {
                "$match": match_query
            },
            {
                "$group": {
                    "_id": {
                        "$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}
                    },
                    "totalRevenue": {"$sum": "$total_price"}
                }
            },
            {"$sort": {"_id": 1}},
            {
                "$project": {
                    "_id": 0,
                    "date": "$_id",
                    "revenue": "$totalRevenue"
                }
            }
        ]
        data = list(orders_collection.aggregate(pipeline))
        return jsonify(data), 200
    except Exception as e:
        return jsonify({"message": f"Error generating revenue report: {e}"}), 500

@app.route("/admin/analytics/top-products", methods=['GET', 'OPTIONS'])
@admin_required
def get_top_products():
    try:
        date_filter = get_date_range_filter()
        match_query = {"status": "completed"}
        
        if date_filter:
            match_query["created_at"] = date_filter
            
        pipeline = [
            {"$match": match_query},
            {"$unwind": "$items"},
            {
                "$group": {
                    "_id": "$items.product_id",
                    "productName": {"$first": "$items.name"},
                    "totalSold": {"$sum": "$items.quantity"}
                }
            },
            {"$sort": {"totalSold": DESCENDING}},
            {"$limit": 5},
            {
                "$project": {
                    "_id": 0,
                    "productId": "$_id",
                    "name": "$productName",
                    "sold": "$totalSold"
                }
            }
        ]
        data = list(orders_collection.aggregate(pipeline))
        return jsonify(data), 200
    except Exception as e:
        return jsonify({"message": f"Error generating top products report: {e}"}), 500

if __name__ == '__main__':
    orders_collection.create_index('user_id')
    orders_collection.create_index('order_id', unique=True)
    orders_collection.create_index([('created_at', DESCENDING)])
    orders_collection.create_index("items.product_id")
    orders_collection.create_index("items.owner_id")
    print("MongoDB order indexes checked/created.")
    app.run(host='0.0.0.0', port=5005, debug=True)