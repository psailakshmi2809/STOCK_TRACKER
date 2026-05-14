import axios from 'axios';

export const apiBaseUrl = import.meta.env.VITE_API_URL || 'https://stock-tracker-nfyt.onrender.com/api';

const api = axios.create({
  baseURL: apiBaseUrl
});

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

export default api;
