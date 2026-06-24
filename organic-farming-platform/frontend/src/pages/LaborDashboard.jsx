import { useState, useEffect, useCallback } from 'react';

function LaborDashboard({ user, profile, onProfileUpdate }) {
  const [name, setName] = useState(profile?.name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [location, setLocation] = useState(profile?.location || '');
  const [experience, setExperience] = useState(profile?.experience_years || 0);
  const [payment, setPayment] = useState(profile?.payment_expectation || 0);
  const [wageType, setWageType] = useState(profile?.wage_type || 'weekly');
  const [hires, setHires] = useState([]);
  
  const [message, setMessage] = useState({ type: '', text: '' });
  const laborId = profile?.id;

  const fetchHires = useCallback(async () => {
    if (!laborId) return;

    try {
      const res = await fetch(`/api/labor/hires/${laborId}`);
      const data = await res.json();
      if (res.ok) setHires(data);
    } catch (err) {
      console.error(err);
    }
  }, [laborId]);

  useEffect(() => {
    const loadHiresId = setTimeout(() => {
      fetchHires();
    }, 0);

    return () => clearTimeout(loadHiresId);
  }, [fetchHires]);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    
    if (Number(payment) < 0 || Number(experience) < 0) {
      setMessage({ type: 'danger', text: 'Expectations and experience must be positive values' });
      return;
    }

    try {
      const res = await fetch(`/api/labor/profile/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          location,
          experience_years: Number(experience),
          payment_expectation: Number(payment),
          wage_type: wageType
        })
      });
      const data = await res.json();
      if (res.ok) {
        onProfileUpdate(data);
        setMessage({ type: 'success', text: 'Labor profile updated successfully!' });
      } else {
        setMessage({ type: 'danger', text: data.error || 'Failed to update profile' });
      }
    } catch (err) {
      console.error('Error updating labor profile:', err);
      setMessage({ type: 'danger', text: 'Server error updating profile' });
    }
  };

  const handleProposalStatus = async (hireId, newStatus) => {
    try {
      const res = await fetch(`/api/labor/hires/${hireId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        fetchHires();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="container fade-in" style={{ padding: '40px 24px' }}>
      <div className="section-header">
        <h2>Labor Dashboard</h2>
        <p style={{ color: 'var(--text-muted)' }}>Configure your worker profile and manage hiring requests from farmers.</p>
      </div>

      {message.text && (
        <div className={`alert alert-${message.type}`}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '40px', alignItems: 'start' }}>
        {/* Left Side: Profile Setup */}
        <div className="profile-card">
          <h3 style={{ marginBottom: '20px', fontSize: '18px' }}>👤 Worker Profile Details</h3>
          <form onSubmit={handleProfileSubmit}>
            <div className="form-group">
              <label>Full Name</label>
              <input 
                type="text" 
                className="form-control" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                required 
              />
            </div>

            <div className="form-group">
              <label>Contact Phone Number</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="e.g. +91 99999 88888"
                value={phone} 
                onChange={(e) => setPhone(e.target.value)} 
                required 
              />
            </div>

            <div className="form-group">
              <label>Current Location / Town</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="e.g. Bangalore"
                value={location} 
                onChange={(e) => setLocation(e.target.value)} 
                required 
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Experience (Years)</label>
                <input 
                  type="number" 
                  className="form-control" 
                  value={experience} 
                  onChange={(e) => setExperience(e.target.value)} 
                  required 
                />
              </div>

              <div className="form-group">
                <label>Wage Expected (₹)</label>
                <input 
                  type="number" 
                  className="form-control" 
                  value={payment} 
                  onChange={(e) => setPayment(e.target.value)} 
                  required 
                />
              </div>
            </div>

            <div className="form-group">
              <label>Wage Expectation Cycle</label>
              <select 
                className="form-control" 
                value={wageType} 
                onChange={(e) => setWageType(e.target.value)}
              >
                <option value="weekly">Weekly Payment</option>
                <option value="monthly">Monthly Payment</option>
              </select>
            </div>

            <button type="submit" className="btn btn-primary btn-block">
              Update Profile details
            </button>
          </form>
        </div>

        {/* Right Side: Hires Proposals */}
        <div>
          <h3 style={{ marginBottom: '20px', fontSize: '18px', color: 'var(--primary)' }}>📩 Job Proposals & Hiring Requests</h3>
          {hires.length === 0 ? (
            <div style={{ padding: '40px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)' }}>No hiring requests received yet.</p>
              <p style={{ fontSize: '12px', color: 'var(--text-light)', marginTop: '8px' }}>
                Ensure your profile is complete and location is set so farmers can find you.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {hires.map(h => (
                <div key={h.id} className="card fade-in" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <h4 style={{ color: 'var(--primary)' }}>🏡 {h.farm_name}</h4>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>📍 Farm Location: {h.farm_location} | Farmer: @{h.farmer_username}</p>
                    </div>
                    <span className={`status-pill status-${h.status}`}>{h.status}</span>
                  </div>

                  {h.remarks && (
                    <div style={{ backgroundColor: 'var(--bg-main)', padding: '12px', borderRadius: 'var(--radius-sm)', fontStyle: 'italic', fontSize: '13px', marginBottom: '16px', borderLeft: '3px solid var(--primary)' }}>
                      "{h.remarks}"
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <span>Proposed on: {new Date(h.hire_date).toLocaleDateString()}</span>
                    
                    {h.status === 'pending' && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-primary btn-sm" onClick={() => handleProposalStatus(h.id, 'hired')}>
                          Accept
                        </button>
                        <button className="btn btn-outline btn-sm btn-danger" onClick={() => handleProposalStatus(h.id, 'rejected')}>
                          Decline
                        </button>
                      </div>
                    )}
                    {h.status !== 'pending' && (
                      <strong>
                        {h.status === 'hired' ? '✅ You accepted this request' : '❌ Declined'}
                      </strong>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LaborDashboard;
