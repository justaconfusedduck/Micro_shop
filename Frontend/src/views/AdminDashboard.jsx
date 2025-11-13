import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, apiCall } from '../Auth.jsx';
import { 
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar
} from 'recharts';

const API_URLS = {
    USER: 'http://172.31.30.53:5001',
    PRODUCT: 'http://172.31.30.53:5002',
    INVENTORY: 'http://172.31.30.53:5003',
    ORDER: 'http://172.31.30.53:5005',
    REVIEW: 'http://172.31.30.53:5008',
};

const StatCard = ({ title, value, icon }) => (
    <div className="p-6 bg-ocean-surface rounded-lg shadow-lg border border-ocean-accent/20">
        <div className="flex items-center space-x-4">
            <div className="p-3 text-white bg-ocean-primary rounded-full">
                {icon || (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                )}
            </div>
            <div>
                <p className="text-sm font-medium text-ocean-text-muted uppercase">{title}</p>
                <p className="text-3xl font-bold text-ocean-text">{value}</p>
            </div>
        </div>
    </div>
);

const Toast = ({ message, type, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(onDismiss, 3000);
        return () => clearTimeout(timer);
    }, [onDismiss]);
    const bgColor = type === 'error' ? 'bg-ocean-coral' : 'bg-ocean-teal';
    return <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 px-6 py-3 rounded-md text-white ${bgColor} shadow-lg z-50`}>{message}</div>;
};

const EditStockModal = ({ item, onClose, onStockUpdated }) => {
    const [newQuantity, setNewQuantity] = useState(item.quantity);
    const [isUpdating, setIsUpdating] = useState(false);

    const handleUpdate = async () => {
        setIsUpdating(true);
        try {
            const result = await apiCall(`${API_URLS.INVENTORY}/admin/inventory/update`, {
                method: 'POST',
                body: JSON.stringify({
                    product_id: item.productId,
                    quantity: parseInt(newQuantity, 10)
                })
            });
            onStockUpdated(item.productId, result.data.new_quantity);
            onClose();
        } catch (error) {
            console.error("Failed to update stock:", error);
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-ocean-surface rounded-lg shadow-xl p-6 w-full max-w-md">
                <h3 className="text-xl font-bold mb-4 text-ocean-primary">Update Stock for {item.name}</h3>
                <p className="text-sm text-ocean-text-muted mb-2">Product ID: {item.productId}</p>
                <div className="mb-4">
                    <label htmlFor="stock" className="block text-sm font-medium text-ocean-text">New Stock Quantity</label>
                    <input
                        type="number"
                        id="stock"
                        value={newQuantity}
                        onChange={(e) => setNewQuantity(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-ocean-accent/50 rounded-md shadow-sm outline-none focus:ring-2 focus:ring-ocean-primary"
                    />
                </div>
                <div className="flex justify-end space-x-3">
                    <button onClick={onClose} disabled={isUpdating} className="px-4 py-2 bg-ocean-light/50 text-ocean-text rounded-md hover:bg-ocean-accent/30 disabled:opacity-50 transition-colors">Cancel</button>
                    <button onClick={handleUpdate} disabled={isUpdating} className="px-4 py-2 bg-ocean-primary text-white rounded-md hover:bg-ocean-primary-hover disabled:opacity-50 transition-colors">
                        {isUpdating ? 'Updating...' : 'Update Stock'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const getIsoDate = (date) => {
    return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
};

export const AdminDashboard = () => {
    const { user, logout } = useAuth();
    const [view, setView] = useState('overview');
    const [users, setUsers] = useState([]);
    const [products, setProducts] = useState([]);
    const [allOrders, setAllOrders] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [pendingReviews, setPendingReviews] = useState([]);
    
    const [stats, setStats] = useState({ totalRevenue: 0, totalOrders: 0 });
    const [revenueData, setRevenueData] = useState([]);
    const [topProductsData, setTopProductsData] = useState([]);
    
    const [isLoading, setIsLoading] = useState(true);
    const [isFetchingAnalytics, setIsFetchingAnalytics] = useState(false);
    const [toast, setToast] = useState(null);
    const [editingStockItem, setEditingStockItem] = useState(null);

    const [startDate, setStartDate] = useState(getIsoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
    const [endDate, setEndDate] = useState(getIsoDate(new Date()));

    const showToast = (message, type = 'success') => setToast({ message, type });

    const fetchAnalyticsData = useCallback(async () => {
        setIsFetchingAnalytics(true);
        try {
            const queryParams = `?startDate=${startDate}&endDate=${endDate}`;
            
            const [statsResult, revenueResult, topProductsResult] = await Promise.all([
                apiCall(`${API_URLS.ORDER}/admin/stats${queryParams}`),
                apiCall(`${API_URLS.ORDER}/admin/analytics/revenue-over-time${queryParams}`),
                apiCall(`${API_URLS.ORDER}/admin/analytics/top-products${queryParams}`),
            ]);

            setStats(statsResult.data || { totalRevenue: 0, totalOrders: 0 });
            setRevenueData(revenueResult.data || []);
            setTopProductsData(topProductsResult.data || []);

        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setIsFetchingAnalytics(false);
        }
    }, [startDate, endDate]);

    const fetchCoreData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [
                ordersResult,
                usersResult,
                productsResult,
                inventoryResult,
                reviewsResult
            ] = await Promise.all([
                apiCall(`${API_URLS.ORDER}/admin/orders`),
                apiCall(`${API_URLS.USER}/admin/users`),
                apiCall(`${API_URLS.PRODUCT}/products`),
                apiCall(`${API_URLS.INVENTORY}/admin/inventory`),
                apiCall(`${API_URLS.REVIEW}/admin/reviews/pending`),
            ]);

            setAllOrders(ordersResult.data || []);
            setUsers(usersResult.data || []);
            setProducts(productsResult.data || []);
            
            const inventoryData = inventoryResult.data || [];
            const productData = productsResult.data || [];
            
            const productMap = productData.reduce((map, product) => {
                map[product.id] = product.name;
                return map;
            }, {});

            const mergedInventory = inventoryData.map(item => ({
                ...item,
                productId: item.product_id,
                name: productMap[item.product_id] || item.product_id,
            }));
            
            setInventory(mergedInventory);
            setPendingReviews(reviewsResult.data || []);

        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (user) {
            fetchCoreData();
        }
    }, [user, fetchCoreData]);

    useEffect(() => {
        if (user) {
            fetchAnalyticsData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

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
        if (!window.confirm("Are you sure you want to delete this product permanently?")) return;
        try {
            await apiCall(`${API_URLS.PRODUCT}/admin/products/${productId}`, { method: 'DELETE' });
            setProducts(products.filter(p => p.id !== productId));
            setInventory(inventory.filter(item => item.productId !== productId));
            showToast(`Product ${productId} deleted successfully.`);
        } catch (error) {
            showToast(error.message, 'error');
        }
    };

    const handleStockUpdated = (productId, newQuantity) => {
        setInventory(prevInventory => 
            prevInventory.map(item => 
                item.productId === productId ? { ...item, quantity: newQuantity } : item
            )
        );
        showToast("Stock updated successfully!");
    };

    const handleReviewAction = async (reviewId, newStatus) => {
        try {
            await apiCall(`${API_URLS.REVIEW}/admin/reviews/${reviewId}/status`, {
                method: 'PUT',
                body: JSON.stringify({ status: newStatus })
            });
            setPendingReviews(prev => prev.filter(r => r.review_id !== reviewId));
            showToast(`Review ${newStatus}`);
        } catch (error) {
            showToast(error.message, 'error');
        }
    };

    return (
        <div className="min-h-screen bg-ocean-light">
            {editingStockItem && (
                <EditStockModal 
                    item={editingStockItem} 
                    onClose={() => setEditingStockItem(null)}
                    onStockUpdated={handleStockUpdated}
                />
            )}
            <header className="bg-ocean-surface shadow-md border-b border-ocean-accent/30">
                <nav className="container flex items-center justify-between p-4 mx-auto">
                    <h1 className="text-3xl font-bold text-ocean-primary">Admin Dashboard</h1>
                    <div className="flex items-center space-x-4">
                        <span className="text-ocean-text-muted">Welcome, {user.name} (Admin)</span>
                        <button onClick={logout} className="px-4 py-2 font-bold text-white bg-ocean-coral rounded-md hover:bg-ocean-coral-hover transition-colors">Logout</button>
                    </div>
                </nav>
            </header>
            <main className="container p-8 mx-auto">
                <div className="flex mb-6 border-b border-ocean-accent/30">
                    <button onClick={() => setView('overview')} className={`px-4 py-2 -mb-px border-b-2 ${view === 'overview' ? 'border-ocean-primary text-ocean-primary' : 'border-transparent text-ocean-text-muted hover:text-ocean-text'}`}>Overview</button>
                    <button onClick={() => setView('users')} className={`px-4 py-2 -mb-px border-b-2 ${view === 'users' ? 'border-ocean-primary text-ocean-primary' : 'border-transparent text-ocean-text-muted hover:text-ocean-text'}`}>Users</button>
                    <button onClick={() => setView('products')} className={`px-4 py-2 -mb-px border-b-2 ${view === 'products' ? 'border-ocean-primary text-ocean-primary' : 'border-transparent text-ocean-text-muted hover:text-ocean-text'}`}>Products</button>
                    <button onClick={() => setView('inventory')} className={`px-4 py-2 -mb-px border-b-2 ${view === 'inventory' ? 'border-ocean-primary text-ocean-primary' : 'border-transparent text-ocean-text-muted hover:text-ocean-text'}`}>Inventory</button>
                    <button onClick={() => setView('reviews')} className={`px-4 py-2 -mb-px border-b-2 ${view === 'reviews' ? 'border-ocean-primary text-ocean-primary' : 'border-transparent text-ocean-text-muted hover:text-ocean-text'}`}>Reviews</button>
                </div>

                {isLoading ? <p className="text-center text-ocean-text-muted">Loading dashboard data...</p> : (
                    <div>
                        {view === 'overview' && (
                            <div className="space-y-8">
                                
                                <div className="p-4 bg-ocean-surface rounded-lg shadow-md border border-ocean-accent/20">
                                    <div className="flex flex-wrap items-end gap-4">
                                        <div>
                                            <label htmlFor="startDate" className="block text-sm font-medium text-ocean-text-muted">Start Date</label>
                                            <input 
                                                type="date" 
                                                id="startDate"
                                                value={startDate}
                                                onChange={(e) => setStartDate(e.target.value)}
                                                className="w-full p-2 mt-1 border border-ocean-accent/50 rounded-md" 
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="endDate" className="block text-sm font-medium text-ocean-text-muted">End Date</label>
                                            <input 
                                                type="date" 
                                                id="endDate"
                                                value={endDate}
                                                onChange={(e) => setEndDate(e.target.value)}
                                                className="w-full p-2 mt-1 border border-ocean-accent/50 rounded-md" 
                                            />
                                        </div>
                                        <button 
                                            onClick={fetchAnalyticsData} 
                                            disabled={isFetchingAnalytics}
                                            className="px-5 py-2 font-bold text-white bg-ocean-primary rounded-md hover:bg-ocean-primary-hover disabled:bg-gray-400"
                                        >
                                            {isFetchingAnalytics ? 'Loading...' : 'Refresh'}
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                                    <StatCard title="Total Revenue" value={`$${stats.totalRevenue.toFixed(2)}`} />
                                    <StatCard title="Total Orders" value={stats.totalOrders} />
                                    <StatCard title="Total Users" value={users.length} />
                                </div>
                                
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    <div className="p-6 bg-ocean-surface rounded-lg shadow-xl border border-ocean-accent/20">
                                        <h2 className="text-2xl font-bold mb-4 text-ocean-primary">Revenue Over Time</h2>
                                        {isFetchingAnalytics ? <p>Loading chart...</p> : (
                                            <ResponsiveContainer width="100%" height={300}>
                                                <LineChart data={revenueData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#bbe1fa" />
                                                    <XAxis dataKey="date" stroke="#576b7e" />
                                                    <YAxis stroke="#576b7e" />
                                                    <Tooltip formatter={(value) => [`$${value.toFixed(2)}`, "Revenue"]} />
                                                    <Legend />
                                                    <Line type="monotone" dataKey="revenue" stroke="#0f4c75" strokeWidth={2} activeDot={{ r: 8 }} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>
                                    <div className="p-6 bg-ocean-surface rounded-lg shadow-xl border border-ocean-accent/20">
                                        <h2 className="text-2xl font-bold mb-4 text-ocean-primary">Top 5 Selling Products</h2>
                                        {isFetchingAnalytics ? <p>Loading chart...</p> : (
                                            <ResponsiveContainer width="100%" height={300}>
                                                <BarChart data={topProductsData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#bbe1fa" />
                                                    <XAxis type="number" stroke="#576b7e" />
                                                    <YAxis dataKey="name" type="category" width={150} stroke="#576b7e" />
                                                    <Tooltip formatter={(value) => [value, "Units Sold"]} />
                                                    <Legend />
                                                    <Bar dataKey="sold" fill="#3282b8" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>
                                </div>

                                <div className="p-6 bg-ocean-surface rounded-lg shadow-xl border border-ocean-accent/20">
                                    <h2 className="mb-4 text-2xl font-bold text-ocean-primary">Recent Orders</h2>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead><tr className="border-b border-ocean-accent/30 bg-ocean-light/50"><th className="p-3">Order ID</th><th className="p-3">User</th><th className="p-3">Date</th><th className="p-3">Total</th></tr></thead>
                                            <tbody>
                                                {allOrders.slice(0, 10).map(order => (
                                                    <tr key={order.order_id} className="border-b border-ocean-accent/20 hover:bg-ocean-light/50">
                                                        <td className="p-3 font-mono text-sm text-ocean-secondary">{order.order_id.substring(0, 8)}...</td>
                                                        <td className="p-3">{order.user_id}</td>
                                                        <td className="p-3">{new Date(order.created_at).toLocaleDateString()}</td>
                                                        <td className="p-3 font-medium">${order.total_price.toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {allOrders.length === 0 && <p className="p-3 text-center text-ocean-text-muted">No orders found.</p>}
                                    </div>
                                </div>
                            </div>
                        )}

                        {view === 'users' && (
                            <div className="p-6 bg-ocean-surface rounded-lg shadow-xl border border-ocean-accent/20">
                                <h2 className="text-2xl font-bold mb-4 text-ocean-primary">All Users ({users.length})</h2>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead><tr className="border-b border-ocean-accent/30 bg-ocean-light/50"><th className="p-3">Username</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Actions</th></tr></thead>
                                        <tbody>
                                            {users.map(u => (
                                                <tr key={u.username} className="border-b border-ocean-accent/20 hover:bg-ocean-light/50">
                                                    <td className="p-3 font-medium">{u.username}</td>
                                                    <td className="p-3 text-sm text-ocean-text-muted">{u.email}</td>
                                                    <td className="p-3 capitalize">{u.role}</td>
                                                    <td className="p-3">
                                                        <select value={u.role} onChange={(e) => handleRoleChange(u.username, e.target.value)} className="p-1 border border-ocean-accent/50 rounded-md bg-ocean-surface outline-none focus:ring-2 focus:ring-ocean-primary">
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
                            <div className="p-6 bg-ocean-surface rounded-lg shadow-xl border border-ocean-accent/20">
                                <h2 className="text-2xl font-bold mb-4 text-ocean-primary">All Products ({products.length})</h2>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead><tr className="border-b border-ocean-accent/30 bg-ocean-light/50"><th className="p-3">ID</th><th className="p-3">Name</th><th className="p-3">Owner</th><th className="p-3">Price</th><th className="p-3">Actions</th></tr></thead>
                                        <tbody>
                                            {products.map(p => (
                                                <tr key={p.id} className="border-b border-ocean-accent/20 hover:bg-ocean-light/50">
                                                    <td className="p-3 font-mono text-sm text-ocean-secondary">{p.id}</td>
                                                    <td className="p-3 font-medium">{p.name}</td>
                                                    <td className="p-3">{p.owner_id || 'N/A'}</td>
                                                    <td className="p-3">${parseFloat(p.price).toFixed(2)}</td>
                                                    <td className="p-3"><button onClick={() => handleProductDelete(p.id)} className="text-sm font-medium text-ocean-coral hover:underline">Delete</button></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                        
                        {view === 'inventory' && (
                            <div className="p-6 bg-ocean-surface rounded-lg shadow-xl border border-ocean-accent/20">
                                <h2 className="text-2xl font-bold mb-4 text-ocean-primary">Inventory Management</h2>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead><tr className="border-b border-ocean-accent/30 bg-ocean-light/50"><th className="p-3">Product ID</th><th className="p-3">Product Name</th><th className="p-3">Current Stock</th><th className="p-3">Actions</th></tr></thead>
                                        <tbody>
                                            {inventory.map(item => (
                                                <tr key={item.productId} className="border-b border-ocean-accent/20 hover:bg-ocean-light/50">
                                                    <td className="p-3 font-mono text-sm text-ocean-secondary">{item.productId}</td>
                                                    <td className="p-3 font-medium">{item.name}</td>
                                                    <td className="p-3 font-bold">{item.quantity}</td>
                                                    <td className="p-3">
                                                        <button onClick={() => setEditingStockItem(item)} className="text-sm font-medium text-ocean-secondary hover:underline">Update</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {view === 'reviews' && (
                             <div className="p-6 bg-ocean-surface rounded-lg shadow-xl border border-ocean-accent/20">
                                <h2 className="text-2xl font-bold mb-4 text-ocean-primary">Pending Reviews ({pendingReviews.length})</h2>
                                <div className="space-y-4">
                                    {pendingReviews.length === 0 ? (
                                        <p className="text-ocean-text-muted">No pending reviews.</p>
                                    ) : (
                                        pendingReviews.map(review => (
                                            <div key={review.review_id} className="p-4 border border-ocean-accent/20 rounded-md">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="font-bold text-ocean-text">{review.product_id}</span>
                                                    <span className="text-yellow-500">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
                                                </div>
                                                <p className="text-ocean-text-muted mb-1">By: {review.user_id}</p>
                                                <p className="italic">"{review.comment}"</p>
                                                <div className="flex justify-end space-x-3 mt-4">
                                                    <button onClick={() => handleReviewAction(review.review_id, 'rejected')} className="px-3 py-1 text-sm font-medium text-ocean-coral bg-ocean-coral/10 rounded-md hover:bg-ocean-coral/20 transition-colors">Reject</button>
                                                    <button onClick={() => handleReviewAction(review.review_id, 'approved')} className="px-3 py-1 text-sm font-medium text-white bg-ocean-teal rounded-md hover:bg-ocean-teal-dark transition-colors">Approve</button>
                                                </div>
                                            </div>
                                        ))
                                    )}
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