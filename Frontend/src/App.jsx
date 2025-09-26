import React, { useEffect, useContext } from 'react';
import { AuthProvider, useAuth } from './Auth';
import { BuyerDashboard } from './views/BuyerDashboard';
import { SellerDashboard } from './views/SellerDashboard';
import { AdminDashboard } from './views/AdminDashboard';
import AuthPage from './Auth';

const MainController = () => {
    const { user, logout } = useAuth();
    
    useEffect(() => {
        if (!user) return;

        let inactivityTimer;

        const resetTimer = () => {
            clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(() => {
                console.log("User has been inactive for 1 minute. Logging out.");
                logout();
            }, 1 * 60 * 1000);
        };

        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

        events.forEach(event => {
            window.addEventListener(event, resetTimer);
        });

        resetTimer();

        return () => {
            clearTimeout(inactivityTimer);
            events.forEach(event => {
                window.removeEventListener(event, resetTimer);
            });
        };
    }, [user, logout]); 


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

