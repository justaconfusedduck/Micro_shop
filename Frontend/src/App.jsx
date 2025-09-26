import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './Auth';
import { BuyerDashboard } from './views/BuyerDashboard';
import { SellerDashboard } from './views/SellerDashboard';
import { AdminDashboard } from './views/AdminDashboard';
import AuthPage from './Auth';

const MainController = () => {
    const { user, logout } = useAuth();
    
    useEffect(() => {
        const handleForceLogout = () => logout();
        window.addEventListener('force-logout', handleForceLogout);
        return () => window.removeEventListener('force-logout', handleForceLogout);
    }, [logout]);

    if (!user) {
        return <AuthPage />;
    }

    switch (user.role) {
        case 'seller':
            return <SellerDashboard />;
        case 'admin':
            return <AdminDashboard />;
        case 'buyer':
        default:
            return <BuyerDashboard />;
    }
}

export default function App() {
    return (
        <AuthProvider>
            <MainController />
        </AuthProvider>
    );
}

