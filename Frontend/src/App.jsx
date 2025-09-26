import React, { useEffect, useContext } from 'react';
import { AuthProvider, useAuth } from './Auth.jsx';
import { BuyerDashboard, SellerDashboard, AdminDashboard } from './Dashboards.jsx';
import AuthPage from './Auth.jsx';

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

