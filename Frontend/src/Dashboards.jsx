import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, apiCall } from './Auth.jsx';

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
    return (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 px-6 py-3 rounded-md text-white ${bgColor} shadow-lg`}>
            {message}
        </div>
    );
};

const ProductCard = ({ product, isWishlisted, onAddToCart, onToggleWishlist }) => {
    return (
        <div className="flex flex-col bg-white border rounded-lg shadow-lg overflow-hidden">
            <div className="relative">
                 <img src={`https://placehold.co/400x300/E2E8F0/334155?text=${product.name.replace(/\s/g,'+')}`} alt={product.name} className="object-cover w-full h-48" />
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

    const showToast = (message, type = 'success') => setToast({ message, type });

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

            const allProductIds = [...new Set(productsData.map(p => p.id))];
            const details = {};
            for (const id of allProductIds) {
                 const prod = await apiCall(`${API_URLS.PRODUCT}/products/${id}`);
                 details[id] = prod;
            }
            setProductDetails(prev => ({...prev, ...details}));
        } catch (error) {
            showToast(error.message, 'error');
        }
    }, [user.name]);

    useEffect(() => {
        if (user) fetchAllData();
    }, [user, fetchAllData]);

    const handleAddToCart = async (productId) => {
        try {
            await apiCall(`${API_URLS.CART}/cart/${user.name}/add`, {
                method: 'POST', body: JSON.stringify({ product_id: productId, quantity: 1 })
            });
            setCart(prev => {
                const item = prev.find(i => i.product_id === productId);
                return item ? prev.map(i => i.product_id === productId ? {...i, quantity: i.quantity + 1} : i) : [...prev, {product_id: productId, quantity: 1}];
            });
            showToast("Item added to cart!");
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
                     <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                        {products.map(p => (
                            <ProductCard key={p.id} product={p} isWishlisted={wishlist.includes(p.id)} onAddToCart={handleAddToCart} onToggleWishlist={handleToggleWishlist} />
                        ))}
                    </div>
                 )}
                 {currentView === 'cart' && (
                    <div className="p-8 bg-white rounded-lg shadow-xl">
                        <h2 className="text-3xl font-bold mb-6">Your Cart</h2>
                        {/* Cart implementation would go here */}
                        <p>Total: $... </p>
                        <button onClick={handleCheckout}>Checkout</button>
                        <button onClick={() => setCurrentView('shop')}>Back to Shop</button>
                    </div>
                 )}
                 {/* Other views (orders, wishlist) would be rendered here similarly */}
            </main>
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
        </div>
    );
};

export const SellerDashboard = () => {
    const { user, logout } = useAuth();
    return (
        <div className="min-h-screen bg-gray-100">
            <header className="bg-white shadow-md">
                <nav className="container flex items-center justify-between p-4 mx-auto">
                    <h1 className="text-3xl font-bold text-indigo-600">Seller Dashboard</h1>
                     <div className="flex items-center space-x-4">
                        <span>Welcome, {user.name} (Seller)</span>
                        <button onClick={logout} className="px-4 py-2 font-bold text-white bg-red-500 rounded hover:bg-red-700">Logout</button>
                    </div>
                </nav>
            </header>
            <main className="container p-8 mx-auto">
                <div className="p-8 text-center bg-white rounded-lg shadow-xl">
                    <h2 className="text-2xl font-bold">Manage Your Products</h2>
                    <p className="mt-4 text-gray-600">This is where you will add new products, edit existing ones, and view your sales.</p>
                </div>
            </main>
        </div>
    );
};

export const AdminDashboard = () => {
    const { user, logout } = useAuth();
    return (
        <div className="min-h-screen bg-gray-100">
            <header className="bg-white shadow-md">
                <nav className="container flex items-center justify-between p-4 mx-auto">
                    <h1 className="text-3xl font-bold text-purple-600">Admin Dashboard</h1>
                     <div className="flex items-center space-x-4">
                        <span>Welcome, {user.name} (Admin)</span>
                        <button onClick={logout} className="px-4 py-2 font-bold text-white bg-red-500 rounded hover:bg-red-700">Logout</button>
                    </div>
                </nav>
            </header>
            <main className="container p-8 mx-auto">
                <div className="p-8 text-center bg-white rounded-lg shadow-xl">
                    <h2 className="text-2xl font-bold">Site Administration</h2>
                    <p className="mt-4 text-gray-600">This is where you will manage users, oversee all products, and view site-wide analytics.</p>
                </div>
            </main>
        </div>
    );
};

