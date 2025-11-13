import os
import time
import random
import uuid
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)
# Enable CORS to match your other services
CORS(app, supports_credentials=True, origins=["http://localhost:5173", "http://127.0.0.1:5173","http://192.168.1.*","http://172.31.30.*"])

@app.route("/payment/process", methods=['POST', 'OPTIONS'])
def process_payment():
    """
    Simulates processing a payment.
    Expected JSON payload: { "user_id": "jhondoe", "amount": 99.99 }
    """
    if request.method == 'OPTIONS':
        return jsonify({}), 200

    data = request.get_json()
    user_id = data.get('user_id')
    amount = data.get('amount')

    # Basic validation
    if not user_id or amount is None:
        return jsonify({"message": "Invalid payment data. user_id and amount are required."}), 400

    print(f"[{datetime.now()}] Processing payment of ${amount} for user '{user_id}'...")

    # 1. Simulate network delay (0.5 to 2 seconds)
    # This makes the frontend loading spinner appear, making it feel realistic.
    time.sleep(random.uniform(0.5, 2.0))

    # 2. Random Success/Failure Logic
    # 80% chance of success, 20% chance of failure
    if random.random() < 0.8:
        # --- SUCCESS CASE ---
        transaction_id = f"txn_{uuid.uuid4().hex}"
        print(f"✅ Payment SUCCESS: {transaction_id}")
        return jsonify({
            "status": "SUCCESS",
            "message": "Payment processed successfully",
            "transaction_id": transaction_id,
            "amount": amount,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }), 200
    else:
        # --- FAILURE CASE ---
        error_reason = random.choice([
            "insufficient_funds",
            "card_declined",
            "incorrect_cvc",
            "expired_card",
            "bank_unavailable"
        ])
        print(f"❌ Payment FAILED: {error_reason}")
        # 402 Payment Required is the standard HTTP codeSJ for failed payments
        return jsonify({
            "status": "FAILED",
            "message": "Payment could not be processed",
            "error": error_reason,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }), 402

if __name__ == '__main__':
    # We use port 5007 because 5001-5006 are already taken by your other services.
    print("gw Starting Mock Payment Service on port 5007...")
    app.run(host='0.0.0.0', port=5007, debug=True)