import React, { useEffect, useState, useRef } from 'react';
import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr';
import api from '../api';
import { useAuth } from '../AuthContext';

interface Stock {
  symbol: string;
  companyName: string;
  price: number;
  change: number;
  changePercent: number;
}

interface WatchlistItem {
  id: string;
  symbol: string;
  companyName: string;
  price: number;
  change: number;
  changePercent: number;
}

interface Alert {
  id: string;
  symbol: string;
  targetPrice: number;
  type: number;
  isTriggered: boolean;
}

interface AlertTriggeredPayload {
  symbol: string;
  targetPrice: number;
  message: string;
}

interface AlertForm {
  symbol: string;
  targetPrice: string;
  type: string;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [notification, setNotification] = useState('');
  const [alertForm, setAlertForm] = useState<AlertForm>({ symbol: '', targetPrice: '', type: '0' });
  const [tab, setTab] = useState('market');
  const connRef = useRef<HubConnection | null>(null);

  useEffect(() => {
    api.get('/stock').then(r => setStocks(r.data));
    api.get('/stock/watchlist').then(r => setWatchlist(r.data));
    api.get('/alert').then(r => setAlerts(r.data));
  }, []);

  useEffect(() => {
    const conn = new HubConnectionBuilder()
      .withUrl('https://stock-tracker-nfyt.onrender.com/hubs/stock',  {
        accessTokenFactory: () => user.token
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    conn.on('PriceUpdate', (updates: Stock[]) => {
      setStocks(updates);
      setWatchlist(prev => prev.map(w => {
        const u = updates.find(x => x.symbol === w.symbol);
        return u ? { ...w, price: u.price, change: u.change, changePercent: u.changePercent } : w;
      }));
    });

    conn.on('AlertTriggered', (data: AlertTriggeredPayload) => {
      setNotification(data.message);
      setAlerts(prev => prev.map(a =>
        a.symbol === data.symbol && !a.isTriggered ? { ...a, isTriggered: true } : a
      ));
      setTimeout(() => setNotification(''), 6000);
    });

    conn.start().catch(console.error);
    connRef.current = conn;
    return () => { conn.stop(); };
  }, [user.token]);

  const addToWatchlist = async (symbol: string) => {
    const res = await api.post('/stock/watchlist', { symbol });
    const snap = stocks.find(s => s.symbol === symbol);
    setWatchlist(prev => [...prev, {
      id: res.data.id,
      symbol: res.data.symbol,
      companyName: res.data.companyName,
      price: snap?.price ?? 0,
      change: snap?.change ?? 0,
      changePercent: snap?.changePercent ?? 0
    }]);
  };

  const removeFromWatchlist = async (id: string) => {
    await api.delete(`/stock/watchlist/${id}`);
    setWatchlist(prev => prev.filter(w => w.id !== id));
  };

  const createAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.post('/alert', {
      symbol: alertForm.symbol.toUpperCase(),
      targetPrice: parseFloat(alertForm.targetPrice),
      type: parseInt(alertForm.type)
    });
    setAlerts(prev => [res.data, ...prev]);
    setAlertForm({ symbol: '', targetPrice: '', type: '0' });
  };

  const deleteAlert = async (id: string) => {
    await api.delete(`/alert/${id}`);
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="dashboard">
      <header>
        <h1>📈 StockTracker</h1>
        <div>
          <span>Welcome, {user.name}</span>
          <button className="btn-logout" onClick={logout}>Logout</button>
        </div>
      </header>

      {notification && <div className="alert-banner">🔔 {notification}</div>}

      <nav className="tabs">
        <button className={tab === 'market' ? 'active' : ''} onClick={() => setTab('market')}>Market</button>
        <button className={tab === 'watchlist' ? 'active' : ''} onClick={() => setTab('watchlist')}>Watchlist ({watchlist.length})</button>
        <button className={tab === 'alerts' ? 'active' : ''} onClick={() => setTab('alerts')}>Alerts ({alerts.filter(a => !a.isTriggered).length})</button>
      </nav>

      {tab === 'market' && (
        <div className="stock-grid">
          {stocks.map(s => {
            const inWatchlist = watchlist.some(w => w.symbol === s.symbol);
            return (
              <div key={s.symbol} className="stock-card">
                <div className="stock-header">
                  <strong>{s.symbol}</strong>
                  <span className="company">{s.companyName}</span>
                </div>
                <div className="stock-price">${s.price?.toFixed(2)}</div>
                <div className={`stock-change ${s.change >= 0 ? 'up' : 'down'}`}>
                  {s.change >= 0 ? '▲' : '▼'} ${Math.abs(s.change).toFixed(2)} ({s.changePercent?.toFixed(2)}%)
                </div>
                <button
                  className={`btn-watch ${inWatchlist ? 'watching' : ''}`}
                  onClick={() => !inWatchlist && addToWatchlist(s.symbol)}
                  disabled={inWatchlist}
                >
                  {inWatchlist ? '★ Watching' : '☆ Watch'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'watchlist' && (
        <div>
          {watchlist.length === 0 ? (
            <p className="empty">No stocks in watchlist. Add from Market tab.</p>
          ) : (
            <div className="stock-grid">
              {watchlist.map(w => (
                <div key={w.id} className="stock-card">
                  <div className="stock-header">
                    <strong>{w.symbol}</strong>
                    <button className="btn-remove" onClick={() => removeFromWatchlist(w.id)}>✕</button>
                  </div>
                  <span className="company">{w.companyName}</span>
                  <div className="stock-price">${w.price?.toFixed(2)}</div>
                  <div className={`stock-change ${w.change >= 0 ? 'up' : 'down'}`}>
                    {w.change >= 0 ? '▲' : '▼'} ${Math.abs(w.change).toFixed(2)} ({w.changePercent?.toFixed(2)}%)
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'alerts' && (
        <div className="alerts-section">
          <form className="alert-form" onSubmit={createAlert}>
            <h3>Set Price Alert</h3>
            <div className="alert-form-row">
              <select value={alertForm.symbol} onChange={e => setAlertForm({ ...alertForm, symbol: e.target.value })} required>
                <option value="">Select Stock</option>
                {stocks.map(s => <option key={s.symbol} value={s.symbol}>{s.symbol} — ${s.price?.toFixed(2)}</option>)}
              </select>
              <select value={alertForm.type} onChange={e => setAlertForm({ ...alertForm, type: e.target.value })}>
                <option value="0">Price goes Above</option>
                <option value="1">Price goes Below</option>
              </select>
              <input type="number" step="0.01" placeholder="Target Price ($)"
                value={alertForm.targetPrice}
                onChange={e => setAlertForm({ ...alertForm, targetPrice: e.target.value })} required />
              <button type="submit">Create Alert</button>
            </div>
          </form>

          <div className="alert-list">
            {alerts.length === 0 && <p className="empty">No alerts set.</p>}
            {alerts.map(a => (
              <div key={a.id} className={`alert-item ${a.isTriggered ? 'triggered' : ''}`}>
                <span><strong>{a.symbol}</strong> — {a.type === 0 ? 'Above' : 'Below'} ${a.targetPrice.toFixed(2)}</span>
                <span>{a.isTriggered ? '✅ Triggered' : '⏳ Pending'}</span>
                <button className="btn-remove" onClick={() => deleteAlert(a.id)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
