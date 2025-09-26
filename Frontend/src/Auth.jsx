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
    const [view, setView] = useState('login'); 
    
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('buyer'); 

    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    
    const handleLogin = async () => {
        setError(null); setMessage(null);
        try {
            const result = await apiCall(`${API_URLS.USER}/login`, {
                method: 'POST', body: JSON.stringify({ username, password })
            });
            login(result.username, result.access_token);
        } catch (err) { setError(err.message); }
    };
    
    const handleRegister = async () => {
        setError(null); setMessage(null);
        try {
            const result = await apiCall(`${API_URLS.USER}/register`, {
                method: 'POST', body: JSON.stringify({ username, password, email, role })
            });
            setMessage(result.message + " Please log in.");
            setView('login');
        } catch (err) { setError(err.message); }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
                {error && <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg">{error}</div>}
                {message && <div className="p-3 text-sm text-green-700 bg-green-100 rounded-lg">{message}</div>}
                
                {view === 'login' ? (
                    <div>
                        <h2 className="text-3xl font-bold text-center text-gray-800">Login</h2>
                        <div className="mt-6 space-y-4">
                            <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} className="w-full px-4 py-2 border rounded-md" />
                            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-2 border rounded-md" />
                        </div>
                        <button onClick={handleLogin} className="w-full px-4 py-2 mt-6 font-semibold text-white bg-green-600 rounded-md hover:bg-green-700">Login</button>
                        <p className="mt-4 text-sm text-center text-gray-600">
                            Don't have an account?{' '}
                            <button onClick={() => setView('register')} className="font-medium text-blue-600 hover:underline">
                                Register here
                            </button>
                        </p>
                    </div>
                ) : (
                    <div>
                        <h2 className="text-3xl font-bold text-center text-gray-800">Create Account</h2>
                        <div className="mt-6 space-y-4">
                            <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} className="w-full px-4 py-2 border rounded-md" required />
                            <input type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-2 border rounded-md" required />
                            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-2 border rounded-md" required />
                            
                            <fieldset className="pt-2">
                                <legend className="text-sm font-medium text-gray-700">I am a:</legend>
                                <div className="flex items-center mt-2 space-x-6">
                                    <label className="flex items-center">
                                        <input type="radio" name="role" value="buyer" checked={role === 'buyer'} onChange={() => setRole('buyer')} className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500" />
                                        <span className="ml-2 text-sm text-gray-700">Buyer</span>
                                    </label>
                                    <label className="flex items-center">
                                        <input type="radio" name="role" value="seller" checked={role === 'seller'} onChange={() => setRole('seller')} className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500" />
                                        <span className="ml-2 text-sm text-gray-700">Seller</span>
                                    </label>
                                </div>
                            </fieldset>
                        </div>
                        <button onClick={handleRegister} className="w-full px-4 py-2 mt-6 font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700">Register</button>
                         <p className="mt-4 text-sm text-center text-gray-600">
                            Already have an account?{' '}
                            <button onClick={() => setView('login')} className="font-medium text-blue-600 hover:underline">
                                Login here
                            </button>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuthPage;

