import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { jwtDecode } from 'jwt-decode';

const API_URLS = {
    USER: 'http://127.0.0.1:5001',
};

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        const token = localStorage.getItem('accessToken');
        if (!token) return null;
        try {
            const decoded = jwtDecode(token);
            if (decoded.exp * 1000 < Date.now()) {
                localStorage.clear();
                return null;
            }
            return { name: decoded.sub, role: decoded.role };
        } catch (e) {
            return null;
        }
    });

    const login = (username, accessToken) => {
        const decoded = jwtDecode(accessToken);
        const userRole = decoded.role || 'buyer';
        setUser({ name: username, role: userRole });
        localStorage.setItem('username', username);
        localStorage.setItem('accessToken', accessToken);
    };

    const logout = useCallback(() => {
        setUser(null);
        localStorage.removeItem('username');
        localStorage.removeItem('accessToken');
        apiCall(`${API_URLS.USER}/logout`, { method: 'POST' }).catch(console.error);
    }, []);

    const authContextValue = { user, login, logout };

    return (
        <AuthContext.Provider value={authContextValue}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);


export const apiCall = async (url, options = {}) => {
    options.credentials = 'include';
    const token = localStorage.getItem('accessToken');
    options.headers = {
        ...options.headers,
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };

    try {
        let response = await fetch(url, options);
        if (response.status === 401) {
            const refreshResponse = await fetch(`${API_URLS.USER}/refresh`, { method: 'POST', credentials: 'include' });
            if (!refreshResponse.ok) throw new Error("Session expired.");
            
            const { access_token } = await refreshResponse.json();
            localStorage.setItem('accessToken', access_token);
            options.headers['Authorization'] = `Bearer ${access_token}`;
            response = await fetch(url, options);
        }
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        return text ? JSON.parse(text) : {};
    } catch (error) {
        if (error.message.includes("Session expired")) {
             window.dispatchEvent(new CustomEvent('force-logout'));
        }
        throw error;
    }
};

const AuthPage = () => {
    const { login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);

    const handleAuth = async (endpoint) => {
        setError(null); setMessage(null);
        try {
            const result = await apiCall(`${API_URLS.USER}/${endpoint}`, {
                method: 'POST', body: JSON.stringify({ username, password })
            });
            if (endpoint === 'login') {
                login(result.username, result.access_token);
            } else {
                setMessage(result.message);
            }
        } catch (err) { setError(err.message); }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
                 {error && <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg">{error}</div>}
                 {message && <div className="p-3 text-sm text-green-700 bg-green-100 rounded-lg">{message}</div>}
                <h2 className="text-3xl font-bold text-center text-gray-800">Welcome</h2>
                <div className="space-y-4">
                    <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} className="w-full px-4 py-2 border rounded-md" />
                    <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-2 border rounded-md" />
                </div>
                <div className="flex space-x-4">
                    <button onClick={() => handleAuth('login')} className="w-full px-4 py-2 font-semibold text-white bg-green-600 rounded-md hover:bg-green-700">Login</button>
                    <button onClick={() => handleAuth('register')} className="w-full px-4 py-2 font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700">Register</button>
                </div>
            </div>
        </div>
    );
};

export default AuthPage;

