import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import api from '../api';
import { useAuth } from '../AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', form);
      login(res.data);
      navigate('/');
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse | null) => {
    setError('');
    if (!credentialResponse?.credential) {
      setError('Google login failed');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/google', { idToken: credentialResponse.credential });
      login(res.data);
      navigate('/');
    } catch {
      setError('Google login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('Google login failed');
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2>📈 StockNova</h2>
        <h3>Sign In</h3>
        {error && <p className="error">{error}</p>}
        <form onSubmit={submit}>
          <input placeholder="Email" type="email" value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })} required />
          <input placeholder="Password" type="password" value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })} required />
          <button type="submit" disabled={loading}>{loading ? 'Loading…' : 'Login'}</button>
        </form>
        <div className="divider">or</div>
        <div className="google-btn-wrapper">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            width="100%"
            useOneTap={false}
          />
        </div>
        <p>No account? <Link to="/register">Register</Link></p>
      </div>
    </div>
  );
}
