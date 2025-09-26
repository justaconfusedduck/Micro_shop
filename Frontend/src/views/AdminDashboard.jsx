import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, apiCall } from '../Auth.jsx';

const API_URLS = {
    USER: 'http://127.0.0.1:5001',
    PRODUCT: 'http://127.0.0.1:5002',
};

const Toast = ({ message, type, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(onDismiss, 3000);
        return () => clearTimeout(timer);
    }, [onDismiss]);
    const bgColor = type === 'error' ? 'bg-red-500' : 'bg-green-500';
    return <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 px-6 py-3 rounded-md text-white ${bgColor} shadow-lg`}>{message}</div>;
};

export const AdminDashboard = () => {
    const { user, logout } = useAuth();
    const [view, setView] = useState('users');
    const [users, setUsers] = useState([]);
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [toast, setToast] = useState(null);

    const showToast = (message, type = 'success') => setToast({ message, type });

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [usersResult, productsResult] = await Promise.all([
                apiCall(`${API_URLS.USER}/admin/users`),
                apiCall(`${API_URLS.PRODUCT}/products`),
            ]);
            setUsers(usersResult.data || []);
            setProducts(productsResult.data || []);
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
            setProducts(products.filter(p => p.id !== productId));
            showToast(`Product ${productId} deleted successfully.`);
        } catch (error) {
            showToast(error.message, 'error');
        }
    };

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
                    <button onClick={() => setView('users')} className={`px-4 py-2 -mb-px border-b-2 ${view === 'users' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500'}`}>User Management</button>
                    <button onClick={() => setView('products')} className={`px-4 py-2 -mb-px border-b-2 ${view === 'products' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500'}`}>Product Management</button>
                </div>

                {isLoading ? <p className="text-center">Loading data...</p> : (
                    <div className="p-6 bg-white rounded-lg shadow-xl">
                        {view === 'users' && (
                            <div>
                                <h2 className="text-2xl font-bold mb-4">All Users ({users.length})</h2>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead><tr className="border-b bg-gray-50"><th className="p-3">Username</th><th className="p-3">Role</th><th className="p-3">Actions</th></tr></thead>
                                        <tbody>
                                            {users.map(u => (
                                                <tr key={u.username} className="border-b hover:bg-gray-50">
                                                    <td className="p-3 font-medium">{u.username}</td>
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
                            <div>
                                <h2 className="text-2xl font-bold mb-4">All Products ({products.length})</h2>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead><tr className="border-b bg-gray-50"><th className="p-3">ID</th><th className="p-3">Name</th><th className="p-3">Owner</th><th className="p-3">Price</th><th className="p-3">Actions</th></tr></thead>
                                        <tbody>
                                            {products.map(p => (
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
                    </div>
                )}
            </main>
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
        </div>
    );
};

