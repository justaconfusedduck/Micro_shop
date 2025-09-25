from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
products = [{
    "id": "P001",
    "name": "The Pragmatic Programmer",
    "description": "A classic book for any serious software developer.",
    "price": 45.50
}, {
    "id": "P002",
    "name": "Mechanical Keyboard",
    "description": "A high-quality keyboard for a great typing experience.",
    "price": 75.00
}, {
    "id": "P003",
    "name": "4K Monitor",
    "description": "A 27-inch monitor with crystal clear resolution.",
    "price": 350.00
}, {
    "id": "P004",
    "name": "Ergonomic Mouse",
    "description": "A comfortable mouse designed for long hours of use.",
    "price": 55.25
}]


@app.route("/")
def index():
    return "Welcome to the Product Catalog Service!"


@app.route("/products", methods=['GET'])
def get_products():
    print("Request for all products received.")
    return jsonify(products)


@app.route("/products/<string:product_id>", methods=['GET'])
def get_product(product_id):
    print(f"Request for product ID {product_id} received.")
    product = next((p for p in products if p['id'] == product_id), None)
    if product:
        return jsonify(product)
    else:
        return jsonify({"message": "Product not found"}), 404


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002, debug=True)
