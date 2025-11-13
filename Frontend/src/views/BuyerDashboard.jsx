import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, apiCall } from '../Auth';

const API_URLS = {
    PRODUCT: 'http://172.31.30.53:5002',
    INVENTORY: 'http://172.31.30.53:5003',
    CART: 'http://172.31.30.53:5004',
    ORDER: 'http://172.31.30.53:5005',
    WISHLIST: 'http://172.31.30.53:5006',
    REVIEW: 'http://172.31.30.53:5008',
};

const Toast = ({ message, type, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(onDismiss, 3000);
        return () => clearTimeout(timer);
    }, [onDismiss]);
    const bgColor = type === 'error' ? 'bg-ocean-coral' : 'bg-ocean-secondary';
    return <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 px-6 py-3 rounded-md text-white ${bgColor} shadow-lg z-50`}>{message}</div>;
};

const StarRating = ({ rating, count }) => {
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5 ? 1 : 0;
    const emptyStars = 5 - fullStars - halfStar;
    
    if (count === 0) {
        return <span className="text-xs text-ocean-text-muted">No reviews yet</span>;
    }

    return (
        <div className="flex items-center">
            {[...Array(fullStars)].map((_, i) => (
                <svg key={`full-${i}`} className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/></svg>
            ))}
            {halfStar > 0 && (
                <svg key="half" className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0v15z"/></svg>
            )}
            {[...Array(emptyStars)].map((_, i) => (
                <svg key={`empty-${i}`} className="w-4 h-4 text-ocean-accent" fill="currentColor" viewBox="0 0 20 20"><path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/></svg>
            ))}
            {count > 0 && (
                <span className="ml-1 text-xs text-ocean-text-muted">({count})</span>
            )}
        </div>
    );
};

const ProductCard = ({ product, isWishlisted, onAddToCart, onToggleWishlist, stockQuantity, ratingData, onViewReviews }) => {
    const isOutOfStock = stockQuantity <= 0;
    const hasReviews = ratingData && ratingData.reviewCount > 0;

    return (
        <div className="flex flex-col bg-ocean-surface border border-ocean-accent/30 rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
            <div className="relative">
                {isOutOfStock && (
                    <div className="absolute top-2 left-2 bg-ocean-coral text-white text-xs font-bold px-2 py-1 rounded-md z-10">
                        OUT OF STOCK
                    </div>
                )}
                <img src={`https://placehold.co/400x300/bbe1fa/1b262c?text=${product.name.replace(/\s/g, '+')}`} alt={product.name} className="object-cover w-full h-48" />
                <button onClick={() => onToggleWishlist(product.id, isWishlisted)} className={`absolute top-2 right-2 p-2 rounded-full transition-colors ${isWishlisted ? 'text-ocean-coral bg-red-50' : 'text-ocean-text-muted bg-white/90 hover:text-ocean-coral'}`}>
                    <svg className="w-6 h-6" fill={isWishlisted ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.5l1.318-1.182a4.5 4.5 0 116.364 6.364L12 18.75l-7.682-7.682a4.5 4.5 0 010-6.364z"></path></svg>
                </button>
            </div>
            <div className="flex flex-col flex-grow p-4">
                <h3 className="text-xl font-bold text-ocean-primary">{product.name}</h3>
                <button 
                    onClick={onViewReviews} 
                    className="my-1 text-left cursor-pointer disabled:cursor-default" 
                    disabled={!hasReviews}
                >
                    <StarRating rating={ratingData?.averageRating || 0} count={ratingData?.reviewCount || 0} />
                </button>
                <p className="flex-grow my-2 text-ocean-text-muted">{product.description}</p>
                <p className="text-2xl font-bold text-ocean-secondary">${product.price.toFixed(2)}</p>
                <button 
                    onClick={() => onAddToCart(product.id)} 
                    className="w-full px-4 py-2 mt-4 font-bold text-white bg-ocean-secondary rounded-md hover:bg-ocean-secondary-hover disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    disabled={isOutOfStock}
                >
                    {isOutOfStock ? "Out of Stock" : "Add to Cart"}
                </button>
            </div>
        </div>
    );
};


const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
        return () => { clearTimeout(handler); };
    }, [value, delay]);
    return debouncedValue;
};

const ReviewModal = ({ item, onClose, showToast }) => {
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState("");
    const [isEligible, setIsEligible] = useState(false);
    const [eligibilityChecked, setEligibilityChecked] = useState(false);
    const [eligibilityMessage, setEligibilityMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const checkEligibility = async () => {
            try {
                const result = await apiCall(`${API_URLS.REVIEW}/reviews/check_eligibility`, {
                    method: 'POST',
                    body: JSON.stringify({ product_id: item.product_id })
                });
                setIsEligible(result.data.eligible);
                setEligibilityMessage(result.data.message || "");
            } catch (error) {
                setIsEligible(false);
                setEligibilityMessage(error.message || "Could not check eligibility.");
            } finally {
                setEligibilityChecked(true);
            }
        };
        checkEligibility();
    }, [item.product_id]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (rating === 0 || comment.trim() === "") {
            showToast("Please provide a rating and a comment.", "error");
            return;
        }
        setIsSubmitting(true);
        try {
            await apiCall(`${API_URLS.REVIEW}/reviews`, {
                method: 'POST',
                body: JSON.stringify({
                    product_id: item.product_id,
                    rating: rating,
                    comment: comment
                })
            });
            showToast("Review submitted for approval!");
            onClose();
        } catch (error) {
            showToast(error.message, "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="w-full max-w-lg p-6 bg-ocean-surface rounded-lg shadow-xl">
                <h2 className="text-2xl font-bold mb-4 text-ocean-primary">Leave a Review for {item.name}</h2>
                
                {!eligibilityChecked ? (
                    <p>Checking eligibility...</p>
                ) : isEligible ? (
                    <form onSubmit={handleSubmit}>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-ocean-text">Your Rating</label>
                            <div className="flex space-x-1 mt-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                        type="button"
                                        key={star}
                                        onClick={() => setRating(star)}
                                        className="focus:outline-none"
                                    >
                                        <svg className={`w-8 h-8 ${rating >= star ? 'text-yellow-400' : 'text-ocean-accent'}`} fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                                        </svg>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="mb-4">
                            <label htmlFor="comment" className="block text-sm font-medium text-ocean-text">Your Comment</label>
                            <textarea
                                id="comment"
                                rows="4"
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                className="w-full p-2 mt-1 border border-ocean-accent/50 rounded-md outline-none focus:ring-2 focus:ring-ocean-secondary"
                                placeholder="What did you like or dislike?"
                            ></textarea>
                        </div>
                        <div className="flex justify-end space-x-2">
                            <button type="button" onClick={onClose} className="px-4 py-2 text-ocean-text bg-ocean-light/50 rounded-md hover:bg-ocean-accent/30 transition-colors">
                                Cancel
                            </button>
                            <button type="submit" disabled={isSubmitting} className="px-4 py-2 font-bold text-white bg-ocean-secondary rounded-md hover:bg-ocean-secondary-hover disabled:bg-gray-400 transition-colors">
                                {isSubmitting ? "Submitting..." : "Submit Review"}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div>
                        <p className="text-ocean-coral">{eligibilityMessage}</p>
                        <button type="button" onClick={onClose} className="w-full px-4 py-2 mt-4 text-ocean-text bg-ocean-light/50 rounded-md hover:bg-ocean-accent/30 transition-colors">
                            Close
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

const ViewReviewsModal = ({ productId, onClose }) => {
    const [reviews, setReviews] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchReviews = async () => {
            if (!productId) return;
            setIsLoading(true);
            try {
                const result = await apiCall(`${API_URLS.REVIEW}/reviews/${productId}`);
                setReviews(result.data);
            } catch (err) {
                setError(err.message || "Failed to load reviews.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchReviews();
    }, [productId]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="w-full max-w-lg p-6 bg-ocean-surface rounded-lg shadow-xl max-h-[80vh] overflow-y-auto">
                <h2 className="text-2xl font-bold mb-4 text-ocean-primary">Product Reviews</h2>
                {isLoading ? (
                    <p>Loading reviews...</p>
                ) : error ? (
                    <p className="text-ocean-coral">{error}</p>
                ) : reviews.length === 0 ? (
                    <p>No approved reviews for this product yet.</p>
                ) : (
                    <div className="space-y-4">
                        {reviews.map((review) => (
                            <div key={review.review_id} className="p-3 border border-ocean-accent/20 rounded-md bg-ocean-light/50">
                                <div className="flex justify-between items-center">
                                    <p className="font-semibold text-ocean-primary">{review.user_id}</p>
                                    <StarRating rating={review.rating} count={-1} />
                                </div>
                                <p className="mt-2 text-ocean-text">{review.comment}</p>
                            </div>
                        ))}
                    </div>
                )}
                <button type="button" onClick={onClose} className="w-full px-4 py-2 mt-6 text-ocean-text bg-ocean-light/50 rounded-md hover:bg-ocean-accent/30 transition-colors">
                    Close
                </button>
            </div>
        </div>
    );
};

export const BuyerDashboard = () => {
    const { user, logout } = useAuth();
    const [products, setProducts] = useState([]);
    const [wishlist, setWishlist] = useState([]);
    const [cart, setCart] = useState([]);
    const [orders, setOrders] = useState([]);
    const [inventory, setInventory] = useState({});
    const [ratings, setRatings] = useState({});
    const [reviewModalItem, setReviewModalItem] = useState(null);
    const [viewingReviewsFor, setViewingReviewsFor] = useState(null);
    const [currentView, setCurrentView] = useState('shop');
    const [productDetails, setProductDetails] = useState({});
    const [toast, setToast] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 500);

    const [isLoading, setIsLoading] = useState(false);
    const [paymentError, setPaymentError] = useState(null);

    const showToast = (message, type = 'success') => setToast({ message, type });

    const ensureProductDetails = useCallback(async (productIds) => {
        const missingIds = productIds.filter(id => !productDetails[id]);
        if (missingIds.length === 0) return;
        try {
            const detailPromises = missingIds.map(id => apiCall(`${API_URLS.PRODUCT}/products/${id}`));
            const detailsResults = await Promise.all(detailPromises);
            const newDetails = detailsResults.reduce((acc, result) => {
                const detail = result.data;
                if (detail && detail.id) acc[detail.id] = detail;
                return acc;
            }, {});
            setProductDetails(prev => ({ ...prev, ...newDetails }));
        } catch (error) {
            showToast("Could not load some product details.", "error");
        }
    }, [productDetails]);

    const fetchAllData = useCallback(async () => {
        try {
            const results = await Promise.allSettled([
                apiCall(`${API_URLS.PRODUCT}/products`),
                apiCall(`${API_URLS.CART}/cart/${user.name}`),
                apiCall(`${API_URLS.WISHLIST}/wishlist/${user.name}`),
                apiCall(`${API_URLS.INVENTORY}/inventory`),
            ]);
            
            const productsData = results[0].status === 'fulfilled' ? results[0].value.data : [];
            const cartData = results[1].status === 'fulfilled' ? results[1].value.data : [];
            const wishlistData = results[2].status === 'fulfilled' ? results[2].value.data : [];
            const inventoryData = results[3].status === 'fulfilled' ? results[3].value.data : [];
            
            if (results[0].status === 'rejected') showToast('Could not load products.', 'error');
            if (results[1].status === 'rejected') showToast('Could not load cart.', 'error');
            if (results[2].status === 'rejected') showToast('Wishlist service is unavailable.', 'error');
            if (results[3].status === 'rejected') showToast('Could not load stock levels.', 'error');

            setProducts(productsData);
            setCart(cartData);
            setWishlist(wishlistData);
            
            const inventoryMap = inventoryData.reduce((acc, item) => {
                acc[item.product_id] = item.quantity;
                return acc;
            }, {});
            setInventory(inventoryMap);

            const initialDetails = productsData.reduce((acc, p) => {
                acc[p.id] = p;
                return acc;
            }, {});
            setProductDetails(initialDetails);

        } catch (error) {
            showToast(error.message, 'error');
        }
    }, [user.name]);
    
    useEffect(() => {
        const searchProducts = async () => {
            if (debouncedSearchQuery) {
                try {
                    const result = await apiCall(`${API_URLS.PRODUCT}/products/search?q=${debouncedSearchQuery}`);
                    setProducts(result.data);
                } catch (error) {
                    showToast(error.message, 'error');
                }
            } else if (searchQuery === '') {
                apiCall(`${API_URLS.PRODUCT}/products`).then(result => setProducts(result.data)).catch(err => showToast(err.message, 'error'));
            }
        };
        searchProducts();
    }, [debouncedSearchQuery, searchQuery]);

    useEffect(() => {
        if (user) fetchAllData();
    }, [user, fetchAllData]);
    
    useEffect(() => {
        if (products.length > 0) {
            const fetchAllRatings = async () => {
                const ratingPromises = products.map(p => 
                    apiCall(`${API_URLS.REVIEW}/reviews/average/${p.id}`)
                );
                const results = await Promise.allSettled(ratingPromises);
                const ratingsMap = results.reduce((acc, result) => {
                    if (result.status === 'fulfilled' && result.value.data) {
                        const data = result.value.data;
                        acc[data.product_id] = {
                            averageRating: data.averageRating,
                            reviewCount: data.reviewCount
                        };
                    }
                    return acc;
                }, {});
                setRatings(ratingsMap);
            };
            fetchAllRatings();
        }
    }, [products]);

    const handleUpdateCart = async (productId, quantity) => {
        if (quantity > 0) {
            const currentStock = inventory[productId] ?? 0;
            const itemInCart = cart.find(item => item.product_id === productId);
            const cartQuantity = itemInCart ? itemInCart.quantity : 0;
            
            if (cartQuantity + quantity > currentStock) {
                showToast("Cannot add more than available stock.", "error");
                return;
            }
        }

        const endpoint = quantity > 0 ? 'add' : 'remove';
        try {
            await apiCall(`${API_URLS.CART}/cart/${user.name}/${endpoint}`, {
                method: 'POST', body: JSON.stringify({ product_id: productId, quantity: 1 })
            });
            setCart(prev => {
                const item = prev.find(i => i.product_id === productId);
                if (!item) return quantity > 0 ? [...prev, {product_id: productId, quantity: 1}] : prev;
                const newQuantity = item.quantity + quantity;
                if (newQuantity <= 0) return prev.filter(i => i.product_id !== productId);
                return prev.map(i => i.product_id === productId ? {...i, quantity: newQuantity} : i);
            });
            ensureProductDetails([productId]);
            showToast("Cart updated!");
        } catch (error) { showToast(error.message, 'error'); }
    };

    const handleToggleWishlist = async (productId, isWishlisted) => {
        const endpoint = isWishlisted ? 'remove' : 'add';
        try {
            await apiCall(`${API_URLS.WISHLIST}/wishlist/${user.name}/${endpoint}`, {
                method: 'POST', body: JSON.stringify({ product_id: productId })
            });
            setWishlist(prev => isWishlisted ? prev.filter(id => id !== productId) : [...prev, productId]);
            showToast(isWishlisted ? "Removed from wishlist" : "Added to wishlist!");
        } catch (error) { showToast(error.message, 'error'); }
    };
    
    const handleViewOrders = async () => {
         try {
            const result = await apiCall(`${API_URLS.ORDER}/orders/${user.name}`);
            setOrders(result.data);
            setCurrentView('orders');
        } catch (error) { showToast(error.message, 'error'); }
    };
    
    const handlePaymentSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setPaymentError(null);

        try {
            const result = await apiCall(`${API_URLS.ORDER}/orders/create`, { method: 'POST' });
            
            showToast(`Order placed! Order ID: ${result.data.order_id}`);
            setCart([]);
            fetchAllData(); 
            setCurrentView('shop');

        } catch(error) {
            let friendlyError = "An unknown payment error occurred. Please try again.";
            
            if (error.message.includes("insufficient_funds")) {
                friendlyError = "Your card was declined due to insufficient funds.";
            } else if (error.message.includes("card_declined")) {
                friendlyError = "Your card was declined by the bank. Please try another card.";
            } else if (error.message.includes("bank_unavailable")) {
                friendlyError = "The payment gateway is temporarily unavailable. Please try again later.";
            } else if (error.message.includes("Payment service unavailable")) {
                 friendlyError = "The payment service is down. Please contact support.";
            } else if (error.message.includes("Insufficient stock") || error.message.includes("out of stock")) {
                 friendlyError = "One or more items in your cart went out of stock. Please review your cart.";
                 fetchAllData(); 
                 setCurrentView('cart'); 
            } else if (error.message) {
                friendlyError = error.message;
            }
            
            setPaymentError(friendlyError);
        } finally {
            setIsLoading(false);
        }
    };

    const cartCount = cart.reduce((count, item) => count + item.quantity, 0);
    const cartTotal = cart.reduce((total, item) => total + ((productDetails[item.product_id]?.price || 0) * item.quantity), 0);
    
    const invalidCartItems = cart.filter(item => (inventory[item.product_id] ?? 0) < item.quantity);
    const isCartValid = invalidCartItems.length === 0 && cart.length > 0;

    useEffect(() => {
        if (currentView === 'cart') ensureProductDetails(cart.map(item => item.product_id));
        if (currentView === 'wishlist') ensureProductDetails(wishlist);
    }, [currentView, cart, wishlist, ensureProductDetails]);

    return (
        <div className="min-h-screen bg-ocean-light">
             <header className="sticky top-0 z-50 bg-ocean-primary shadow-md">
                <nav className="container flex items-center justify-between p-4 mx-auto">
                    <h1 
                        className="text-3xl font-bold text-white cursor-pointer flex items-center gap-2"
                        onClick={() => setCurrentView('shop')}
                    >
                        <span>🌊</span> Micro-Shop
                    </h1>
                    <div className="flex items-center space-x-4">
                        <span className="hidden sm:inline text-ocean-accent">Welcome, {user.name}!</span>
                        <button onClick={() => setCurrentView('wishlist')} className="px-4 py-2 font-bold text-white bg-ocean-coral rounded-md hover:bg-ocean-coral-hover transition-colors">Wishlist</button>
                        <button onClick={() => setCurrentView('cart')} className="relative px-4 py-2 font-bold text-white bg-ocean-secondary rounded-md hover:bg-ocean-secondary-hover transition-colors">
                            Cart <span className="absolute top-0 right-0 px-2 py-1 text-xs font-bold text-ocean-primary bg-ocean-accent rounded-full -mt-2 -mr-2">{cartCount}</span>
                        </button>
                        <button onClick={handleViewOrders} className="px-4 py-2 font-bold text-white border border-ocean-accent rounded-md hover:bg-ocean-secondary transition-colors">Orders</button>
                        <button onClick={logout} className="px-4 py-2 font-bold text-white bg-transparent border border-ocean-coral text-ocean-coral rounded-md hover:bg-ocean-coral hover:text-white transition-colors">Logout</button>
                    </div>
                </nav>
            </header>
            <main className="container p-4 mx-auto">
                 {currentView === 'shop' && (
                    <div>
                        <div className="mb-6"><input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search for products..." className="w-full p-3 border border-ocean-accent/50 rounded-lg shadow-sm focus:ring-2 focus:ring-ocean-secondary outline-none" /></div>
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">{products.map(p => (
                            <ProductCard 
                                key={p.id} 
                                product={p} 
                                isWishlisted={wishlist.includes(p.id)} 
                                onAddToCart={() => handleUpdateCart(p.id, 1)} 
                                onToggleWishlist={handleToggleWishlist}
                                stockQuantity={inventory[p.id] ?? 0}
                                ratingData={ratings[p.id]}
                                onViewReviews={() => setViewingReviewsFor(p.id)}
                            />
                        ))}</div>
                    </div>
                 )}
                 {currentView === 'cart' && (
                    <div className="p-8 bg-ocean-surface rounded-lg shadow-xl border border-ocean-accent/20">
                        <h2 className="text-3xl font-bold mb-6 text-ocean-primary">Your Cart</h2>
                        {cart.length === 0 ? <p>Your cart is empty.</p> : (
                            <div>
                                {invalidCartItems.length > 0 && (
                                    <div className="p-3 my-4 text-sm text-center text-white bg-ocean-coral rounded-md">
                                        Some items in your cart are out of stock or have limited availability:
                                        <ul className="font-medium list-disc list-inside">
                                            {invalidCartItems.map(item => {
                                                const product = productDetails[item.product_id];
                                                const stock = inventory[item.product_id] ?? 0;
                                                return <li key={item.product_id}>{product?.name || item.product_id} (Only {stock} available)</li>;
                                            })}
                                        </ul>
                                    </div>
                                )}
                                {cart.map(item => {
                                    const product = productDetails[item.product_id];
                                    const stock = inventory[item.product_id] ?? 0;
                                    const isItemInvalid = item.quantity > stock;
                                    if (!product) return <div key={item.product_id} className="py-4 border-b border-ocean-accent/20">Loading item...</div>;
                                    return (
                                        <div key={item.product_id} className={`flex justify-between items-center py-4 border-b border-ocean-accent/20 ${isItemInvalid ? 'bg-red-50' : ''}`}>
                                            <div><p className="font-semibold text-ocean-primary">{product.name}</p><p className="text-ocean-text-muted">${product.price.toFixed(2)} each</p></div>
                                            <div className="flex items-center space-x-3">
                                                <button onClick={() => handleUpdateCart(item.product_id, -1)} className="px-2 py-1 border border-ocean-secondary text-ocean-secondary rounded-md hover:bg-ocean-light transition-colors">-</button>
                                                <span className="font-bold">{item.quantity}</span>
                                                <button onClick={() => handleUpdateCart(item.product_id, 1)} className="px-2 py-1 border border-ocean-secondary text-ocean-secondary rounded-md hover:bg-ocean-light transition-colors" disabled={item.quantity >= stock}>+</button>
                                            </div>
                                            <span className="font-bold text-ocean-secondary">${(product.price * item.quantity).toFixed(2)}</span>
                                        </div>
                                    );
                                })}
                                <div className="text-right mt-6">
                                    <p className="text-2xl font-bold text-ocean-primary">Total: ${cartTotal.toFixed(2)}</p>
                                    <button 
                                        onClick={() => {
                                            setPaymentError(null);
                                            setCurrentView('payment');
                                        }} 
                                        className="px-6 py-3 mt-4 font-bold text-white bg-ocean-primary rounded-md hover:bg-ocean-primary-hover disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                                        disabled={!isCartValid}
                                    >
                                        Proceed to Checkout
                                    </button>
                                </div>
                            </div>
                        )}
                        <button onClick={() => setCurrentView('shop')} className="mt-6 text-ocean-secondary hover:underline">Back to Shop</button>
                    </div>
                 )}
                 
                 {currentView === 'payment' && (
                    <div className="max-w-lg p-8 mx-auto bg-ocean-surface rounded-lg shadow-xl border border-ocean-accent/30">
                        <h2 className="mb-6 text-3xl font-bold text-center text-ocean-primary">Complete Your Payment</h2>
                        
                        <div className="p-4 mb-4 text-center bg-ocean-light rounded-lg border border-ocean-accent/20">
                            <p className="text-lg text-ocean-text-muted">Order Total</p>
                            <p className="text-4xl font-bold text-ocean-primary">${cartTotal.toFixed(2)}</p>
                        </div>
                        
                        <p className="mb-4 text-sm text-center text-ocean-text-muted">
                            (This is a mock payment form. The backend will randomly succeed or fail.)
                        </p>

                        <form onSubmit={handlePaymentSubmit} className="space-y-4">
                            <div>
                                <label htmlFor="cardNum" className="block text-sm font-medium text-ocean-text">Card Number</label>
                                <input id="cardNum" type="text" placeholder="1234 5678 9012 3456" className="w-full p-2 mt-1 border border-ocean-accent/50 rounded-md focus:ring-2 focus:ring-ocean-secondary outline-none" />
                            </div>
                            
                            <div className="flex space-x-4">
                                <div className="flex-1">
                                    <label htmlFor="expiry" className="block text-sm font-medium text-ocean-text">Expiry Date</label>
                                    <input id="expiry" type="text" placeholder="MM / YY" className="w-full p-2 mt-1 border border-ocean-accent/50 rounded-md focus:ring-2 focus:ring-ocean-secondary outline-none" />
                                </div>
                                <div className="flex-1">
                                    <label htmlFor="cvc" className="block text-sm font-medium text-ocean-text">CVC</label>
                                    <input id="cvc" type="text" placeholder="123" className="w-full p-2 mt-1 border border-ocean-accent/50 rounded-md focus:ring-2 focus:ring-ocean-secondary outline-none" />
                                </div>
                            </div>
                            
                            {paymentError && (
                                <div className="p-3 text-sm text-center text-white bg-ocean-coral rounded-md">
                                    {paymentError}
                                </div>
                            )}

                            <button type="submit" disabled={isLoading} className="w-full px-6 py-3 font-bold text-white bg-ocean-teal rounded-md hover:bg-ocean-teal-dark disabled:bg-gray-400 transition-colors">
                                {isLoading ? 'Processing Payment...' : `Pay $${cartTotal.toFixed(2)}`}
                            </button>
                        </form>

                        <button onClick={() => setCurrentView('cart')} className="w-full mt-4 text-center text-ocean-secondary hover:underline">
                            Back to Cart
                        </button>
                    </div>
                 )}
                 
                 {currentView === 'wishlist' && (
                     <div className="p-8">
                        <h2 className="text-3xl font-bold mb-6 text-ocean-primary">Your Wishlist</h2>
                         <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                            {wishlist.length === 0 ? <p className="col-span-full text-center text-ocean-text-muted">Your wishlist is empty.</p> : wishlist.map(productId => {
                                const product = productDetails[productId];
                                if (!product) return <div key={productId} className="p-4 text-center bg-ocean-surface rounded-lg shadow border border-ocean-accent/20">Loading...</div>;
                                return <ProductCard 
                                    key={productId} 
                                    product={product} 
                                    isWishlisted={true} 
                                    onAddToCart={() => handleUpdateCart(productId, 1)} 
                                    onToggleWishlist={handleToggleWishlist}
                                    stockQuantity={inventory[productId] ?? 0}
                                    ratingData={ratings[productId]}
                                    onViewReviews={() => setViewingReviewsFor(productId)}
                                />;
                            })}
                         </div>
                         <button onClick={() => setCurrentView('shop')} className="mt-6 text-ocean-secondary hover:underline">Back to Shop</button>
                     </div>
                 )}
                  {currentView === 'orders' && (
                     <div className="p-8 bg-ocean-surface rounded-lg shadow-xl border border-ocean-accent/20">
                         <h2 className="text-3xl font-bold mb-6 text-ocean-primary">Your Orders</h2>
                         <div className="space-y-4">
                         {orders.length === 0 ? <p>You have no past orders.</p> : orders.map(order => (
                              <div key={order.order_id} className="p-4 border border-ocean-accent/20 rounded-md">
                                <div className="flex justify-between items-center mb-2">
                                    <p className="font-bold text-ocean-text">Order ID: <span className="font-mono text-ocean-secondary">{order.order_id.substring(0,8)}...</span></p>
                                    <p className="text-sm text-ocean-text-muted">Date: {new Date(order.created_at).toLocaleDateString()}</p>
                                </div>
                                <p className="font-semibold text-ocean-text">Total: <span className="font-bold text-ocean-secondary">${order.total_price.toFixed(2)}</span></p>
                                <div className="mt-4 space-y-2">
                                    <h4 className="font-semibold text-ocean-text">Items:</h4>
                                    {order.items.map(item => (
                                        <div key={item.product_id} className="flex justify-between items-center p-2 bg-ocean-light/50 rounded">
                                            <span className="text-ocean-text-muted">{item.name} (x{item.quantity})</span>
                                            <button 
                                                onClick={() => setReviewModalItem(item)}
                                                className="px-2 py-1 text-sm font-medium text-white bg-ocean-secondary rounded-md hover:bg-ocean-secondary-hover"
                                            >
                                                Leave Review
                                            </button>
                                        </div>
                                    ))}
                                </div>
                              </div>
                         ))}
                         </div>
                          <button onClick={() => setCurrentView('shop')} className="mt-6 text-ocean-secondary hover:underline">Back to Shop</button>
                     </div>
                 )}
            </main>
            {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
            {reviewModalItem && (
                <ReviewModal
                    item={reviewModalItem}
                    onClose={() => setReviewModalItem(null)}
                    showToast={showToast}
                />
            )}
            {viewingReviewsFor && (
                <ViewReviewsModal
                    productId={viewingReviewsFor}
                    onClose={() => setViewingReviewsFor(null)}
                />
            )}
        </div>
    );
};