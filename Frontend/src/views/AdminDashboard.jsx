import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, apiCall } from '../Auth';

const API_URLS = {
    USER: 'http://127.0.0.1:5001',
    PRODUCT: 'http://127.0.0.1:5002',
    INVENTORY: 'http://127.0.0.1:5003',
    ORDER: 'http://127.0.0.1:5005',
    REVIEW: 'http://127.0.0.1:5008',
};

const StatCard = ({ title, value, icon }) => (
    <div className="p-6 bg-white rounded-lg shadow-lg">
        <div className="flex items-center space-x-4">
            <div className="p-3 text-white bg-blue-500 rounded-full">
                {icon || (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                )}
            </div>
            <div>
                <p className="text-sm font-medium text-gray-500 uppercase">{title}</p>
                <p className="text-3xl font-bold text-gray-900">{value}</p>
            </div>
        </div>
    </div>
);

const Toast = ({ message, type, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(onDismiss, 3000);
        return () => clearTimeout(timer);
    }, [onDismiss]);
    const bgColor = type === 'error' ? 'bg-red-500' : 'bg-green-500';
    return <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 px-6 py-3 rounded-md text-white ${bgColor} shadow-lg z-50`}>{message}</div>;
};

const StarRating = ({ rating }) => (
    <div className="flex items-center">
        {[...Array(5)].map((_, i) => (
            <svg key={i} className={`w-4 h-4 ${i < rating ? 'text-yellow-400' : 'text-gray-300'}`} fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
            </svg>
        ))}
    </div>
);

export const AdminDashboard = () => {
    const { user, logout } = useAuth();
    
    const [view, setView] = useState('overview');
    const [users, setUsers] = useState([]);
    const [allProducts, setAllProducts] = useState([]);
    const [allInventory, setAllInventory] = useState([]);
    const [pendingReviews, setPendingReviews] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [toast, setToast] = useState(null);

    const [stats, setStats] = useState({ totalRevenue: 0, totalOrders: 0 });
    const [allOrders, setAllOrders] = useState([]);

    const showToast = (message, type = 'success') => setToast({ message, type });

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [
                statsResult,
                ordersResult,
                usersResult,
                productsResult,
                inventoryResult,
                reviewsResult
            ] = await Promise.allSettled([
                apiCall(`${API_URLS.ORDER}/admin/stats`),
                apiCall(`${API_URLS.ORDER}/admin/orders`),
                apiCall(`${API_URLS.USER}/admin/users`),
                apiCall(`${API_URLS.PRODUCT}/products`),
                apiCall(`${API_URLS.INVENTORY}/admin/inventory`),
                apiCall(`${API_URLS.REVIEW}/admin/reviews/pending`),
            ]);
            
            setStats(statsResult.status === 'fulfilled' ? statsResult.value.data : { totalRevenue: 0, totalOrders: 0 });
            setAllOrders(ordersResult.status === 'fulfilled' ? ordersResult.value.data : []);
            setUsers(usersResult.status === 'fulfilled' ? usersResult.value.data : []);
            setAllProducts(productsResult.status === 'fulfilled' ? productsResult.value.data : []);
            setAllInventory(inventoryResult.status === 'fulfilled' ? inventoryResult.value.data : []);
            setPendingReviews(reviewsResult.status === 'fulfilled' ? reviewsResult.value.data : []);

        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if(user) fetchData();
    }, [user, fetchData]);

    const handleRoleChange = async (username, newRole) => {
        try {
            await apiCall(`${API_URLS.USER}/admin/users/${username}/role`, {
                method: 'PUT',
                body: JSON.stringify({ role: newRole }),
            });
            setUsers(users.map(u => u.username === username ? { ...u, role: newRole } : u));
            showToast(`User ${username}'s role updated to ${newRole}`);
        } catch (error) {
            showToast(error.message, 'error');
        }
    };
    
    const handleProductDelete = async (productId) => {
        if (!window.confirm("Are you sure you want to delete this product permanently? This action cannot be undone.")) return;
        try {
            await apiCall(`${API_URLS.PRODUCT}/admin/products/${productId}`, { method: 'DELETE' });
            setAllProducts(allProducts.filter(p => p.id !== productId));
            showToast(`Product ${productId} deleted successfully.`);
        } catch (error) {
            showToast(error.message, 'error');
        }
    };
    
    const handleStockUpdate = async (productId, newQuantity) => {
        const quantityNum = parseInt(newQuantity, 10);
        if (isNaN(quantityNum) || quantityNum < 0) {
            showToast("Please enter a valid, non-negative quantity.", "error");
            return;
        }

        try {
            await apiCall(`${API_URLS.INVENTORY}/admin/inventory/update`, {
                method: 'POST',
                body: JSON.stringify({ product_id: productId, quantity: quantityNum }),
            });
            
            setAllInventory(prevInventory => {
                const itemExists = prevInventory.some(item => item.product_id === productId);
                if (itemExists) {
                    return prevInventory.map(item => 
                        item.product_id === productId ? { ...item, quantity: quantityNum } : item
                    );
                } else {
                    return [...prevInventory, { product_id: productId, quantity: quantityNum }];
                }
            });
            
            showToast(`Stock updated for ${productId}.`);
        } catch (error) {
            showToast(error.message, 'error');
        }
    };

    const handleApproveReview = async (reviewId) => {
        try {
            await apiCall(`${API_URLS.REVIEW}/admin/reviews/approve/${reviewId}`, { method: 'POST' });
            setPendingReviews(prev => prev.filter(r => r.review_id !== reviewId));
            showToast("Review approved.");
        } catch (error) {
            showToast(error.message, 'error');
        }
    };
    
    const handleRejectReview = async (reviewId) => {
        try {
            await apiCall(`${API_URLS.REVIEW}/admin/reviews/reject/${reviewId}`, { method: 'POST' });
            setPendingReviews(prev => prev.filter(r => r.review_id !== reviewId));
            showToast("Review rejected.");
        } catch (error) {
            showToast(error.message, 'error');
        }
    };
    
    const combinedInventory = allProducts.map(product => {
        const inventoryItem = allInventory.find(item => item.product_id === product.id);
        return {
            ...product,
            quantity: inventoryItem ? inventoryItem.quantity : 0,
        };
    });

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
                <div className="flex mb-6 border-b">
                    <button onClick={() => setView('overview')} className={`px-4 py-2 -mb-px border-b-2 ${view === 'overview' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500'}`}>
                        Overview
                    </button>
                    <button onClick={() => setView('users')} className={`px-4 py-2 -mb-px border-b-2 ${view === 'users' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500'}`}>
                        Users
                    </button>
                    <button onClick={() => setView('products')} className={`px-4 py-2 -mb-px border-b-2 ${view === 'products' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500'}`}>
                        Products
                    </button>
                    <button onClick={() => setView('inventory')} className={`px-4 py-2 -mb-px border-b-2 ${view === 'inventory' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500'}`}>
                        Inventory
                    </button>
                    <button onClick={() => setView('reviews')} className={`px-4 py-2 -mb-px border-b-2 ${view === 'reviews' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500'}`}>
                        Reviews
                    </button>
                </div>

                {isLoading ? <p className="text-center">Loading dashboard data...</p> : (
                    <div>
                        {view === 'overview' && (
                            <div className="space-y-8">
                                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                                    <StatCard title="Total Revenue" value={`$${stats.totalRevenue.toFixed(2)}`} />
                                    <StatCard title="Total Orders" value={stats.totalOrders} />
                                    <StatCard title="Total Users" value={users.length} />
                                </div>
                                
                                <div className="p-6 bg-white rounded-lg shadow-xl">
                                    <h2 className="mb-4 text-2xl font-bold">Recent Orders</h2>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead><tr className="border-b bg-gray-50"><th className="p-3">Order ID</th><th className="p-3">User</th><th className="p-3">Date</th><th className="p-3">Total</th></tr></thead>
                                            <tbody>
                                                {allOrders.slice(0, 10).map(order => (
                                                    <tr key={order.order_id} className="border-b hover:bg-gray-50">
                                                        <td className="p-3 font-mono text-sm">{order.order_id.substring(0, 8)}...</td>
                                                        <td className="p-3">{order.user_id}</td>
                                                        <td className="p-3">{new Date(order.created_at).toLocaleDateString()}</td>
                                                        <td className="p-3 font-medium">${order.total_price.toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {allOrders.length === 0 && <p className="p-3 text-center text-gray-500">No orders found.</p>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {view === 'users' && (
                            <div className="p-6 bg-white rounded-lg shadow-xl">
                                <h2 className="text-2xl font-bold mb-4">All Users ({users.length})</h2>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead><tr className="border-b bg-gray-50"><th className="p-3">Username</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Actions</th></tr></thead>
                                        <tbody>
                                            {users.map(u => (
                                                <tr key={u.username} className="border-b hover:bg-gray-50">
                                                    <td className="p-3 font-medium">{u.username}</td>
                                                    <td className="p-3 text-sm text-gray-600">{u.email}</td>
                                                    <td className="p-3 capitalize">{u.role}</td>
                                                    <td className="p-3">
                                                        <select value={u.role} onChange={(e) => handleRoleChange(u.username, e.target.value)} className="p-1 border rounded-md bg-white">
                                                            <option value="buyer">Buyer</option>
                                                            <option value="seller">Seller</option>
                                                            <option value="admin">Admin</option>
                                                        </select>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {view === 'products' && (
                            <div className="p-6 bg-white rounded-lg shadow-xl">
                                <h2 className="text-2xl font-bold mb-4">All Products ({allProducts.length})</h2>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead><tr className="border-b bg-gray-50"><th className="p-3">ID</th><th className="p-3">Name</th><th className="p-3">Owner</th><th className="p-3">Price</th><th className="p-3">Actions</th></tr></thead>
                                        <tbody>
                                            {allProducts.map(p => (
                                                <tr key={p.id} className="border-b hover:bg-gray-50">
                                                    <td className="p-3 font-mono text-sm">{p.id}</td>
                                                    <td className="p-3 font-medium">{p.name}</td>
                                                    <td className="p-3">{p.owner_id || 'N/A'}</td>
                                                    <td className="p-3">${parseFloat(p.price).toFixed(2)}</td>
                                                    <td className="p-3"><button onClick={() => handleProductDelete(p.id)} className="text-sm font-medium text-red-600 hover:underline">Delete</button></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                        
                        {view === 'inventory' && (
                            <div className="p-6 bg-white rounded-lg shadow-xl">
                                <h2 className="text-2xl font-bold mb-4">Inventory Management</h2>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead><tr className="border-b bg-gray-50"><th className="p-3">ID</th><th className="p-3">Name</th><th className="p-3">Current Stock</th><th className="p-3">Update Stock</th></tr></thead>
                                        <tbody>
                                            {combinedInventory.map(p => (
                                                <tr key={p.id} className="border-b hover:bg-gray-50">
                                                    <td className="p-3 font-mono text-sm">{p.id}</td>
                                                    <td className="p-3 font-medium">{p.name}</td>
                                                    <td className="p-3">{p.quantity}</td>
                                                    <td className="p-3">
                                                        <form className="flex space-x-2" onSubmit={(e) => {
                                                            e.preventDefault();
                                                            handleStockUpdate(p.id, e.target.elements.quantity.value);
                                                        }}>
                                                            <input type="number" name="quantity" defaultValue={p.quantity} className="w-20 p-1 border rounded-md" />
                                                            <button type="submit" className="px-3 py-1 text-sm font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600">Update</button>
                                                        </form>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                        
                        {view === 'reviews' && (
                            <div className="p-6 bg-white rounded-lg shadow-xl">
                                <h2 className="text-2xl font-bold mb-4">Pending Reviews ({pendingReviews.length})</h2>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="border-b bg-gray-50">
                                                <th className="p-3">User</th>
                                                <th className="p-3">Product</th>
                                                <th className="p-3">Rating</th>
                                                <th className="p-3">Comment</th>
                                                <th className="p-3">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pendingReviews.map(review => {
                                                const productName = allProducts.find(p => p.id === review.product_id)?.name || review.product_id;
                                                return (
                                                    <tr key={review.review_id} className="border-b hover:bg-gray-50">
                                                        <td className="p-3 font-medium">{review.user_id}</td>
                                                        <td className="p-3">{productName}</td>
                                                        <td className="p-3"><StarRating rating={review.rating} /></td>
                                                        <td className="p-3 text-sm text-gray-600">{review.comment}</td>
                                                        <td className="p-3 flex space-x-2">
                                                            <button onClick={() => handleApproveReview(review.review_id)} className="px-3 py-1 text-sm font-medium text-white bg-green-500 rounded-md hover:bg-green-600">
                                                                Approve
                                                            </button>
                                                            <button onClick={() => handleRejectReview(review.review_id)} className="px-3 py-1 text-sm font-medium text-white bg-red-500 rounded-md hover:bg-red-600">
                                                                Reject
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {pendingReviews.length === 0 && <p className="p-3 text-center text-gray-500">No pending reviews found.</p>}
                                </div>
                            </div>
                        )}

                    </div>
                )}
            </main>
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
        </div>
    );
};