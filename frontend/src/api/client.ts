import { Store, Category, Product, DashboardStats, User } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export async function fetchStores(): Promise<Store[]> {
  const res = await fetch(`${API_BASE}/api/stores`);
  if (!res.ok) throw new Error('Failed to fetch stores');
  return res.json();
}

export async function fetchCategories(): Promise<Category[]> {
  const res = await fetch(`${API_BASE}/api/categories`);
  if (!res.ok) throw new Error('Failed to fetch categories');
  return res.json();
}

export async function searchProductsApi(params: {
  q?: string;
  storeId?: string;
  city?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
}): Promise<{ hits: Product[]; total: number; source: string }> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.storeId) query.set('storeId', params.storeId);
  if (params.city) query.set('city', params.city);
  if (params.category && params.category !== 'all') query.set('category', params.category);
  if (params.minPrice) query.set('minPrice', String(params.minPrice));
  if (params.maxPrice) query.set('maxPrice', String(params.maxPrice));

  const res = await fetch(`${API_BASE}/api/products/search?${query.toString()}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export async function createOrderApi(orderData: {
  storeId: string;
  customerName: string;
  customerPhone: string;
  deliveryType: 'delivery' | 'pickup';
  items: { productId: string; quantity: number }[];
}) {
  const res = await fetch(`${API_BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderData)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to place order');
  return data;
}

export async function fetchDashboardStats(storeId: string): Promise<DashboardStats> {
  const res = await fetch(`${API_BASE}/api/dashboard/stats?storeId=${storeId}`);
  if (!res.ok) throw new Error('Failed to load dashboard stats');
  return res.json();
}

export async function restockProductApi(storeId: string, productId: string, quantity: number) {
  const res = await fetch(`${API_BASE}/api/inventory/restock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, productId, quantity })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Restock failed');
  return data;
}

export async function updateExactStockApi(storeId: string, productId: string, stock: number) {
  const res = await fetch(`${API_BASE}/api/inventory/stock`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, productId, stock })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Update stock failed');
  return data;
}

export async function updateOrderStatusApi(orderId: string, status: string) {
  const res = await fetch(`${API_BASE}/api/orders/${orderId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update order status');
  return data;
}

export async function fetchOrdersApi(storeId?: string) {
  const query = storeId ? `?storeId=${storeId}` : '';
  const res = await fetch(`${API_BASE}/api/orders${query}`);
  if (!res.ok) throw new Error('Failed to fetch orders');
  return res.json();
}

export async function loginApi(input: {
  email: string;
  password: string;
  expectedRole?: 'customer' | 'shopkeeper';
}): Promise<{ user: User; token: string }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

export async function registerApi(input: {
  name: string;
  email: string;
  password: string;
  role?: 'customer' | 'shopkeeper';
  storeId?: string;
  phone?: string;
}): Promise<{ user: User; token: string }> {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  return data;
}

export async function getMeApi(token: string): Promise<{ user: User }> {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch user');
  return data;
}

export async function simulateRaceApi(storeId: string) {
  const res = await fetch(`${API_BASE}/api/simulate-race`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, productId: 'prod-race-condition-demo' })
  });
  return res.json();
}

export function createEventSource(): EventSource {
  return new EventSource(`${API_BASE}/api/events/live`);
}
