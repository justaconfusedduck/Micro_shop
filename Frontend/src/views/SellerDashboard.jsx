import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, apiCall } from '../Auth';

const API_URLS = {
    PRODUCT: 'http://127.0.0.1:5002',
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

export const SellerDashboard = () => {
    const { user, logout } = useAuth();
    const [myProducts, setMyProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [toast, setToast] = useState(null);

    const [newProductName, setNewProductName] = useState('');
    const [newProductDesc, setNewProductDesc] = useState('');
    const [newProductPrice, setNewProductPrice] = useState('');

    const showToast = (message, type = 'success') => setToast({ message, type });

    const fetchMyProducts = useCallback(async () => {
        setIsLoading(true);
        try {
            const result = await apiCall(`${API_URLS.PRODUCT}/products`);
            const allProducts = result.data || []; 
            setMyProducts(allProducts.filter(p => p.owner_id === user.name));
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [user.name]);

    useEffect(() => {
        if (user) fetchMyProducts();
    }, [user, fetchMyProducts]);

    const handleAddProduct = async (e) => {
        e.preventDefault();
        try {
            const { data: newProduct } = await apiCall(`${API_URLS.PRODUCT}/products`, {
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
                                        <button className="text-sm text-blue-600 hover:underline disabled:text-gray-400" disabled>Edit</button>
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

