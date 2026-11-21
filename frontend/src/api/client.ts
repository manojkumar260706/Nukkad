import { Store, Category, Product, DashboardStats, User } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

async function readApiResponse<T>(response: Response, fallback: string): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    throw new Error(data?.error || (response.status >= 500 || data === null
      ? 'Could not reach the Nukkad API. Try again in a moment.'
      : fallback));
  }
  return data as T;
}

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
  inStockOnly?: boolean;
  sort?: 'price-asc' | 'price-desc';
  page?: number;
  nearest?: boolean;
  latitude?: number;
  longitude?: number;
  matchListing?: string;
}): Promise<{ hits: Product[]; total: number; source: string }> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.storeId) query.set('storeId', params.storeId);
  if (params.city) query.set('city', params.city);
  if (params.category && params.category !== 'all') query.set('category', params.category);
  if (params.minPrice !== undefined) query.set('minPrice', String(params.minPrice));
  if (params.maxPrice !== undefined) query.set('maxPrice', String(params.maxPrice));

  if (params.inStockOnly) query.set('inStockOnly', 'true');
  if (params.sort) query.set('sort', params.sort);
  if (params.page) query.set('page', String(params.page));
  if (params.nearest) query.set('nearest', 'true');
  if (params.latitude !== undefined && params.longitude !== undefined) {
    query.set('latitude', String(params.latitude));
    query.set('longitude', String(params.longitude));
  }
  if (params.matchListing) query.set('matchListing', params.matchListing);

  const res = await fetch(`${API_BASE}/api/products/search?${query.toString()}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

type Account = 'customer' | 'shopkeeper';

async function accountRequest<T>(account: Account, path: string, method = 'GET', body?: object): Promise<T> {
  const token = localStorage.getItem(`nukkad_${account}_token`);
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token || ''}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return readApiResponse<T>(response, 'Request failed.');
}

export interface DatabaseChange {
  id: string | number;
  source_table: 'orders' | 'store_inventory';
  row_id: string;
  label?: string;
  before_state: Record<string, string | number> | null;
  after_state: Record<string, string | number>;
  changed_at: string;
}

export function fetchDatabaseChanges() {
  return accountRequest<DatabaseChange[]>('shopkeeper', '/api/dashboard/changes');
}

export interface DemoResult {
  changes: DatabaseChange[];
  results: { action: string; result: string }[];
  snapshot: { stock: number; orders: number };
}

export function runCheckoutDemo(scenario: string) {
  return accountRequest<DemoResult>('shopkeeper', '/api/dashboard/demo', 'POST', { scenario });
}

export interface CustomerOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  deliveryType: 'delivery' | 'pickup';
  total: string;
  paymentUrl: string | null;
  pickupCode: string | null;
  pickupUntil: string | null;
  holdUntil: string | null;
  storeAddress?: string;
  storeName?: string;
  items?: { name: string; unit: string; quantity: number; price: number }[];
  changes?: DatabaseChange[];
}

export function createOrderApi(orderData: {
  storeId: string;
  customerName: string;
  customerPhone: string;
  deliveryType: 'delivery' | 'pickup';
  address?: string;
  postalCode?: string;
  items: { productId: string; quantity: number; expectedPrice?: number }[];
}) {
  return accountRequest<{ order: CustomerOrder }>('customer', '/api/orders', 'POST', orderData);
}

export function fetchCustomerOrders() {
  return accountRequest<CustomerOrder[]>('customer', '/api/customer/orders');
}

export function checkPayment(id: string, cancel = false) {
  return accountRequest<CustomerOrder>('customer', `/api/customer/orders/${id}/payment`, 'POST', { cancel });
}

export function fetchDashboardStats() {
  return accountRequest<DashboardStats>('shopkeeper', '/api/dashboard/stats');
}

export function restockProductApi(productId: string, quantity: number) {
  return accountRequest('shopkeeper', '/api/inventory/restock', 'POST', { productId, quantity });
}

export function recordCounterSale(productId: string, quantity: number) {
  return accountRequest('shopkeeper', '/api/inventory/counter-sale', 'POST', { productId, quantity });
}

export function updateExactStockApi(productId: string, stock: number, expectedStock: number) {
  return accountRequest('shopkeeper', '/api/inventory/stock', 'PUT', { productId, stock, expectedStock });
}

export function updateOrderStatusApi(orderId: string, status: string, pickupCode?: string) {
  return accountRequest('shopkeeper', `/api/orders/${orderId}/status`, 'PUT', { status, pickupCode });
}

export function fetchOrdersApi() {
  return accountRequest<any[]>('shopkeeper', '/api/orders');
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
  return readApiResponse(res, 'Login failed');
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
  return readApiResponse(res, 'Registration failed');
}

export async function getMeApi(token: string): Promise<{ user: User }> {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return readApiResponse(res, 'Failed to fetch user');
}

export function simulateRaceApi() {
  return accountRequest<any>('shopkeeper', '/api/simulate-race', 'POST', {});
}

export function createEventSource(): EventSource {
  return new EventSource(`${API_BASE}/api/events/live`);
}

export interface Coordinates { latitude: number; longitude: number }
export interface NearbyStore extends Store { distance: number | null }
export interface ShoppingItem { name: string; quantity: number }
export interface PickupBasket {
  store: NearbyStore;
  items: { productId: string; name: string; unit: string; quantity: number; expectedPrice: number }[];
}
export interface ShoppingPlan {
  baskets: PickupBasket[];
  missing: ShoppingItem[];
  units: number;
  basketPrice: number;
  distance: number | null;
  score: number;
}

async function postJson<T>(path: string, body: object): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return readApiResponse(response, 'Request failed.');
}

export const findNearbyStores = (data: { location: string; gps?: Coordinates }) =>
  postJson<NearbyStore[]>('/api/stores/nearby', data);
export const findShoppingPlans = (data: { list: string; location: string; gps?: Coordinates }) =>
  postJson<{ stores: NearbyStore[]; unmatched: ShoppingItem[]; singles: ShoppingPlan[]; split: ShoppingPlan | null }>('/api/shopping-plan', data);
export const askShoppingAssistant = (data: { message: string; language: string; previous: ShoppingItem[]; lastTurn?: { request: string; reply: string }; location: string; gps?: Coordinates }) =>
  accountRequest<{ items: ShoppingItem[]; question: string; replyText: string; replyLanguage: string; plans: Awaited<ReturnType<typeof findShoppingPlans>> | null }>(
    'customer', '/api/customer/shopping-assistant', 'POST', data
  );
export const reserveBaskets = (requestKey: string, baskets: PickupBasket[]) =>
  accountRequest<{ orders: { id: string; storeId: string }[] }>('customer', '/api/customer/pickup-reservations', 'POST', {
    requestKey,
    baskets: baskets.map(({ store, items }) => ({ storeId: store.id, items }))
  });
export const cancelPickup = (id: string) =>
  accountRequest('customer', `/api/customer/orders/${encodeURIComponent(id)}/cancel-pickup`, 'POST');
export const loadCatalog = () =>
  accountRequest<{ id: string; name: string; unit: string; price: number }[]>('shopkeeper', '/api/inventory/catalog');
export const saveListing = (input: {
  productId?: string; name: string; unit: string; price: number; stock: number;
  expectedStock?: number; listed: boolean; synonyms: string[];
}, id?: string) => accountRequest('shopkeeper', id ? `/api/inventory/listings/${encodeURIComponent(id)}` : '/api/inventory/listings',
  id ? 'PUT' : 'POST', input);
export interface MerchantRegistration {
  name: string; email: string; password: string;
  store: { name: string; city: string; locality: string; address: string; pin: string; location?: Coordinates };
}
export const registerMerchant = (data: MerchantRegistration) =>
  postJson<{ user: User; token: string }>('/api/auth/merchant/register', data);
