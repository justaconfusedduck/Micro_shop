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
            if (decoded.exp * 1000 < Date.now()) { localStorage.clear(); return null; }
            return { name: decoded.sub, role: decoded.role };
        } catch (e) { return null; }
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
        apiCall(`${API_URLS.USER}/logout`, { method: 'POST' }, true).catch(console.error);
    }, []);

    const authContextValue = { user, login, logout };
    return (<AuthContext.Provider value={authContextValue}>{children}</AuthContext.Provider>);
};
export const useAuth = () => useContext(AuthContext);


export const apiCall = async (url, options = {}, suppressErrors = false) => {
    options.credentials = 'include';
    const token = localStorage.getItem('accessToken');
    options.headers = { ...options.headers, 'Content-Type': 'application/json', 'Authorization': token ? `Bearer ${token}` : '' };

    try {
        let response = await fetch(url, options);

        const isLoginAttempt = url.includes('/login') || url.includes('/register');

        if (response.status === 401 && !isLoginAttempt) {
            const refreshResponse = await fetch(`${API_URLS.USER}/refresh`, { method: 'POST', credentials: 'include' });
            if (!refreshResponse.ok) throw new Error("Session expired.");
            
            const { access_token } = await refreshResponse.json();
            localStorage.setItem('accessToken', access_token);
            options.headers['Authorization'] = `Bearer ${access_token}`;
            response = await fetch(url, options);
        }
        
        if (response.status === 206) {
            return { status: 206, data: await response.json() };
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        const data = text ? JSON.parse(text) : {};
        return { status: response.status, data };

    } catch (error) {
        if (error.message.includes("Session expired")) {
             window.dispatchEvent(new CustomEvent('force-logout'));
        }
        if(!suppressErrors) {
            throw error;
        }
    }
};

const AuthPage = () => {
    const { login } = useAuth();
    const [view, setView] = useState('login'); 
    
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('buyer');
    
    const [captcha, setCaptcha] = useState(null);
    const [captchaAnswer, setCaptchaAnswer] = useState('');
    
    const [otp, setOtp] = useState('');
    const [preAuthToken, setPreAuthToken] = useState(null);

    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    
    const fetchCaptcha = useCallback(async () => {
        try {
            const result = await apiCall(`${API_URLS.USER}/captcha/new`);
            if (result && result.data) setCaptcha(result.data);
        } catch (err) { setError("Failed to load CAPTCHA. Please refresh the page."); }
    }, []);

    useEffect(() => {
        if (view === 'login' || view === 'register') {
            fetchCaptcha();
        }
    }, [view, fetchCaptcha]);
    
    const handleLogin = async () => {
        setError(null); setMessage(null);
        try {
            const result = await apiCall(`${API_URLS.USER}/login`, { 
                method: 'POST', 
                body: JSON.stringify({ 
                    username, 
                    password,
                    captcha_id: captcha?.captcha_id,
                    captcha_answer: captchaAnswer
                }) 
            });

            if (result.status === 206) {
                setMessage(result.data.message); 
                setPreAuthToken(result.data.pre_auth_token); 
                setView('otp-login');
            } else if (result.status === 200) { 
                login(result.data.username, result.data.access_token); 
            }
        } catch (err) { 
            setError(err.message); 
            fetchCaptcha(); 
            setCaptchaAnswer(''); 
        }
    };

    const handleVerifyLoginOtp = async () => {
        setError(null); setMessage(null);
        try {
             const result = await apiCall(`${API_URLS.USER}/login/verify-otp`, { 
                method: 'POST', 
                body: JSON.stringify({ pre_auth_token: preAuthToken, otp_code: otp }) 
            });
            login(result.data.username, result.data.access_token);
        } catch (err) { setError(err.message); }
    };
    
    const handleRegisterStart = async () => {
        setError(null); setMessage(null);

        const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
        if (!usernameRegex.test(username)) {
            setError("Username must be 3-20 characters long and can only contain letters, numbers, and underscores.");
            return;
        }

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!passwordRegex.test(password)) {
            setError("Password must be at least 8 characters long, and include an uppercase letter, a lowercase letter, a number, and a special character.");
            return;
        }
        
        if (password !== confirmPassword) { 
            setError("Passwords do not match."); 
            return; 
        }

        try {
            const result = await apiCall(`${API_URLS.USER}/register/start`, {
                method: 'POST', 
                body: JSON.stringify({ 
                    username, password, email, role,
                    captcha_id: captcha?.captcha_id,
                    captcha_answer: captchaAnswer
                })
            });

            if (result.status === 206) {
                setMessage(result.data.message);
                setPreAuthToken(result.data.pre_reg_token);
                setView('otp-register');
            }
        } catch (err) { 
            setError(err.message);
            fetchCaptcha();
            setCaptchaAnswer('');
        }
    };

    const handleRegisterVerify = async () => {
        setError(null); setMessage(null);
        try {
            const result = await apiCall(`${API_URLS.USER}/register/verify`, {
                method: 'POST',
                body: JSON.stringify({ pre_reg_token: preAuthToken, otp_code: otp })
            });
            setMessage(result.data.message + " You can now log in.");
            setView('login');
        } catch (err) { setError(err.message); }
    };

    const renderContent = () => {
        switch (view) {
            case 'otp-login':
                return ( <div> <h2 className="text-3xl font-bold text-center text-gray-800">Enter Verification Code</h2> <p className="mt-2 text-sm text-center text-gray-600">{message}</p> <div className="mt-6 space-y-4"> <input type="text" placeholder="6-Digit OTP" value={otp} onChange={e => setOtp(e.target.value)} className="w-full px-4 py-2 text-center border rounded-md" maxLength="6" /> </div> <button onClick={handleVerifyLoginOtp} className="w-full px-4 py-2 mt-6 font-semibold text-white bg-green-600 rounded-md hover:bg-green-700">Verify & Login</button> </div> );
            case 'otp-register':
                return ( <div> <h2 className="text-3xl font-bold text-center text-gray-800">Verify Your Email</h2> <p className="mt-2 text-sm text-center text-gray-600">{message}</p> <div className="mt-6 space-y-4"> <input type="text" placeholder="6-Digit OTP" value={otp} onChange={e => setOtp(e.target.value)} className="w-full px-4 py-2 text-center border rounded-md" maxLength="6" /> </div> <button onClick={handleRegisterVerify} className="w-full px-4 py-2 mt-6 font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700">Verify & Create Account</button> </div> );
            case 'register':
                return (
                    <div>
                        <h2 className="text-3xl font-bold text-center text-gray-800">Create Account</h2>
                        <div className="mt-6 space-y-4">
                            <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} className="w-full px-4 py-2 border rounded-md" required />
                            <input type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-2 border rounded-md" required />
                            <div>
                                <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-2 border rounded-md" required />
                                <p className="text-xs text-gray-500 mt-1">Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char.</p>
                            </div>
                            <input type="password" placeholder="Confirm Password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full px-4 py-2 border rounded-md" required />
                            
                            {captcha && (
                                <div className="p-4 space-y-3 bg-gray-100 border rounded-md">
                                    <div className="flex items-center justify-center">
                                        <img src={captcha.image} alt="CAPTCHA" className="rounded" />
                                        <button onClick={fetchCaptcha} className="ml-4 p-2 text-gray-500 hover:text-gray-800" title="Get a new CAPTCHA"><svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h5M20 20v-5h-5M20 4h-5v5M4 20h5v-5" /></svg></button>
                                    </div>
                                    <input type="text" placeholder="Enter CAPTCHA" value={captchaAnswer} onChange={e => setCaptchaAnswer(e.target.value)} className="w-full px-4 py-2 text-center border rounded-md" />
                                </div>
                            )}
                            <fieldset className="pt-2"><legend className="text-sm font-medium text-gray-700">I am a:</legend><div className="flex items-center mt-2 space-x-6"><label className="flex items-center"><input type="radio" name="role" value="buyer" checked={role === 'buyer'} onChange={() => setRole('buyer')} className="w-4 h-4 text-blue-600 border-gray-300" /><span className="ml-2 text-sm text-gray-700">Buyer</span></label><label className="flex items-center"><input type="radio" name="role" value="seller" checked={role === 'seller'} onChange={() => setRole('seller')} className="w-4 h-4 text-blue-600 border-gray-300" /><span className="ml-2 text-sm text-gray-700">Seller</span></label></div></fieldset>
                        </div>
                        <button onClick={handleRegisterStart} className="w-full px-4 py-2 mt-6 font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700">Send Verification Code</button>
                        <p className="mt-4 text-sm text-center text-gray-600">Already have an account?{' '}<button onClick={() => setView('login')} className="font-medium text-blue-600 hover:underline">Login here</button></p>
                    </div>
                );
            case 'login':
            default:
                return (
                    <div> 
                        <h2 className="text-3xl font-bold text-center text-gray-800">Login</h2> 
                        <div className="mt-6 space-y-4"> 
                            <input type="text" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} className="w-full px-4 py-2 border rounded-md" /> 
                            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-2 border rounded-md" /> 
                            {captcha && (
                                <div className="p-4 space-y-3 bg-gray-100 border rounded-md">
                                    <div className="flex items-center justify-center">
                                        <img src={captcha.image} alt="CAPTCHA" className="rounded" />
                                        <button onClick={fetchCaptcha} className="ml-4 p-2 text-gray-500 hover:text-gray-800" title="Get a new CAPTCHA"><svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h5M20 20v-5h-5M20 4h-5v5M4 20h5v-5" /></svg></button>
                                    </div>
                                    <input type="text" placeholder="Enter CAPTCHA" value={captchaAnswer} onChange={e => setCaptchaAnswer(e.target.value)} className="w-full px-4 py-2 text-center border rounded-md" />
                                </div>
                            )}
                        </div> 
                        <button onClick={handleLogin} className="w-full px-4 py-2 mt-6 font-semibold text-white bg-green-600 rounded-md hover:bg-green-700">Login</button> 
                        <p className="mt-4 text-sm text-center text-gray-600">Don't have an account?{' '}<button onClick={() => setView('register')} className="font-medium text-blue-600 hover:underline">Register here</button></p> 
                    </div>
                );
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
                {error && <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg">{error}</div>}
                {message && !error && <div className="p-3 text-sm text-blue-700 bg-blue-100 rounded-lg">{message}</div>}
                {renderContent()}
            </div>
        </div>
    );
};
export default AuthPage;