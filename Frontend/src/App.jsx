import React, { useEffect, useContext } from 'react';
import { AuthProvider, useAuth } from './Auth';
import { BuyerDashboard } from './views/BuyerDashboard';
import { SellerDashboard } from './views/SellerDashboard';
import { AdminDashboard } from './views/AdminDashboard';
import AuthPage from './Auth';

// This is the main controller that decides which page to show.
const MainController = () => {
    const { user, logout } = useAuth();
    
    // --- INACTIVITY LOGOUT LOGIC ---
    useEffect(() => {
        // This effect should only run when a user is logged in.
        if (!user) return;

        let inactivityTimer;

        // Function to reset the timer
        const resetTimer = () => {
            // Clear the previous timer
            clearTimeout(inactivityTimer);
            // Set a new timer for 1 minute
            inactivityTimer = setTimeout(() => {
                // When the timer fires, call the logout function
                console.log("User has been inactive for 1 minute. Logging out.");
                logout();
            }, 10 * 60 * 1000); // 1 minute in milliseconds
        };

        // List of events that indicate user activity
        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];

        // Add event listeners for all activity events
        events.forEach(event => {
            window.addEventListener(event, resetTimer);
        });

        // Start the timer for the first time
        resetTimer();

        // Cleanup function: This is crucial to prevent memory leaks.
        // It runs when the component unmounts (e.g., when the user logs out manually).
        return () => {
            clearTimeout(inactivityTimer);
            events.forEach(event => {
                window.removeEventListener(event, resetTimer);
            });
        };
    }, [user, logout]); // Re-run the effect if the user or logout function changes


    // This effect listens for the 'force-logout' event triggered by API errors.
    useEffect(() => {
        const handleForceLogout = () => logout();
        window.addEventListener('force-logout', handleForceLogout);
        return () => window.removeEventListener('force-logout', handleForceLogout);
    }, [logout]);

    // If there is no user, show the login page.
    if (!user) {
        return <AuthPage />;
    }

    // Check the user's role and render the correct dashboard from its own file.
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

// The root App component wraps everything in the AuthProvider.
export default function App() {
    return (
        <AuthProvider>
            <MainController />
        </AuthProvider>
    );
}

