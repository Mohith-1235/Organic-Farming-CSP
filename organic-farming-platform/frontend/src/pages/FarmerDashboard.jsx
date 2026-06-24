import { useState, useEffect, useCallback } from 'react';
import ProductImage from '../components/ProductImage';

function FarmerDashboard({ user, profile, onProfileUpdate }) {
  const [activeTab, setActiveTab] = useState('farm'); // 'farm', 'products', 'labor', 'orders'
  const [farmName, setFarmName] = useState(profile?.farm_name || '');
  const [farmDetails, setFarmDetails] = useState(profile?.farm_details || '');
  const [location, setLocation] = useState(profile?.location || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  
  // Modals state
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null); // null if adding new
  const [productForm, setProductForm] = useState({
    name: '', category: 'Vegetables', price: '', unit: 'kg', description: '', image_url: ''
  });
  
  // Rate history modal
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyProduct, setHistoryProduct] = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);

  // Labor search states
  const [labors, setLabors] = useState([]);
  const [searchLocation, setSearchLocation] = useState('');
  const [searchWage, setSearchWage] = useState('');
  const [searchWageType, setSearchWageType] = useState('');
  const [searchExp, setSearchExp] = useState('');
  const [hires, setHires] = useState([]);
  const [showHireModal, setShowHireModal] = useState(false);
  const [selectedLabor, setSelectedLabor] = useState(null);
  const [hireRemarks, setHireRemarks] = useState('');

  const [message, setMessage] = useState({ type: '', text: '' });
  const farmerId = profile?.id;

  const fetchProducts = useCallback(async () => {
    if (!farmerId) return;

    try {
      const res = await fetch(`/api/farmer/products/${farmerId}`);
      const data = await res.json();
      if (res.ok) setProducts(data);
    } catch (err) {
      console.error(err);
    }
  }, [farmerId]);

  const fetchOrders = useCallback(async () => {
    if (!farmerId) return;

    try {
      const res = await fetch(`/api/farmer/orders/${farmerId}`);
      const data = await res.json();
      if (res.ok) setOrders(data);
    } catch (err) {
      console.error(err);
    }
  }, [farmerId]);

  const fetchHires = useCallback(async () => {
    if (!farmerId) return;

    try {
      const res = await fetch(`/api/farmer/hires/${farmerId}`);
      const data = await res.json();
      if (res.ok) setHires(data);
    } catch (err) {
      console.error(err);
    }
  }, [farmerId]);

  // Fetch initial farmer products, orders, sent hires
  useEffect(() => {
    const loadDashboardId = setTimeout(() => {
      fetchProducts();
      fetchOrders();
      fetchHires();
    }, 0);

    return () => clearTimeout(loadDashboardId);
  }, [fetchProducts, fetchOrders, fetchHires]);

  // Update profile
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    try {
      const res = await fetch(`/api/farmer/profile/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farm_name: farmName, farm_details: farmDetails, location, phone })
      });
      const data = await res.json();
      if (res.ok) {
        onProfileUpdate(data);
        setMessage({ type: 'success', text: 'Farm profile updated successfully!' });
      } else {
        setMessage({ type: 'danger', text: data.error || 'Failed to update profile' });
      }
    } catch (err) {
      console.error('Error updating farmer profile:', err);
      setMessage({ type: 'danger', text: 'Server error updating profile' });
    }
  };

  // Open product modal (Add/Edit)
  const openProductModal = (product = null) => {
    if (product) {
      setEditingProduct(product);
      setProductForm({
        name: product.name,
        category: product.category,
        price: product.price,
        unit: product.unit,
        description: product.description || '',
        image_url: product.image_url || ''
      });
    } else {
      setEditingProduct(null);
      setProductForm({
        name: '', category: 'Vegetables', price: '', unit: 'kg', description: '', image_url: ''
      });
    }
    setShowProductModal(true);
  };

  // Save product (Insert/Update)
  const handleProductSubmit = async (e) => {
    e.preventDefault();
    const endpoint = editingProduct ? `/api/farmer/products/${editingProduct.id}` : '/api/farmer/products';
    const method = editingProduct ? 'PUT' : 'POST';
    const payload = editingProduct 
      ? productForm 
      : { ...productForm, farmer_id: profile.id };

    try {
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        fetchProducts();
        setShowProductModal(false);
      } else {
        alert(data.error || 'Failed to save product');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Delete product
  const handleDeleteProduct = async (id) => {
    if (!confirm('Are you sure you want to delete this product listing?')) return;
    try {
      const res = await fetch(`/api/farmer/products/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchProducts();
      } else {
        alert('Failed to delete product');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // View price history
  const viewPriceHistory = async (product) => {
    setHistoryProduct(product);
    try {
      const res = await fetch(`/api/farmer/products/${product.id}/price-history`);
      const data = await res.json();
      if (res.ok) {
        setPriceHistory(data);
        setShowHistoryModal(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Search labors
  const handleLaborSearch = async (e) => {
    if (e) e.preventDefault();
    
    let url = `/api/search/labors?location=${searchLocation}`;
    if (searchWage) url += `&max_wage=${searchWage}`;
    if (searchWageType) url += `&wage_type=${searchWageType}`;
    if (searchExp) url += `&min_experience=${searchExp}`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        setLabors(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Trigger hire request modal
  const openHireModal = (labor) => {
    setSelectedLabor(labor);
    setHireRemarks('');
    setShowHireModal(true);
  };

  // Send hire request
  const submitHireRequest = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/farmer/hire-labor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farmer_id: profile.id,
          labor_id: selectedLabor.id,
          remarks: hireRemarks
        })
      });
      const data = await res.json();
      if (res.ok) {
        alert('Hire request sent successfully!');
        setShowHireModal(false);
        fetchHires();
      } else {
        alert(data.error || 'Failed to send request');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Update order status
  const handleOrderStatus = async (orderId, newStatus) => {
    try {
      const res = await fetch(`/api/farmer/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        fetchOrders();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="dashboard-grid fade-in">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-menu">
          <div 
            className={`sidebar-item ${activeTab === 'farm' ? 'active' : ''}`}
            onClick={() => setActiveTab('farm')}
          >
            <span className="sidebar-icon">🏡</span> My Farm Profile
          </div>
          <div 
            className={`sidebar-item ${activeTab === 'products' ? 'active' : ''}`}
            onClick={() => setActiveTab('products')}
          >
            <span className="sidebar-icon">🥕</span> Organic Products
          </div>
          <div 
            className={`sidebar-item ${activeTab === 'labor' ? 'active' : ''}`}
            onClick={() => { setActiveTab('labor'); handleLaborSearch(); }}
          >
            <span className="sidebar-icon">👥</span> Find Farm Labors
          </div>
          <div 
            className={`sidebar-item ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('orders')}
          >
            <span className="sidebar-icon">📦</span> Sales & Orders
          </div>
        </div>
        <div style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
          Logged in as <strong>{user.username}</strong>
        </div>
      </aside>

      {/* Main Panel Content */}
      <section className="main-content">
        {message.text && (
          <div className={`alert alert-${message.type}`}>
            {message.text}
          </div>
        )}

        {/* TAB 1: FARM PROFILE */}
        {activeTab === 'farm' && (
          <div className="profile-card">
            <div className="profile-card-header">
              <div className="profile-title">
                <h2>Farm Profile Settings</h2>
                <p>Configure details displayed to consumers searching for organic products.</p>
              </div>
            </div>
            
            <form onSubmit={handleProfileSubmit}>
              <div className="form-group">
                <label>Farm Name</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={farmName} 
                  onChange={(e) => setFarmName(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group">
                <label>Location / City</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={location} 
                  onChange={(e) => setLocation(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group">
                <label>Contact Phone Number</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={phone} 
                  onChange={(e) => setPhone(e.target.value)} 
                  required 
                  placeholder="e.g. +91 99000 11223"
                />
              </div>

              <div className="form-group">
                <label>Farm Details & Description</label>
                <textarea 
                  className="form-control" 
                  rows="4"
                  value={farmDetails} 
                  onChange={(e) => setFarmDetails(e.target.value)}
                  placeholder="Tell customers about your organic practices, what you grow, and certifications..."
                ></textarea>
              </div>

              <button type="submit" className="btn btn-primary">
                Save Farm Settings
              </button>
            </form>
          </div>
        )}

        {/* TAB 2: ORGANIC PRODUCTS (CRUD) */}
        {activeTab === 'products' && (
          <div>
            <div className="section-header">
              <h3>My Organic Produce Listings</h3>
              <button className="btn btn-primary" onClick={() => openProductModal(null)}>
                ➕ Add New Product
              </button>
            </div>

            {products.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-md)' }}>
                <p style={{ color: 'var(--text-muted)' }}>You haven't listed any organic products yet.</p>
                <button className="btn btn-outline" style={{ marginTop: '12px' }} onClick={() => openProductModal(null)}>
                  Create Your First Listing
                </button>
              </div>
            ) : (
              <div className="card-grid">
                {products.map(p => (
                  <div key={p.id} className="card fade-in">
                    <ProductImage product={p} />
                    <div className="card-body">
                      <div className="card-title-group">
                        <h4 className="card-title">{p.name}</h4>
                        <p className="card-desc">{p.description}</p>
                      </div>
                      
                      <div className="card-price-row">
                        <span className="card-price">
                          ₹{p.price} <span>/ {p.unit}</span>
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Updated: {new Date(p.updated_at).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="card-actions">
                        <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => openProductModal(p)}>
                          ✏️ Edit
                        </button>
                        <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => viewPriceHistory(p)}>
                          📈 Rates
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteProduct(p.id)}>
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: FIND LABORS */}
        {activeTab === 'labor' && (
          <div>
            <div className="section-header">
              <h3>Find Farm Labor & Helpers</h3>
            </div>

            {/* Filter Search Bar */}
            <form onSubmit={handleLaborSearch} className="search-filter-bar">
              <div className="form-group" style={{ margin: 0 }}>
                <label>Location</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. Bangalore" 
                  value={searchLocation}
                  onChange={(e) => setSearchLocation(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Max Budget (Wage)</label>
                <input 
                  type="number" 
                  className="form-control" 
                  placeholder="e.g. 5000" 
                  value={searchWage}
                  onChange={(e) => setSearchWage(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Wage Duration</label>
                <select 
                  className="form-control" 
                  value={searchWageType}
                  onChange={(e) => setSearchWageType(e.target.value)}
                >
                  <option value="">Any</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>Min Experience (Years)</label>
                <input 
                  type="number" 
                  className="form-control" 
                  placeholder="e.g. 2" 
                  value={searchExp}
                  onChange={(e) => setSearchExp(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ height: '45px' }}>
                Search Labors
              </button>
            </form>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '30px', alignItems: 'start' }}>
              {/* Search results */}
              <div>
                <h4 style={{ marginBottom: '16px' }}>Available Profiles ({labors.length})</h4>
                {labors.length === 0 ? (
                  <div style={{ padding: '30px', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-muted)' }}>No labor profiles match your search criteria. Try modifying your filters.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {labors.map(l => (
                      <div key={l.id} className="farm-card">
                        <div className="farm-avatar">👷</div>
                        <div className="farm-info" style={{ flexGrow: 1 }}>
                          <h4>{l.name}</h4>
                          <p>📍 Location: <strong>{l.location}</strong> | Experience: <strong>{l.experience_years} years</strong></p>
                          <p>Expected Payment: <strong>₹{l.payment_expectation} / {l.wage_type}</strong></p>
                          <p style={{ fontSize: '12px' }}>📞 Phone: {l.phone || 'Not shared'}</p>
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={() => openHireModal(l)}>
                          Hire Labor
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Hire Requests Track panel */}
              <div>
                <h4 style={{ marginBottom: '16px' }}>Hiring Status</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {hires.length === 0 ? (
                    <div style={{ padding: '20px', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-md)', fontSize: '13px', color: 'var(--text-muted)' }}>
                      No hiring requests sent yet.
                    </div>
                  ) : (
                    hires.map(h => (
                      <div key={h.id} style={{ backgroundColor: 'var(--bg-card)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '13px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <strong>{h.name}</strong>
                          <span className={`status-pill status-${h.status}`}>{h.status}</span>
                        </div>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>Wages: ₹{h.payment_expectation}/{h.wage_type}</p>
                        <p style={{ color: 'var(--text-muted)' }}>Date: {new Date(h.hire_date).toLocaleDateString()}</p>
                        {h.remarks && <p style={{ marginTop: '8px', borderTop: '1px dashed var(--border-color)', paddingTop: '6px', fontStyle: 'italic' }}>"{h.remarks}"</p>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: ORDERS */}
        {activeTab === 'orders' && (
          <div>
            <div className="section-header">
              <h3>Consumer Orders & Sales</h3>
            </div>

            {orders.length === 0 ? (
              <div style={{ padding: '40px', backgroundColor: 'var(--bg-card)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-muted)' }}>No purchase orders received yet.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table>
                  <thead>
                    <tr>
                      <th>Order ID</th>
                      <th>Consumer</th>
                      <th>Delivery Info</th>
                      <th>Items Purchased</th>
                      <th>Total Sale</th>
                      <th>Payment</th>
                      <th>Order Date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id}>
                        <td>#200{o.id}</td>
                        <td>
                          <strong>{o.consumer_name}</strong>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{o.consumer_phone}</div>
                        </td>
                        <td style={{ maxWidth: '180px', fontSize: '12px' }}>{o.delivery_address}</td>
                        <td>
                          <ul className="order-items-list">
                            {o.items?.map((item, idx) => (
                              <li key={idx}>
                                • {item.product_name} ({item.quantity} {item.unit}) @ ₹{item.price_at_purchase}
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td><strong>₹{o.total_price}</strong></td>
                        <td>
                          <div style={{ textTransform: 'uppercase', fontWeight: 700, fontSize: '11px', color: 'var(--primary)' }}>
                            {o.payment_method === 'cod' ? '💵 COD' : o.payment_method === 'upi' ? '📱 UPI' : '💳 CARD'}
                          </div>
                          <div style={{ fontSize: '10px', color: o.payment_status === 'paid' ? 'var(--success)' : 'var(--warning)', fontWeight: 700 }}>
                            {o.payment_status === 'paid' ? 'Paid' : 'Pending'}
                          </div>
                        </td>
                        <td>{new Date(o.order_date).toLocaleDateString()}</td>
                        <td>
                          <span className={`status-pill status-${o.status}`}>{o.status}</span>
                        </td>
                        <td>
                          {['delivered', 'completed'].includes(o.status) && (
                            <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: '13px' }}>✅ Fulfilled</span>
                          )}
                          {o.status === 'cancelled' && (
                            <span style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '13px' }}>❌ Cancelled</span>
                          )}
                          {!['delivered', 'completed', 'cancelled'].includes(o.status) && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {(o.status === 'placed' || o.status === 'pending') && (
                                <button className="btn btn-primary btn-sm" onClick={() => handleOrderStatus(o.id, 'confirmed')}>
                                  🤝 Confirm Order
                                </button>
                              )}
                              {o.status === 'confirmed' && (
                                <button className="btn btn-secondary btn-sm" onClick={() => handleOrderStatus(o.id, 'processing')}>
                                  🚜 Pack & Harvest
                                </button>
                              )}
                              {o.status === 'processing' && (
                                <button className="btn btn-secondary btn-sm" style={{ background: 'var(--grad-sunset)', border: 'none' }} onClick={() => handleOrderStatus(o.id, 'shipped')}>
                                  🚚 Ship Order
                                </button>
                              )}
                              {o.status === 'shipped' && (
                                <button className="btn btn-primary btn-sm" onClick={() => handleOrderStatus(o.id, 'delivered')}>
                                  🏁 Mark Delivered
                                </button>
                              )}
                              <button 
                                className="btn btn-outline btn-sm btn-danger" 
                                style={{ padding: '4px 10px', fontSize: '10px' }}
                                onClick={() => handleOrderStatus(o.id, 'cancelled')}
                              >
                                Cancel Order
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* PRODUCT CREATION/EDIT MODAL */}
      {showProductModal && (
        <div className="modal-overlay">
          <div className="modal-content fade-in">
            <div className="modal-header">
              <h3>{editingProduct ? '✏️ Edit Product Details' : '🥕 Add Organic Product'}</h3>
            </div>
            <form onSubmit={handleProductSubmit}>
              <div className="form-group">
                <label>Product Name</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  required 
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Category</label>
                  <select 
                    className="form-control" 
                    value={productForm.category}
                    onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                  >
                    <option value="Vegetables">Vegetables</option>
                    <option value="Fruits">Fruits</option>
                    <option value="Pulses">Pulses</option>
                    <option value="Grains">Grains</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Price Rate (₹)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={productForm.price}
                    onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                    required 
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Unit</label>
                  <select 
                    className="form-control" 
                    value={productForm.unit}
                    onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}
                  >
                    <option value="kg">per kg</option>
                    <option value="gram">per 500g</option>
                    <option value="bunch">per bunch</option>
                    <option value="box">per box</option>
                    <option value="bag">per bag</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea 
                  className="form-control" 
                  rows="3"
                  value={productForm.description}
                  onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                  placeholder="Grown without synthetic fertilizers, harvested daily..."
                ></textarea>
              </div>

              <div className="form-group">
                <label>Product Image URL</label>
                <input
                  type="url"
                  className="form-control"
                  value={productForm.image_url}
                  onChange={(e) => setProductForm({ ...productForm, image_url: e.target.value })}
                  placeholder="https://example.com/organic-tomatoes.jpg"
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowProductModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingProduct ? 'Save Changes' : 'List Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RATE HISTORY MODAL */}
      {showHistoryModal && historyProduct && (
        <div className="modal-overlay">
          <div className="modal-content fade-in">
            <div className="modal-header">
              <h3>📈 Rate Fluctuation Logs</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Track day-wise price updates for <strong>{historyProduct.name}</strong> based on market rates.
              </p>
            </div>
            
            <div className="price-log-container">
              {priceHistory.length === 0 ? (
                <p style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No historical rates recorded.</p>
              ) : (
                priceHistory.map((log, idx) => (
                  <div key={idx} className="price-log-row">
                    <span className="date">{new Date(log.change_date).toLocaleString()}</span>
                    <span className="price">₹{log.price} / {historyProduct.unit}</span>
                  </div>
                ))
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: '20px' }}>
              <button type="button" className="btn btn-primary" onClick={() => setShowHistoryModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HIRE LABOR REQUEST MODAL */}
      {showHireModal && selectedLabor && (
        <div className="modal-overlay">
          <div className="modal-content fade-in">
            <div className="modal-header">
              <h3>🤝 Hiring Request</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Send a proposal to <strong>{selectedLabor.name}</strong> for farming assistance.
              </p>
            </div>
            <form onSubmit={submitHireRequest}>
              <div style={{ backgroundColor: 'var(--primary-light)', padding: '12px', borderRadius: 'var(--radius-sm)', marginBottom: '16px', fontSize: '13px', color: 'var(--primary)' }}>
                Wage Demands: <strong>₹{selectedLabor.payment_expectation} / {selectedLabor.wage_type}</strong>
              </div>
              <div className="form-group">
                <label>Job Description & Instructions</label>
                <textarea 
                  className="form-control" 
                  rows="4"
                  value={hireRemarks}
                  onChange={(e) => setHireRemarks(e.target.value)}
                  placeholder="Specify task type, duration, daily work times, or additional requirements..."
                  required
                ></textarea>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowHireModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Send Proposal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default FarmerDashboard;
