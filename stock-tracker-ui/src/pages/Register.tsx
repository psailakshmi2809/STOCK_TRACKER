import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../AuthContext';

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/register', form);
      login(res.data);
      navigate('/');
    } catch {
      setError('Email already exists');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header-section">
          <h2>📈 StockNova</h2>
          <h3>Create Account</h3>
        </div>
        
        {error && <div className="error-banner">{error}</div>}
        
        <form onSubmit={submit} className="auth-form">
          <div className="form-group">
            <input
              placeholder="Full Name"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required
              disabled={loading}
            />
          </div>
          
          <div className="form-group">
            <input
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              required
              disabled={loading}
            />
          </div>
          
          <div className="form-group">
            <input
              placeholder="Password"
              type="password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              required
              disabled={loading}
            />
          </div>
          
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? (
              <>
                <span className="spinner"></span>
                Creating account...
              </>
            ) : (
              'Register'
            )}
          </button>
        </form>

        <p className="auth-footer">
          Have an account? <Link to="/login">Login</Link>
        </p>
      </div>
    </div>
  );
}
