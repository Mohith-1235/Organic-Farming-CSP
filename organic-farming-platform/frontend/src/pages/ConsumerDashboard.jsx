import { useState, useEffect, useCallback } from 'react';
import PaymentGatewayModal from '../components/PaymentGatewayModal';
import ProductImage from '../components/ProductImage';

function ConsumerDashboard({ user, profile, onProfileUpdate }) {
  const [activeTab, setActiveTab] = useState('browse'); // 'browse', 'purchases', 'profile'
  const [browseMode, setBrowseMode] = useState('products'); // 'products', 'farms'
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentTotal, setPaymentTotal] = useState(0);
  const [paymentOrderId, setPaymentOrderId] = useState(null);
  const [pendingOrderPayload, setPendingOrderPayload] = useState(null);
  const [paymentFarmerPhone, setPaymentFarmerPhone] = useState('');
  const [cartFarmerPhone, setCartFarmerPhone] = useState('');
  const [selectedFarm, setSelectedFarm] = useState(null); // Farm detail view state
  const [paymentMethod, setPaymentMethod] = useState('cod'); // 'cod', 'upi', 'card'
  const [trackingOrder, setTrackingOrder] = useState(null); // Order to track
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  
  // Profile settings
  const [name, setName] = useState(profile?.name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [address, setAddress] = useState(profile?.delivery_address || '');
  const [alertPhone, setAlertPhone] = useState(profile?.phone || '');
  const [message, setMessage] = useState({ type: '', text: '' });

  // Catalog/Marketplace lists
  const [products, setProducts] = useState([]);
  const [farms, setFarms] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [purchases, setPurchases] = useState([]);

  // Cart Management
  const [cart, setCart] = useState([]); // { product, quantity }
  const [cartFarmerId, setCartFarmerId] = useState(null);
  const [cartFarmerName, setCartFarmerName] = useState('');
  const consumerId = profile?.id;

  const fetchProducts = useCallback(async () => {
    const params = new URLSearchParams({ category: categoryFilter });
    if (searchQuery.trim()) params.set('search', searchQuery.trim());

    try {
      const res = await fetch(`/api/consumer/products?${params.toString()}`);
      const data = await res.json();
      if (res.ok) setProducts(data);
    } catch (err) {
      console.error(err);
    }
  }, [categoryFilter, searchQuery]);

  const fetchFarms = useCallback(async () => {
    try {
      const res = await fetch('/api/consumer/farms');
      const data = await res.json();
      if (res.ok) setFarms(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchPurchases = useCallback(async () => {
    if (!consumerId) return;

    try {
      const res = await fetch(`/api/consumer/orders/${consumerId}`);
      const data = await res.json();
      if (res.ok) setPurchases(data);
    } catch (err) {
      console.error(err);
    }
  }, [consumerId]);

  useEffect(() => {
    const loadDashboardId = setTimeout(() => {
      fetchProducts();
      fetchFarms();
      fetchPurchases();
    }, 0);

    return () => clearTimeout(loadDashboardId);
  }, [fetchProducts, fetchFarms, fetchPurchases]);

  useEffect(() => {
    if (profile?.phone) {
      setAlertPhone(profile.phone);
    }
  }, [profile?.phone]);

  // Profile update
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    try {
      const res = await fetch(`/api/consumer/profile/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, delivery_address: address })
      });
      const data = await res.json();
      if (res.ok) {
        onProfileUpdate(data);
        setMessage({ type: 'success', text: 'Delivery profile updated successfully!' });
      } else {
        setMessage({ type: 'danger', text: data.error || 'Failed to update profile' });
      }
    } catch (err) {
      console.error('Error updating consumer profile:', err);
      setMessage({ type: 'danger', text: 'Server error updating profile' });
    }
  };

  // View specific farm page (Integration)
  const viewFarmPage = async (farmId) => {
    try {
      const res = await fetch(`/api/consumer/farms/${farmId}`);
      const data = await res.json();
      if (res.ok) {
        setSelectedFarm({
          farm: data.farm,
          products: data.products
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Cart operations
  const addToCart = (product, farmerId, farmName, farmerPhone) => {
    if (!profile?.delivery_address || profile?.delivery_address === 'Unknown') {
      alert('Please update your delivery address in your Profile tab before purchasing.');
      setActiveTab('profile');
      return;
    }

    if (cartFarmerId !== null && cartFarmerId !== farmerId) {
      const confirmClear = confirm(`Your cart contains products from "${cartFarmerName}". Adding this item will clear your current cart. Continue?`);
      if (!confirmClear) return;
      setCart([{ product, quantity: 1 }]);
      setCartFarmerId(farmerId);
      setCartFarmerName(farmName);
      setCartFarmerPhone(farmerPhone || '');
    } else {
      setCartFarmerId(farmerId);
      setCartFarmerName(farmName);
      setCartFarmerPhone(farmerPhone || '');
      const existing = cart.find(item => item.product.id === product.id);
      if (existing) {
        setCart(cart.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        ));
      } else {
        setCart([...cart, { product, quantity: 1 }]);
      }
    }
  };

  const updateCartQty = (productId, change) => {
    const updated = cart.map(item => {
      if (item.product.id === productId) {
        const newQty = item.quantity + change;
        return newQty > 0 ? { ...item, quantity: newQty } : null;
      }
      return item;
    }).filter(Boolean);

    setCart(updated);
    if (updated.length === 0) {
      setCartFarmerId(null);
      setCartFarmerName('');
      setCartFarmerPhone('');
    }
  };

  const getCartTotal = () => {
    return cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  };

  // Checkout order
  const handleCheckout = async () => {
    if (cart.length === 0) return;

    if (paymentMethod === 'cod') {
      try {
        const itemsPayload = cart.map(item => ({
          productId: item.product.id,
          quantity: item.quantity,
          price: item.product.price
        }));

        const res = await fetch('/api/consumer/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consumer_id: profile.id,
            farmer_id: cartFarmerId,
            items: itemsPayload,
            total_price: getCartTotal(),
            payment_method: 'cod',
            phone: alertPhone
          })
        });

        const data = await res.json();
        if (res.ok) {
          alert('Order placed successfully! The farmer will be notified.');
          setCart([]);
          setCartFarmerId(null);
          setCartFarmerName('');
          setCartFarmerPhone('');
          fetchPurchases();
          setActiveTab('purchases');
        } else {
          alert(data.error || 'Failed to place order');
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      // Open Payment Gateway for UPI or Card
      const itemsPayload = cart.map(item => ({
        productId: item.product.id,
        quantity: item.quantity,
        price: item.product.price
      }));

      setPendingOrderPayload({
        consumer_id: profile.id,
        farmer_id: cartFarmerId,
        items: itemsPayload,
        total_price: getCartTotal(),
        phone: alertPhone
      });

      setPaymentTotal(getCartTotal());
      setPaymentOrderId(null);
      setPaymentFarmerPhone(cartFarmerPhone);
      setShowPaymentModal(true);
    }
  };

  const handlePaymentSuccess = async (method) => {
    setShowPaymentModal(false);

    if (paymentOrderId) {
      // Paying for existing pending order
      try {
        const res = await fetch(`/api/consumer/order/${paymentOrderId}/pay`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment_method: method })
        });
        const data = await res.json();
        if (res.ok) {
          alert(`Payment of ₹${paymentTotal} verified successfully via ${method.toUpperCase()}! Your order is now marked as Paid.`);
          fetchPurchases();
        } else {
          alert(data.error || 'Failed to verify online payment');
        }
      } catch (err) {
        console.error(err);
        alert('Server error updating payment status');
      } finally {
        setPaymentOrderId(null);
      }
    } else if (pendingOrderPayload) {
      // Placing new paid order
      try {
        const res = await fetch('/api/consumer/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...pendingOrderPayload,
            payment_method: method
          })
        });

        const data = await res.json();
        if (res.ok) {
          alert(`Payment verified! Order placed successfully. The farmer has been notified of your online payment.`);
          setCart([]);
          setCartFarmerId(null);
          setCartFarmerName('');
          setCartFarmerPhone('');
          fetchPurchases();
          setActiveTab('purchases');
        } else {
          alert(data.error || 'Failed to place paid order');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setPendingOrderPayload(null);
      }
    }
  };

  const triggerPayLater = (order) => {
    setPaymentOrderId(order.id);
    setPaymentTotal(order.total_price);
    setPendingOrderPayload(null);
    setPaymentFarmerPhone(order.farmer_phone || '');
    setPaymentMethod('upi'); // default to UPI inside gateway
    setShowPaymentModal(true);
  };

  return (
    <div className="container fade-in" style={{ padding: '40px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
        <h2>Organic Food Marketplace</h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            className={`btn ${activeTab === 'browse' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => { setActiveTab('browse'); setSelectedFarm(null); }}
          >
            🏪 Browse Stores
          </button>
          <button 
            className={`btn ${activeTab === 'purchases' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('purchases')}
          >
            🧾 My Orders
          </button>
          <button 
            className={`btn ${activeTab === 'profile' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveTab('profile')}
          >
            👤 Delivery Address
          </button>
        </div>
      </div>

      {message.text && (
        <div className={`alert alert-${message.type}`}>
          {message.text}
        </div>
      )}

      {/* VIEW 1: BROWSE STORES & PRODUCTS */}
      {activeTab === 'browse' && (
        <div className="marketplace-grid">
          {/* Marketplace Content */}
          <div>
            {!selectedFarm ? (
              // GLOBAL SEARCH LIST
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div className="auth-tabs" style={{ margin: 0 }}>
                    <div 
                      className={`auth-tab ${browseMode === 'products' ? 'active' : ''}`}
                      onClick={() => setBrowseMode('products')}
                      style={{ padding: '6px 16px', fontSize: '13px' }}
                    >
                      Browse Produce
                    </div>
                    <div 
                      className={`auth-tab ${browseMode === 'farms' ? 'active' : ''}`}
                      onClick={() => setBrowseMode('farms')}
                      style={{ padding: '6px 16px', fontSize: '13px' }}
                    >
                      Browse Farm Stores
                    </div>
                  </div>

                  {browseMode === 'products' && (
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <select 
                        className="form-control" 
                        value={categoryFilter} 
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        style={{ padding: '8px 12px', fontSize: '13px', width: '130px' }}
                      >
                        <option value="All">All Categories</option>
                        <option value="Vegetables">Vegetables</option>
                        <option value="Fruits">Fruits</option>
                        <option value="Pulses">Pulses</option>
                        <option value="Grains">Grains</option>
                      </select>
                      <input 
                        type="text" 
                        className="form-control"
                        placeholder="Search product..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyUp={(e) => e.key === 'Enter' && fetchProducts()}
                        style={{ padding: '8px 12px', fontSize: '13px', width: '200px' }}
                      />
                      <button className="btn btn-primary btn-sm" onClick={fetchProducts}>Go</button>
                    </div>
                  )}
                </div>

                {browseMode === 'products' ? (
                  /* PRODUCT LIST */
                  products.length === 0 ? (
                    <div style={{ padding: '40px', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                      No organic products listed matching filter.
                    </div>
                  ) : (
                    <div className="card-grid">
                      {products.map(p => (
                        <div key={p.id} className="card fade-in">
                          <ProductImage product={p} showImage={false} />
                          <div className="card-body">
                            <div className="card-title-group">
                              <h4 className="card-title">{p.name}</h4>
                              <p className="card-desc">{p.description}</p>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => viewFarmPage(p.farmer_id)}>
                                🏡 From: {p.farm_name} ({p.farm_location})
                              </span>
                            </div>
                            
                            <div className="card-price-row">
                              <span className="card-price">
                                ₹{p.price} <span>/ {p.unit}</span>
                              </span>
                            </div>

                            <button 
                              className="btn btn-primary btn-sm btn-block"
                              onClick={() => addToCart(p, p.farmer_id, p.farm_name, p.farmer_phone)}
                            >
                              🛒 Add to Cart
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  /* FARM LIST */
                  farms.length === 0 ? (
                    <div style={{ padding: '40px', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                      No farms registered.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {farms.map(f => (
                        <div key={f.id} className="farm-card fade-in" onClick={() => viewFarmPage(f.id)}>
                          <div className="farm-avatar">🌾</div>
                          <div className="farm-info" style={{ flexGrow: 1 }}>
                            <h4>{f.farm_name}</h4>
                            <p>📍 Location: <strong>{f.location}</strong></p>
                            <p style={{ marginTop: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>{f.farm_details}</p>
                          </div>
                          <button className="btn btn-secondary btn-sm">
                            Visit Store
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            ) : (
              /* DEDICATED FARM SHOP PAGE (Farmer ↔ Consumer Access Integration) */
              <div>
                <button className="btn btn-outline btn-sm" style={{ marginBottom: '20px' }} onClick={() => setSelectedFarm(null)}>
                  ← Back to Marketplace
                </button>
                
                <div className="profile-card fade-in" style={{ background: 'linear-gradient(to right, #ffffff, #fcfefe)' }}>
                  <h3 style={{ fontSize: '24px', color: 'var(--primary)', marginBottom: '8px' }}>🌾 {selectedFarm.farm.farm_name}</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>📍 Location: <strong>{selectedFarm.farm.location}</strong></p>
                  <p style={{ fontSize: '14px', lineHeight: '1.6' }}>{selectedFarm.farm.farm_details}</p>
                </div>

                <h3 style={{ marginBottom: '20px' }}>Farm Fresh Products</h3>
                {selectedFarm.products.length === 0 ? (
                  <div style={{ padding: '30px', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    This farm is currently restocking. No products listed today.
                  </div>
                ) : (
                  <div className="card-grid">
                    {selectedFarm.products.map(p => (
                      <div key={p.id} className="card fade-in">
                        <ProductImage product={p} showImage={false} />
                        <div className="card-body">
                          <div className="card-title-group">
                            <h4 className="card-title">{p.name}</h4>
                            <p className="card-desc">{p.description}</p>
                          </div>
                          
                          <div className="card-price-row">
                            <span className="card-price">
                              ₹{p.price} <span>/ {p.unit}</span>
                            </span>
                          </div>

                          <button 
                            className="btn btn-primary btn-sm btn-block"
                            onClick={() => addToCart(p, selectedFarm.farm.id, selectedFarm.farm.farm_name, selectedFarm.farm.phone)}
                          >
                            🛒 Add to Cart
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cart Sidebar Panel */}
          <div className="cart-panel fade-in">
            <div className="cart-title">
              <h4>🛒 Shopping Basket</h4>
              {cartFarmerName && <span style={{ fontSize: '11px', color: 'var(--success)' }}>from {cartFarmerName}</span>}
            </div>

            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                Basket is empty.<br />Add farm products to purchase.
              </div>
            ) : (
              <div>
                <div className="cart-items">
                  {cart.map(item => (
                    <div key={item.product.id} className="cart-item">
                      <div className="cart-item-info">
                        <span className="cart-item-name">{item.product.name}</span>
                        <span className="cart-item-qty">
                          ₹{item.product.price}/{item.product.unit} × {item.quantity}
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn btn-outline btn-sm" style={{ padding: '2px 8px' }} onClick={() => updateCartQty(item.product.id, -1)}>-</button>
                          <button className="btn btn-outline btn-sm" style={{ padding: '2px 8px' }} onClick={() => updateCartQty(item.product.id, 1)}>+</button>
                        </div>
                        <span className="cart-item-price">₹{item.product.price * item.quantity}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Notification Phone Input */}
                <div style={{ margin: '16px 0', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    📱 Alert Phone Number
                  </label>
                  <input 
                    type="text" 
                    className="form-control"
                    placeholder="e.g. +91 99999 88888"
                    value={alertPhone}
                    onChange={(e) => setAlertPhone(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', fontSize: '13px' }}
                    required
                  />
                </div>

                <div className="payment-selector">
                  <label>Select Payment Method</label>
                  <div className="payment-grid">
                    <div 
                      className={`payment-card ${paymentMethod === 'cod' ? 'active' : ''}`}
                      onClick={() => setPaymentMethod('cod')}
                    >
                      <span className="payment-icon">💵</span>
                      <span>COD</span>
                    </div>
                    <div 
                      className={`payment-card ${paymentMethod === 'upi' ? 'active' : ''}`}
                      onClick={() => setPaymentMethod('upi')}
                    >
                      <span className="payment-icon">📱</span>
                      <span>UPI</span>
                    </div>
                    <div 
                      className={`payment-card ${paymentMethod === 'card' ? 'active' : ''}`}
                      onClick={() => setPaymentMethod('card')}
                    >
                      <span className="payment-icon">💳</span>
                      <span>Card</span>
                    </div>
                  </div>
                </div>

                <div className="cart-total-row">
                  <span>Grand Total:</span>
                  <span>₹{getCartTotal()}</span>
                </div>

                <button 
                  className="btn btn-primary btn-block"
                  onClick={handleCheckout}
                >
                  🚀 Place Order ({paymentMethod.toUpperCase()})
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: PURCHASE ORDER HISTORY */}
      {activeTab === 'purchases' && (
        <div>
          <h3 style={{ marginBottom: '20px' }}>Your Organic Purchases</h3>
          
          {purchases.length === 0 ? (
            <div style={{ padding: '40px', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)' }}>You haven't purchased anything yet.</p>
              <button className="btn btn-outline" style={{ marginTop: '12px' }} onClick={() => setActiveTab('browse')}>
                Go to Marketplace
              </button>
            </div>
          ) : (
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Seller Farm</th>
                    <th>Items Bought</th>
                    <th>Total Price Paid</th>
                    <th>Payment Details</th>
                    <th>Purchase Date</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map(p => (
                    <tr key={p.id}>
                      <td>#200{p.id}</td>
                      <td>
                        <strong>{p.farm_name}</strong>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>📍 Location: {p.farm_location}</div>
                      </td>
                      <td>
                        <ul className="order-items-list">
                          {p.items?.map((item, idx) => (
                            <li key={idx}>
                              • {item.product_name} ({item.quantity} {item.unit})
                            </li>
                          ))}
                        </ul>
                      </td>
                       <td><strong>₹{p.total_price}</strong></td>
                      <td>
                        <div style={{ textTransform: 'uppercase', fontWeight: 750, fontSize: '12px', color: 'var(--primary)' }}>
                          {p.payment_method === 'cod' ? '💵 COD' : p.payment_method === 'upi' ? '📱 UPI' : '💳 CARD'}
                        </div>
                        <div style={{ fontSize: '11px', color: p.payment_status === 'paid' ? 'var(--success)' : 'var(--warning)', fontWeight: 700 }}>
                          {p.payment_status === 'paid' ? 'Paid' : 'Pending'}
                        </div>
                      </td>
                      <td>{new Date(p.order_date).toLocaleDateString()}</td>
                      <td>
                        <span className={`status-pill status-${p.status}`}>{p.status}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <button 
                            className="btn btn-outline btn-sm"
                            style={{ display: 'flex', gap: '6px', alignItems: 'center', fontWeight: 'bold', justifyContent: 'center' }}
                            onClick={() => { setTrackingOrder(p); setShowTrackingModal(true); }}
                          >
                            🔍 Track
                          </button>
                          {p.payment_status !== 'paid' && p.status !== 'cancelled' && (
                            <button 
                              className="btn-pay-now btn-sm"
                              onClick={() => triggerPayLater(p)}
                              style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'center' }}
                            >
                              💳 Pay Now
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: PROFILE / DELIVERY INFO SETUP */}
      {activeTab === 'profile' && (
        <div className="profile-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h3 style={{ marginBottom: '20px', fontSize: '18px' }}>👤 Shipping Details</h3>
          <form onSubmit={handleProfileSubmit}>
            <div className="form-group">
              <label>Consumer Name</label>
              <input 
                type="text" 
                className="form-control" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                required 
              />
            </div>

            <div className="form-group">
              <label>Phone Number</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="e.g. +91 98888 77777"
                value={phone} 
                onChange={(e) => setPhone(e.target.value)} 
                required 
              />
            </div>

            <div className="form-group">
              <label>Delivery Address</label>
              <textarea 
                className="form-control" 
                rows="4"
                placeholder="Specify your door number, street, locality, and city..."
                value={address} 
                onChange={(e) => setAddress(e.target.value)} 
                required 
              ></textarea>
            </div>

            <button type="submit" className="btn btn-primary">
              Save Delivery Address
            </button>
          </form>
        </div>
      )}

      {/* ORDER TRACKING TIMELINE MODAL */}
      {showTrackingModal && trackingOrder && (
        <div className="modal-overlay">
          <div className="modal-content fade-in" style={{ maxWidth: '480px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>📦 Order Tracking Timeline</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Order Ref: <strong>#200{trackingOrder.id}</strong> | Seller: <strong>{trackingOrder.farm_name}</strong>
              </p>
            </div>

            <div className="tracking-container">
              <div className="tracking-header-info">
                <div>🚚 <strong>Shipment Destination:</strong></div>
                <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{profile?.delivery_address || 'Address not set'}</div>
                <div style={{ marginTop: '8px' }}>💰 <strong>Total Amount:</strong> ₹{trackingOrder.total_price} | {trackingOrder.payment_method?.toUpperCase()} ({trackingOrder.payment_status})</div>
              </div>

              {trackingOrder.status === 'cancelled' ? (
                <div className="alert alert-danger" style={{ textAlign: 'center', margin: '20px 0', padding: '16px' }}>
                  <h4>Order Cancelled ❌</h4>
                  <p style={{ fontSize: '12px', marginTop: '6px' }}>This order has been cancelled and will not be processed further. If you were charged, a refund has been initiated.</p>
                </div>
              ) : (
                <div className="tracking-timeline">
                  {/* Step 1: Placed */}
                  <div className={`tracking-step ${['placed', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'completed'].includes(trackingOrder.status) ? 'completed' : ''} ${trackingOrder.status === 'placed' || trackingOrder.status === 'pending' ? 'active' : ''}`}>
                    <div className="tracking-node"></div>
                    <div className="tracking-content">
                      <div className="tracking-title">📝 Order Placed</div>
                      <div className="tracking-desc">We received your request and notified the farm store.</div>
                    </div>
                  </div>

                  {/* Step 2: Confirmed */}
                  <div className={`tracking-step ${['confirmed', 'processing', 'shipped', 'delivered', 'completed'].includes(trackingOrder.status) ? 'completed' : ''} ${trackingOrder.status === 'confirmed' ? 'active' : ''}`}>
                    <div className="tracking-node"></div>
                    <div className="tracking-content">
                      <div className="tracking-title">🤝 Order Confirmed</div>
                      <div className="tracking-desc">The farmer accepted your order and is verifying details.</div>
                    </div>
                  </div>

                  {/* Step 3: Processing */}
                  <div className={`tracking-step ${['processing', 'shipped', 'delivered', 'completed'].includes(trackingOrder.status) ? 'completed' : ''} ${trackingOrder.status === 'processing' ? 'active' : ''}`}>
                    <div className="tracking-node"></div>
                    <div className="tracking-content">
                      <div className="tracking-title">🚜 Packing & Harvesting</div>
                      <div className="tracking-desc">Produce is being fresh-picked, cleaned, and packed at the farm.</div>
                    </div>
                  </div>

                  {/* Step 4: Shipped */}
                  <div className={`tracking-step ${['shipped', 'delivered', 'completed'].includes(trackingOrder.status) ? 'completed' : ''} ${trackingOrder.status === 'shipped' ? 'active' : ''}`}>
                    <div className="tracking-node"></div>
                    <div className="tracking-content">
                      <div className="tracking-title">🚚 Dispatched & In Transit</div>
                      <div className="tracking-desc">The order is loaded onto the local delivery vehicle.</div>
                    </div>
                  </div>

                  {/* Step 5: Delivered */}
                  <div className={`tracking-step ${['delivered', 'completed'].includes(trackingOrder.status) ? 'completed' : ''} ${trackingOrder.status === 'delivered' || trackingOrder.status === 'completed' ? 'active' : ''}`}>
                    <div className="tracking-node"></div>
                    <div className="tracking-content">
                      <div className="tracking-title">🏁 Delivered</div>
                      <div className="tracking-desc">Order has been delivered safely. Thank you for buying organic!</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-actions" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '16px' }}>
              <button className="btn btn-primary" onClick={() => { setShowTrackingModal(false); setTrackingOrder(null); }}>
                Close Tracking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Payment Gateway Modal */}
      {showPaymentModal && (
        <PaymentGatewayModal
          isOpen={showPaymentModal}
          onClose={() => { 
            setShowPaymentModal(false); 
            setPaymentOrderId(null); 
            setPendingOrderPayload(null); 
          }}
          totalPrice={paymentTotal}
          orderId={paymentOrderId}
          user={user}
          profile={profile}
          farmerPhone={paymentFarmerPhone}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}

export default ConsumerDashboard;
