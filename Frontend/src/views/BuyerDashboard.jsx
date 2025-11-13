import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, apiCall } from '../Auth';

const API_URLS = {
    PRODUCT: 'http://127.0.0.1:5002',
    INVENTORY: 'http://127.0.0.1:5003',
    CART: 'http://127.0.0.1:5004',
    ORDER: 'http://127.0.0.1:5005',
    WISHLIST: 'http://127.0.0.1:5006',
};

const Toast = ({ message, type, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(onDismiss, 3000);
        return () => clearTimeout(timer);
    }, [onDismiss]);
    const bgColor = type === 'error' ? 'bg-red-500' : 'bg-green-500';
    return <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 px-6 py-3 rounded-md text-white ${bgColor} shadow-lg`}>{message}</div>;
};

const ProductCard = ({ product, isWishlisted, onAddToCart, onToggleWishlist, stockQuantity }) => {
    const isOutOfStock = stockQuantity <= 0;

    return (
        <div className="flex flex-col bg-white border rounded-lg shadow-lg overflow-hidden">
            <div className="relative">
                {isOutOfStock && (
                    <div className="absolute top-2 left-2 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-md z-10">
                        OUT OF STOCK
                    </div>
                )}
                <img src={`https://placehold.co/400x300/E2E8F0/334155?text=${product.name.replace(/\s/g, '+')}`} alt={product.name} className="object-cover w-full h-48" />
                <button onClick={() => onToggleWishlist(product.id, isWishlisted)} className={`absolute top-2 right-2 p-2 rounded-full ${isWishlisted ? 'text-red-500 bg-red-100' : 'text-gray-500 bg-white'}`}>
                    <svg className="w-6 h-6" fill={isWishlisted ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.5l1.318-1.182a4.5 4.5 0 116.364 6.364L12 18.75l-7.682-7.682a4.5 4.5 0 010-6.364z"></path></svg>
                </button>
            </div>
            <div className="flex flex-col flex-grow p-4">
                <h3 className="text-xl font-bold">{product.name}</h3>
                <p className="flex-grow my-2 text-gray-600">{product.description}</p>
                <p className="text-2xl font-bold text-blue-600">${product.price.toFixed(2)}</p>
                <button 
                    onClick={() => onAddToCart(product.id)} 
                    className="w-full px-4 py-2 mt-4 font-bold text-white bg-blue-500 rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    disabled={isOutOfStock}
                >
                    {isOutOfStock ? "Out of Stock" : "Add to Cart"}
                </button>
            </div>
        </div>
    );
};


const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
        return () => { clearTimeout(handler); };
    }, [value, delay]);
    return debouncedValue;
};

export const BuyerDashboard = () => {
    const { user, logout } = useAuth();
    const [products, setProducts] = useState([]);
    const [wishlist, setWishlist] = useState([]);
    const [cart, setCart] = useState([]);
    const [orders, setOrders] = useState([]);
    const [inventory, setInventory] = useState({});
    const [currentView, setCurrentView] = useState('shop');
    const [productDetails, setProductDetails] = useState({});
    const [toast, setToast] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 500);

    const [isLoading, setIsLoading] = useState(false);
    const [paymentError, setPaymentError] = useState(null);

    const showToast = (message, type = 'success') => setToast({ message, type });

    const ensureProductDetails = useCallback(async (productIds) => {
        const missingIds = productIds.filter(id => !productDetails[id]);
        if (missingIds.length === 0) return;
        try {
            const detailPromises = missingIds.map(id => apiCall(`${API_URLS.PRODUCT}/products/${id}`));
            const detailsResults = await Promise.all(detailPromises);
            const newDetails = detailsResults.reduce((acc, result) => {
                const detail = result.data;
                if (detail && detail.id) acc[detail.id] = detail;
                return acc;
            }, {});
            setProductDetails(prev => ({ ...prev, ...newDetails }));
        } catch (error) {
            showToast("Could not load some product details.", "error");
        }
    }, [productDetails]);

    const fetchAllData = useCallback(async () => {
        try {
            const results = await Promise.allSettled([
                apiCall(`${API_URLS.PRODUCT}/products`),
                apiCall(`${API_URLS.CART}/cart/${user.name}`),
                apiCall(`${API_URLS.WISHLIST}/wishlist/${user.name}`),
                apiCall(`${API_URLS.INVENTORY}/inventory`),
            ]);
            
            const productsData = results[0].status === 'fulfilled' ? results[0].value.data : [];
            const cartData = results[1].status === 'fulfilled' ? results[1].value.data : [];
            const wishlistData = results[2].status === 'fulfilled' ? results[2].value.data : [];
            const inventoryData = results[3].status === 'fulfilled' ? results[3].value.data : [];
            
            if (results[0].status === 'rejected') showToast('Could not load products.', 'error');
            if (results[1].status === 'rejected') showToast('Could not load cart.', 'error');
            if (results[2].status === 'rejected') showToast('Wishlist service is unavailable.', 'error');
            if (results[3].status === 'rejected') showToast('Could not load stock levels.', 'error');

            setProducts(productsData);
            setCart(cartData);
            setWishlist(wishlistData);
            
            const inventoryMap = inventoryData.reduce((acc, item) => {
                acc[item.product_id] = item.quantity;
                return acc;
            }, {});
            setInventory(inventoryMap);

            const initialDetails = productsData.reduce((acc, p) => {
                acc[p.id] = p;
                return acc;
            }, {});
            setProductDetails(initialDetails);

        } catch (error) {
            showToast(error.message, 'error');
        }
    }, [user.name]);
    
    useEffect(() => {
        const searchProducts = async () => {
            if (debouncedSearchQuery) {
                try {
                    const result = await apiCall(`${API_URLS.PRODUCT}/products/search?q=${debouncedSearchQuery}`);
                    setProducts(result.data);
                } catch (error) {
                    showToast(error.message, 'error');
                }
            } else if (searchQuery === '') {
                apiCall(`${API_URLS.PRODUCT}/products`).then(result => setProducts(result.data)).catch(err => showToast(err.message, 'error'));
            }
        };
        searchProducts();
    }, [debouncedSearchQuery, searchQuery]);

    useEffect(() => {
        if (user) fetchAllData();
    }, [user, fetchAllData]);

    const handleUpdateCart = async (productId, quantity) => {
        if (quantity > 0) {
            const currentStock = inventory[productId] ?? 0;
            const itemInCart = cart.find(item => item.product_id === productId);
            const cartQuantity = itemInCart ? itemInCart.quantity : 0;
            
            if (cartQuantity + quantity > currentStock) {
                showToast("Cannot add more than available stock.", "error");
                return;
            }
        }

        const endpoint = quantity > 0 ? 'add' : 'remove';
        try {
            await apiCall(`${API_URLS.CART}/cart/${user.name}/${endpoint}`, {
                method: 'POST', body: JSON.stringify({ product_id: productId, quantity: 1 })
            });
            setCart(prev => {
                const item = prev.find(i => i.product_id === productId);
                if (!item) return quantity > 0 ? [...prev, {product_id: productId, quantity: 1}] : prev;
                const newQuantity = item.quantity + quantity;
                if (newQuantity <= 0) return prev.filter(i => i.product_id !== productId);
                return prev.map(i => i.product_id === productId ? {...i, quantity: newQuantity} : i);
            });
            ensureProductDetails([productId]);
            showToast("Cart updated!");
        } catch (error) { showToast(error.message, 'error'); }
    };

    const handleToggleWishlist = async (productId, isWishlisted) => {
        const endpoint = isWishlisted ? 'remove' : 'add';
        try {
            await apiCall(`${API_URLS.WISHLIST}/wishlist/${user.name}/${endpoint}`, {
                method: 'POST', body: JSON.stringify({ product_id: productId })
            });
            setWishlist(prev => isWishlisted ? prev.filter(id => id !== productId) : [...prev, productId]);
            showToast(isWishlisted ? "Removed from wishlist" : "Added to wishlist!");
        } catch (error) { showToast(error.message, 'error'); }
    };
    
    const handleViewOrders = async () => {
         try {
            const result = await apiCall(`${API_URLS.ORDER}/orders/${user.name}`);
            setOrders(result.data);
            setCurrentView('orders');
        } catch (error) { showToast(error.message, 'error'); }
    };
    
    const handlePaymentSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setPaymentError(null);

        try {
            const result = await apiCall(`${API_URLS.ORDER}/orders/create/${user.name}`, { method: 'POST' });
            
            showToast(`Order placed! Order ID: ${result.data.order_id}`);
            setCart([]);
            fetchAllData(); 
            setCurrentView('shop');

        } catch(error) {
            let friendlyError = "An unknown payment error occurred. Please try again.";
            
            if (error.message.includes("insufficient_funds")) {
                friendlyError = "Your card was declined due to insufficient funds.";
            } else if (error.message.includes("card_declined")) {
                friendlyError = "Your card was declined by the bank. Please try another card.";
            } else if (error.message.includes("bank_unavailable")) {
                friendlyError = "The payment gateway is temporarily unavailable. Please try again later.";
            } else if (error.message.includes("Payment service unavailable")) {
                 friendlyError = "The payment service is down. Please contact support.";
            } else if (error.message.includes("Insufficient stock") || error.message.includes("out of stock")) {
                 friendlyError = "One or more items in your cart went out of stock. Please review your cart.";
                 fetchAllData(); 
                 setCurrentView('cart'); 
            } else if (error.message) {
                friendlyError = error.message;
            }
            
            setPaymentError(friendlyError);
        } finally {
            setIsLoading(false);
        }
    };

    const cartCount = cart.reduce((count, item) => count + item.quantity, 0);
    const cartTotal = cart.reduce((total, item) => total + ((productDetails[item.product_id]?.price || 0) * item.quantity), 0);
    
    const invalidCartItems = cart.filter(item => (inventory[item.product_id] ?? 0) < item.quantity);
    const isCartValid = invalidCartItems.length === 0 && cart.length > 0;

    useEffect(() => {
        if (currentView === 'cart') ensureProductDetails(cart.map(item => item.product_id));
        if (currentView === 'wishlist') ensureProductDetails(wishlist);
    }, [currentView, cart, wishlist, ensureProductDetails]);

    return (
        <div className="min-h-screen bg-gray-100">
             <header className="sticky top-0 z-50 bg-white shadow-md">
                <nav className="container flex items-center justify-between p-4 mx-auto">
                    <h1 className="text-3xl font-bold text-gray-800">Micro-Shop</h1>
                    <div className="flex items-center space-x-4">
                        <span className="hidden sm:inline">Welcome, {user.name}!</span>
                        <button onClick={() => setCurrentView('wishlist')} className="px-4 py-2 font-bold text-white bg-pink-500 rounded hover:bg-pink-700">Wishlist</button>
                        <button onClick={() => setCurrentView('cart')} className="relative px-4 py-2 font-bold text-white bg-blue-500 rounded hover:bg-blue-700">
                            Cart <span className="absolute top-0 right-0 px-2 py-1 text-xs font-bold text-white bg-red-500 rounded-full -mt-2 -mr-2">{cartCount}</span>
                        </button>
                        <button onClick={handleViewOrders} className="px-4 py-2 font-bold text-white bg-green-500 rounded hover:bg-green-700">Orders</button>
                        <button onClick={logout} className="px-4 py-2 font-bold text-white bg-red-500 rounded hover:bg-red-700">Logout</button>
                    </div>
                </nav>
            </header>
            <main className="container p-4 mx-auto">
                 {currentView === 'shop' && (
                    <div>
                        <div className="mb-6"><input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search for products..." className="w-full p-3 border rounded-lg shadow-sm" /></div>
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">{products.map(p => (
                            <ProductCard 
                                key={p.id} 
                                product={p} 
                                isWishlisted={wishlist.includes(p.id)} 
                                onAddToCart={() => handleUpdateCart(p.id, 1)} 
                                onToggleWishlist={handleToggleWishlist}
                                stockQuantity={inventory[p.id] ?? 0}
                            />
                        ))}</div>
                    </div>
                 )}
                 {currentView === 'cart' && (
                    <div className="p-8 bg-white rounded-lg shadow-xl">
                        <h2 className="text-3xl font-bold mb-6">Your Cart</h2>
                        {cart.length === 0 ? <p>Your cart is empty.</p> : (
                            <div>
                                {invalidCartItems.length > 0 && (
                                    <div className="p-3 my-4 text-sm text-center text-red-800 bg-red-100 rounded-md">
                                        Some items in your cart are out of stock or have limited availability:
                                        <ul className="font-medium list-disc list-inside">
                                            {invalidCartItems.map(item => {
                                                const product = productDetails[item.product_id];
                                                const stock = inventory[item.product_id] ?? 0;
                                                return <li key={item.product_id}>{product?.name || item.product_id} (Only {stock} available)</li>;
                                            })}
                                        </ul>
                                    </div>
                                )}
                                {cart.map(item => {
                                    const product = productDetails[item.product_id];
                                    const stock = inventory[item.product_id] ?? 0;
                                    const isItemInvalid = item.quantity > stock;
                                    if (!product) return <div key={item.product_id} className="py-4 border-b">Loading item...</div>;
                                    return (
                                        <div key={item.product_id} className={`flex justify-between items-center py-4 border-b ${isItemInvalid ? 'bg-red-50' : ''}`}>
                                            <div><p className="font-semibold">{product.name}</p><p className="text-gray-600">${product.price.toFixed(2)} each</p></div>
                                            <div className="flex items-center space-x-3">
                                                <button onClick={() => handleUpdateCart(item.product_id, -1)} className="px-2 py-1 border rounded">-</button>
                                                <span>{item.quantity}</span>
                                                <button onClick={() => handleUpdateCart(item.product_id, 1)} className="px-2 py-1 border rounded" disabled={item.quantity >= stock}>+</button>
                                            </div>
                                            <span className="font-semibold">${(product.price * item.quantity).toFixed(2)}</span>
                                        </div>
                                    );
                                })}
                                <div className="text-right mt-6">
                                    <p className="text-2xl font-bold">Total: ${cartTotal.toFixed(2)}</p>
                                    <button 
                                        onClick={() => {
                                            setPaymentError(null);
                                            setCurrentView('payment');
                                        }} 
                                        className="px-6 py-3 mt-4 font-bold text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                                        disabled={!isCartValid}
                                    >
                                        Proceed to Checkout
                                    </button>
                                </div>
                            </div>
                        )}
                        <button onClick={() => setCurrentView('shop')} className="mt-6 text-blue-600 hover:underline">Back to Shop</button>
                    </div>
                 )}
                 
                 {currentView === 'payment' && (
                    <div className="max-w-lg p-8 mx-auto bg-white rounded-lg shadow-xl">
                        <h2 className="mb-6 text-3xl font-bold text-center">Complete Your Payment</h2>
                        
                        <div className="p-4 mb-4 text-center bg-gray-100 rounded-lg">
                            <p className="text-lg text-gray-600">Order Total</p>
                            <p className="text-4xl font-bold text-gray-900">${cartTotal.toFixed(2)}</p>
                        </div>
                        
                        <p className="mb-4 text-sm text-center text-gray-500">
                            (This is a mock payment form. The backend will randomly succeed or fail.)
                        </p>

                        <form onSubmit={handlePaymentSubmit} className="space-y-4">
                            <div>
                                <label htmlFor="cardNum" className="block text-sm font-medium text-gray-700">Card Number</label>
                                <input id="cardNum" type="text" placeholder="1234 5678 9012 3456" className="w-full p-2 mt-1 border rounded-md" />
                            </div>
                            
                            <div classNamea="flex space-x-4">
                                <div className="flex-1">
                                    <label htmlFor="expiry" className="block text-sm font-medium text-gray-700">Expiry Date</label>
                                    <input id="expiry" type="text" placeholder="MM / YY" className="w-full p-2 mt-1 border rounded-md" />
                                </div>
                                <div className="flex-1">
                                    <label htmlFor="cvc" className="block text-sm font-medium text-gray-700">CVC</label>
                                    <input id="cvc" type="text" placeholder="123" className="w-full p-2 mt-1 border rounded-md" />
                                </div>
                            </div>
                            
                            {paymentError && (
                                <div className="p-3 text-sm text-center text-red-800 bg-red-100 rounded-md">
                                    {paymentError}
                                </div>
                            )}

                            <button type="submit" disabled={isLoading} className="w-full px-6 py-3 font-bold text-white bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-400">
                                {isLoading ? 'Processing Payment...' : `Pay $${cartTotal.toFixed(2)}`}
                            </button>
                        </form>

                        <button onClick={() => setCurrentView('cart')} className="w-full mt-4 text-center text-blue-600 hover:underline">
                            Back to Cart
                        </button>
                    </div>
                 )}
                 
                 {currentView === 'wishlist' && (
                     <div className="p-8">
                        <h2 className="text-3xl font-bold mb-6">Your Wishlist</h2>
                         <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                            {wishlist.length === 0 ? <p className="col-span-full text-center">Your wishlist is empty.</p> : wishlist.map(productId => {
                                const product = productDetails[productId];
                                if (!product) return <div key={productId} className="p-4 text-center bg-white rounded-lg shadow">Loading...</div>;
                                return <ProductCard 
                                    key={productId} 
                                    product={product} 
                                    isWishlisted={true} 
                                    onAddToCart={() => handleUpdateCart(productId, 1)} 
                                    onToggleWishlist={handleToggleWishlist}
                                    stockQuantity={inventory[productId] ?? 0}
                                />;
                            })}
                         </div>
                         <button onClick={() => setCurrentView('shop')} className="mt-6 text-blue-600 hover:underline">Back to Shop</button>
Z                    </div>
                 )}
                  {currentView === 'orders' && (
                     <div className="p-8 bg-white rounded-lg shadow-xl">
                         <h2 className="text-3xl font-bold mb-6">Your Orders</h2>
                         <div className="space-y-4">
                         {orders.length === 0 ? <p>You have no past orders.</p> : orders.map(order => (
                              <div key={order.order_id} className="p-4 border rounded-md">
                                 <p className="font-bold">Order ID: {order.order_id.substring(0,8)}</p>
                                 <p>Date: {new Date(order.created_at).toLocaleDateString()}</p>
                                 <p>Total: ${order.total_price.toFixed(2)}</p>
                              </div>
                         ))}
                         </div>
                          <button onClick={() => setCurrentView('shop')} className="mt-6 text-blue-600 hover:underline">Back to Shop</button>
                     </div>
                 )}
            </main>
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
        </div>
    );
};