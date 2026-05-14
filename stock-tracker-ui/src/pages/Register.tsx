import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../AuthContext';

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/auth/register', form);
      login(res.data);
      navigate('/');
    } catch {
      setError('Email already exists');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>📈 StockTracker</h2>
        <h3>Create Account</h3>
        {error && <p className="error">{error}</p>}
        <form onSubmit={submit}>
          <input placeholder="Full Name" value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="Email" type="email" value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })} required />
          <input placeholder="Password" type="password" value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })} required />
          <button type="submit">Register</button>
        </form>
        <p>Have an account? <Link to="/login">Login</Link></p>
      </div>
    </div>
  );
}
