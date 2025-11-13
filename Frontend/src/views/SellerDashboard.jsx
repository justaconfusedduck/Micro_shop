import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, apiCall } from '../Auth.jsx';

const API_URLS = {
    PRODUCT: 'http://172.31.30.53:5002',
    ORDER: 'http://172.31.30.53:5005',
    REVIEW: 'http://172.31.30.53:5008',
};

const Toast = ({ message, type, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(onDismiss, 3000);
        return () => clearTimeout(timer);
    }, [onDismiss]);
    const bgColor = type === 'error' ? 'bg-red-500' : 'bg-green-500';
    return <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 px-6 py-3 rounded-md text-white ${bgColor} shadow-lg z-50`}>{message}</div>;
};

const StatCard = ({ title, value, icon }) => (
    <div className="p-6 bg-white rounded-lg shadow-lg">
        <div className="flex items-center space-x-4">
            <div className="p-3 text-white bg-indigo-500 rounded-full">
                {icon}
            </div>
            <div>
                <p className="text-sm font-medium text-gray-500 uppercase">{title}</p>
                <p className="text-3xl font-bold text-gray-900">{value}</p>
            </div>
        </div>
    </div>
);

const EditProductModal = ({ product, onClose, onSave, showToast }) => {
    const [name, setName] = useState(product.name);
    const [description, setDescription] = useState(product.description);
    const [price, setPrice] = useState(product.price);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const updatedData = {
                name,
                description,
                price: parseFloat(price)
            };
            
            await apiCall(`${API_URLS.PRODUCT}/products/${product.id}`, {
                method: 'PUT',
                body: JSON.stringify(updatedData)
            });
            
            onSave({ ...product, ...updatedData });
            showToast("Product updated successfully!");
            onClose();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="w-full max-w-lg p-6 bg-white rounded-lg shadow-xl">
                <h2 className="text-2xl font-bold mb-4">Edit Product</h2>
                <form onSubmit={handleSave} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Product Name</label>
                        <input 
                            type="text" 
                            value={name} 
                            onChange={e => setName(e.target.value)} 
                            className="w-full px-4 py-2 mt-1 border rounded-md" 
                            required 
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Description</label>
                        <textarea 
                            value={description} 
                            onChange={e => setDescription(e.target.value)} 
                            className="w-full px-4 py-2 mt-1 border rounded-md" 
                            rows="4"
                        ></textarea>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Price</label>
                        <input 
                            type="number" 
                            step="0.01" 
                            value={price} 
                            onChange={e => setPrice(e.target.value)} 
                            className="w-full px-4 py-2 mt-1 border rounded-md" 
                            required 
                        />
                    </div>
                    <div className="flex justify-end space-x-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
                            Cancel
                        </button>
                        <button type="submit" disabled={isSaving} className="px-4 py-2 font-bold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-gray-400">
                            {isSaving ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const StarRating = ({ rating, count }) => {
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5 ? 1 : 0;
    const emptyStars = 5 - fullStars - halfStar;
    
    return (
        <div className="flex items-center">
            {[...Array(fullStars)].map((_, i) => (
                <svg key={`full-${i}`} className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/></svg>
            ))}
            {halfStar > 0 && (
                <svg key="half" className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0v15z"/></svg>
            )}
            {[...Array(emptyStars)].map((_, i) => (
                <svg key={`empty-${i}`} className="w-4 h-4 text-gray-300" fill="currentColor" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/></svg>
            ))}
            {count > 0 && (
                <span className="ml-1 text-xs text-gray-600">({count})</span>
            )}
        </div>
    );
};

export const SellerDashboard = () => {
    const { user, logout } = useAuth();
    const [myProducts, setMyProducts] = useState([]);
    const [stats, setStats] = useState({ totalRevenue: 0, totalSales: 0 });
    const [reviews, setReviews] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [toast, setToast] = useState(null);
    const [currentView, setCurrentView] = useState('products');
    
    const [newProductName, setNewProductName] = useState('');
    const [newProductDesc, setNewProductDesc] = useState('');
    const [newProductPrice, setNewProductPrice] = useState('');
    
    const [editingProduct, setEditingProduct] = useState(null);

    const showToast = (message, type = 'success') => setToast({ message, type });

    const fetchAllData = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const productResult = await apiCall(`${API_URLS.PRODUCT}/products`);
            const allProducts = productResult.data || [];
            const sellerProducts = allProducts.filter(p => p.owner_id === user.name);
            setMyProducts(sellerProducts);
            
            const statsResult = await apiCall(`${API_URLS.ORDER}/seller/stats`);
            setStats(statsResult.data || { totalRevenue: 0, totalSales: 0 });

            const sellerProductIds = sellerProducts.map(p => p.id);
            if (sellerProductIds.length > 0) {
                const reviewsResult = await apiCall(`${API_URLS.REVIEW}/seller/reviews`, {
                    method: 'POST',
                    body: JSON.stringify({ product_ids: sellerProductIds })
                });
                setReviews(reviewsResult.data || []);
            }
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

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
    
    const handleProductUpdated = (updatedProduct) => {
        setMyProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
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
            
            <main className="container p-8 mx-auto">
                <div className="grid grid-cols-1 gap-6 mb-8 md:grid-cols-3">
                    <StatCard 
                        title="Total Revenue" 
                        value={`$${stats.totalRevenue.toFixed(2)}`}
                        icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.105 0 2 .895 2 2s-.895 2-2 2-2-.895-2-2 .895-2 2 2zm0 8c-1.105 0-2 .895-2 2s.895 2 2 2 2-.895 2-2-.895-2-2-2zm0 8c-1.105 0-2 .895-2 2s.895 2 2 2 2-.895 2-2-.895-2-2-2z"></path></svg>}
                    />
                    <StatCard 
                        title="Total Sales" 
                        value={stats.totalSales}
                        icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>}
                    />
                     <StatCard 
                        title="Total Products" 
                        value={myProducts.length}
                        icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>}
                    />
                </div>
                
                <div className="flex mb-6 border-b">
                    <button onClick={() => setCurrentView('products')} className={`px-4 py-2 -mb-px border-b-2 ${currentView === 'products' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>
                        My Products
                    </button>
                    <button onClick={() => setCurrentView('reviews')} className={`px-4 py-2 -mb-px border-b-2 ${currentView === 'reviews' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>
                        My Reviews
                    </button>
                </div>
                
                {isLoading ? <p className="text-center">Loading dashboard data...</p> : (
                    <div>
                        {currentView === 'products' && (
                            <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
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
                                
                                <div className="md:col-span-2">
                                    <div className="p-6 bg-white rounded-lg shadow-xl">
                                        <h2 className="text-2xl font-bold mb-4">Your Product Listings</h2>
                                        <div className="space-y-4">
                                            {myProducts.length === 0 ? <p>You have not listed any products yet.</p> :
                                             myProducts.map(product => (
                                                <div key={product.id} className="flex items-center justify-between p-4 border rounded-md">
                                                    <div>
                                                        <p className="font-bold">{product.name}</p>
                                                        <p className="text-sm text-gray-600">${parseFloat(product.price).toFixed(2)}</p>
                                                    </div>
                                                    <div className="space-x-2">
                                                        <button onClick={() => setEditingProduct(product)} className="text-sm text-blue-600 hover:underline">Edit</button>
                                                        <button onClick={() => handleDeleteProduct(product.id)} className="text-sm text-red-600 hover:underline">Delete</button>
                                                    </div>
                                                </div>
                                             ))
                                            }
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {currentView === 'reviews' && (
                            <div className="p-6 bg-white rounded-lg shadow-xl">
                                <h2 className="text-2xl font-bold mb-4">Reviews for Your Products</h2>
                                <div className="space-y-4">
                                    {reviews.length === 0 ? <p>You have no reviews yet.</p> :
                                     reviews.map(review => (
                                        <div key={review.review_id} className={`p-4 border rounded-md ${review.status === 'pending' ? 'bg-yellow-50' : 'bg-green-50'}`}>
                                            <div className="flex justify-between items-center">
                                                <p className="font-semibold">{myProducts.find(p => p.id === review.product_id)?.name || 'Unknown Product'}</p>
                                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${review.status === 'pending' ? 'bg-yellow-200 text-yellow-800' : 'bg-green-200 text-green-800'}`}>
                                                    {review.status}
                                                </span>
                                            </div>
                                            <StarRating rating={review.rating} count={-1} />
                                            <p className="mt-2 text-gray-700">{review.comment}</p>
                                        </div>
                                     ))
                                    }
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>
            
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
            
            {editingProduct && (
                <EditProductModal
                    product={editingProduct}
                    onClose={() => setEditingProduct(null)}
                    onSave={handleProductUpdated}
                    showToast={showToast}
                />
            )}
        </div>
    );
};