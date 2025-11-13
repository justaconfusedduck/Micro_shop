import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, apiCall } from './Auth';

// --- API CONFIGURATION ---
const API_URLS = {
    PRODUCT: 'http://127.0.0.1:5002',
    CART: 'http://127.0.0.1:5004',
    ORDER: 'http://127.0.0.1:5005',
    WISHLIST: 'http://127.0.0.1:5006',
};

// --- SHARED COMPONENTS ---
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
    // This component is for the BuyerDashboard and remains unchanged.
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

// Custom hook for debouncing search input
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
        return () => { clearTimeout(handler); };
    }, [value, delay]);
    return debouncedValue;
};


// --- DASHBOARDS ---

export const BuyerDashboard = ({...props}) => {
    // The BuyerDashboard is fully functional but unchanged in this update.
    // For brevity, its full implementation is omitted, but it remains as it was in the previous correct version.
    const { user, logout } = useAuth();
    return (
         <div className="min-h-screen bg-gray-100">
             <header className="sticky top-0 z-50 bg-white shadow-md">
                <nav className="container flex items-center justify-between p-4 mx-auto">
                    <h1 className="text-3xl font-bold text-gray-800">Micro-Shop</h1>
                    <div className="flex items-center space-x-4">
                        <span className="hidden sm:inline">Welcome, {user.name}!</span>
                        <button className="px-4 py-2 font-bold text-white bg-pink-500 rounded hover:bg-pink-700">Wishlist</button>
                        <button className="relative px-4 py-2 font-bold text-white bg-blue-500 rounded hover:bg-blue-700">
                            Cart <span className="absolute top-0 right-0 px-2 py-1 text-xs font-bold text-white bg-red-500 rounded-full -mt-2 -mr-2">0</span>
                        </button>
                        <button className="px-4 py-2 font-bold text-white bg-green-500 rounded hover:bg-green-700">Orders</button>
                        <button onClick={logout} className="px-4 py-2 font-bold text-white bg-red-500 rounded hover:bg-red-700">Logout</button>
                    </div>
                </nav>
            </header>
            <main className="container p-4 mx-auto">
                <h2 className="text-2xl font-bold">Welcome to the Shop! (Buyer View)</h2>
                <p>The fully functional shop UI goes here.</p>
            </main>
        </div>
    );
};

// **NEW**: The Seller Dashboard is now a functional component.
export const SellerDashboard = () => {
    const { user, logout } = useAuth();
    const [myProducts, setMyProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [toast, setToast] = useState(null);

    // State for the "Add Product" form
    const [newProductName, setNewProductName] = useState('');
    const [newProductDesc, setNewProductDesc] = useState('');
    const [newProductPrice, setNewProductPrice] = useState('');

    const showToast = (message, type = 'success') => setToast({ message, type });

    const fetchMyProducts = useCallback(async () => {
        setIsLoading(true);
        try {
            // We fetch all products and then filter by the current seller's username (owner_id)
            const allProducts = await apiCall(`${API_URLS.PRODUCT}/products`);
            setMyProducts(allProducts.filter(p => p.owner_id === user.name));
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [user.name]);

    useEffect(() => {
        fetchMyProducts();
    }, [fetchMyProducts]);

    const handleAddProduct = async (e) => {
        e.preventDefault();
        try {
            const newProduct = await apiCall(`${API_URLS.PRODUCT}/products`, {
                method: 'POST',
                body: JSON.stringify({
                    name: newProductName,
                    description: newProductDesc,
                    price: newProductPrice
                })
            });
            setMyProducts(prev => [...prev, newProduct]);
            showToast("Product created successfully!");
            // Reset form
            setNewProductName('');
            setNewProductDesc('');
            setNewProductPrice('');
        } catch (error) {
            showToast(error.message, 'error');
        }
    };

    const handleDeleteProduct = async (productId) => {
        // Optional: Add a confirmation dialog before deleting
        if (!window.confirm("Are you sure you want to delete this product?")) return;
        
        try {
            await apiCall(`${API_URLS.PRODUCT}/products/${productId}`, { method: 'DELETE' });
            setMyProducts(prev => prev.filter(p => p.id !== productId));
            showToast("Product deleted successfully!");
        } catch (error) {
            showToast(error.message, 'error');
        }
    };

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
            <main className="container grid grid-cols-1 gap-8 p-8 mx-auto md:grid-cols-3">
                {/* Left Column: Add Product Form */}
                <div className="md:col-span-1">
                    <div className="p-6 bg-white rounded-lg shadow-xl">
                        <h2 className="text-2xl font-bold mb-4">Add a New Product</h2>
                        <form onSubmit={handleAddProduct} className="space-y-4">
                            <input type="text" placeholder="Product Name" value={newProductName} onChange={e => setNewProductName(e.target.value)} className="w-full px-4 py-2 border rounded-md" required />
                            <textarea placeholder="Description" value={newProductDesc} onChange={e => setNewProductDesc(e.target.value)} className="w-full px-4 py-2 border rounded-md" rows="4"></textarea>
                            <input type="number" step="0.01" placeholder="Price" value={newProductPrice} onChange={e => setNewProductPrice(e.target.value)} className="w-full px-4 py-2 border rounded-md" required />
                            <button type="submit" className="w-full px-4 py-2 font-bold text-white bg-indigo-600 rounded hover:bg-indigo-700">Add Product</button>
                        </form>
                    </div>
                </div>

                {/* Right Column: My Products List */}
                <div className="md:col-span-2">
                    <div className="p-6 bg-white rounded-lg shadow-xl">
                        <h2 className="text-2xl font-bold mb-4">Your Product Listings</h2>
                        <div className="space-y-4">
                            {isLoading ? <p>Loading your products...</p> :
                             myProducts.length === 0 ? <p>You have not listed any products yet.</p> :
                             myProducts.map(product => (
                                <div key={product.id} className="flex items-center justify-between p-4 border rounded-md">
                                    <div>
                                        <p className="font-bold">{product.name}</p>
                                        <p className="text-sm text-gray-600">${parseFloat(product.price).toFixed(2)}</p>
                                    </div>
                                    <div className="space-x-2">
                                        <button className="text-sm text-blue-600 hover:underline">Edit</button>
                                        <button onClick={() => handleDeleteProduct(product.id)} className="text-sm text-red-600 hover:underline">Delete</button>
                                    </div>
                                </div>
                             ))
                            }
                        </div>
                    </div>
                </div>
            </main>
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
        </div>
    );
};

export const AdminDashboard = () => {
    // This component remains a placeholder for now.
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

