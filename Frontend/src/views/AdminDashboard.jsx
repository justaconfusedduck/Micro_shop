import React from 'react';
import { useAuth } from '../Auth.jsx';

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

