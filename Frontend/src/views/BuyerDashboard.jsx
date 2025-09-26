import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, apiCall } from '../Auth';

const API_URLS = {
    PRODUCT: 'http://127.0.0.1:5002',
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

const ProductCard = ({ product, isWishlisted, onAddToCart, onToggleWishlist }) => (
    <div className="flex flex-col bg-white border rounded-lg shadow-lg overflow-hidden">
        <div className="relative">
            <img src={`https://placehold.co/400x300/E2E8F0/334155?text=${product.name.replace(/\s/g, '+')}`} alt={product.name} className="object-cover w-full h-48" />
            <button onClick={() => onToggleWishlist(product.id, isWishlisted)} className={`absolute top-2 right-2 p-2 rounded-full ${isWishlisted ? 'text-red-500 bg-red-100' : 'text-gray-500 bg-white'}`}>
                <svg className="w-6 h-6" fill={isWishlisted ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.5l1.318-1.182a4.5 4.5 0 116.364 6.364L12 18.75l-7.682-7.682a4.5 4.5 0 010-6.364z"></path></svg>
            </button>
        </div>
        <div className="flex flex-col flex-grow p-4">
            <h3 className="text-xl font-bold">{product.name}</h3>
            <p className="flex-grow my-2 text-gray-600">{product.description}</p>
            <p className="text-2xl font-bold text-blue-600">${product.price.toFixed(2)}</p>
            <button onClick={() => onAddToCart(product.id)} className="w-full px-4 py-2 mt-4 font-bold text-white bg-blue-500 rounded hover:bg-blue-600">Add to Cart</button>
        </div>
    </div>
);

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
    const [currentView, setCurrentView] = useState('shop');
    const [productDetails, setProductDetails] = useState({});
    const [toast, setToast] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 500);

    const showToast = (message, type = 'success') => setToast({ message, type });

    const ensureProductDetails = useCallback(async (productIds) => {
        const missingIds = productIds.filter(id => !productDetails[id]);
        if (missingIds.length === 0) return;
        try {
            const detailPromises = missingIds.map(id => apiCall(`${API_URLS.PRODUCT}/products/${id}`));
            const detailsArray = await Promise.all(detailPromises);
            const newDetails = detailsArray.reduce((acc, detail) => {
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
            ]);
            
            const productsData = results[0].status === 'fulfilled' ? results[0].value : [];
            const cartData = results[1].status === 'fulfilled' ? results[1].value : [];
            const wishlistData = results[2].status === 'fulfilled' ? results[2].value : [];
            
            if (results[0].status === 'rejected') showToast('Could not load products.', 'error');
            if (results[1].status === 'rejected') showToast('Could not load cart.', 'error');
            if (results[2].status === 'rejected') showToast('Wishlist service is unavailable.', 'error');

            setProducts(productsData);
            setCart(cartData);
            setWishlist(wishlistData);

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
                    const searchResults = await apiCall(`${API_URLS.PRODUCT}/products/search?q=${debouncedSearchQuery}`);
                    setProducts(searchResults);
                } catch (error) {
                    showToast(error.message, 'error');
                }
            } else if (searchQuery === '') {
                apiCall(`${API_URLS.PRODUCT}/products`).then(setProducts).catch(err => showToast(err.message, 'error'));
            }
        };
        searchProducts();
    }, [debouncedSearchQuery, searchQuery]);

    useEffect(() => {
        if (user) fetchAllData();
    }, [user, fetchAllData]);

    const handleUpdateCart = async (productId, quantity) => {
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
            const ordersData = await apiCall(`${API_URLS.ORDER}/orders/${user.name}`);
            setOrders(ordersData);
            setCurrentView('orders');
        } catch (error) { showToast(error.message, 'error'); }
    };
    
    const handleCheckout = async () => {
        try {
            const order = await apiCall(`${API_URLS.ORDER}/orders/create/${user.name}`, { method: 'POST' });
            showToast(`Order ${order.order_id.substring(0,8)} placed!`);
            setCart([]);
            setCurrentView('shop');
        } catch(error) { showToast(error.message, 'error'); }
    };

    const cartCount = cart.reduce((count, item) => count + item.quantity, 0);

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
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">{products.map(p => (<ProductCard key={p.id} product={p} isWishlisted={wishlist.includes(p.id)} onAddToCart={() => handleUpdateCart(p.id, 1)} onToggleWishlist={handleToggleWishlist} />))}</div>
                    </div>
                 )}
                 {currentView === 'cart' && (
                    <div className="p-8 bg-white rounded-lg shadow-xl">
                        <h2 className="text-3xl font-bold mb-6">Your Cart</h2>
                        {cart.length === 0 ? <p>Your cart is empty.</p> : (
                            <div>
                                {cart.map(item => {
                                    const product = productDetails[item.product_id];
                                    if (!product) return <div key={item.product_id} className="py-4 border-b">Loading item...</div>;
                                    return (
                                        <div key={item.product_id} className="flex justify-between items-center py-4 border-b">
                                            <div>
                                                <p className="font-semibold">{product.name}</p>
                                                <p className="text-gray-600">${product.price.toFixed(2)} each</p>
                                            </div>
                                            <div className="flex items-center space-x-3">
                                                <button onClick={() => handleUpdateCart(item.product_id, -1)} className="px-2 py-1 border rounded">-</button>
                                                <span>{item.quantity}</span>
                                                <button onClick={() => handleUpdateCart(item.product_id, 1)} className="px-2 py-1 border rounded">+</button>
                                            </div>
                                            <span className="font-semibold">${(product.price * item.quantity).toFixed(2)}</span>
                                        </div>
                                    );
                                })}
                                <div className="text-right mt-6">
                                    <p className="text-2xl font-bold">Total: ${cart.reduce((total, item) => total + ((productDetails[item.product_id]?.price || 0) * item.quantity), 0).toFixed(2)}</p>
                                    <button onClick={handleCheckout} className="px-6 py-3 mt-4 font-bold text-white bg-blue-600 rounded hover:bg-blue-700">Checkout</button>
                                </div>
                            </div>
                        )}
                        <button onClick={() => setCurrentView('shop')} className="mt-6 text-blue-600 hover:underline">← Back to Shop</button>
                    </div>
                 )}
                 {currentView === 'wishlist' && (
                     <div className="p-8">
                        <h2 className="text-3xl font-bold mb-6">Your Wishlist</h2>
                         <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                            {wishlist.length === 0 ? <p className="col-span-full">Your wishlist is empty.</p> : wishlist.map(productId => {
                                const product = productDetails[productId];
                                if (!product) return <div key={productId} className="p-4 text-center bg-white rounded-lg shadow">Loading...</div>;
                                return <ProductCard key={productId} product={product} isWishlisted={true} onAddToCart={() => handleUpdateCart(productId, 1)} onToggleWishlist={handleToggleWishlist} />;
                            })}
                         </div>
                         <button onClick={() => setCurrentView('shop')} className="mt-6 text-blue-600 hover:underline">← Back to Shop</button>
                     </div>
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
                         <button onClick={() => setCurrentView('shop')} className="mt-6 text-blue-600 hover:underline">← Back to Shop</button>
                     </div>
                 )}
            </main>
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
        </div>
    );
};

