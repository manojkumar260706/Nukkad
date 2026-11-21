export interface User {
  id: string;
  name: string;
  email: string;
  role: 'customer' | 'shopkeeper';
  storeId?: string;
  phone?: string;
}

export interface Store {
  id: string;
  name: string;
  city: string;
  locality: string;
  address: string;
  pin?: string | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface Product {
  id: string;
  product_id: string;
  store_id: string;
  store_name?: string;
  city?: string;
  name: string;
  brand: string;
  category_id: string;
  category_name?: string;
  unit: string;
  price: number;
  mrp: number;
  description: string;
  image_url: string;
  stock: number;
  in_stock: boolean;
  low_stock_threshold: number;
  synonyms?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface KafkaEvent {
  id: string;
  type: string;
  topic?: string;
  title: string;
  description: string;
  timestamp: string;
  metadata?: any;
}

export interface InventoryItem {
  listed: boolean;
  product_id: string;
  product_name: string;
  unit: string;
  price: number;
  stock: number;
  low_stock_threshold: number;
  is_low_stock: boolean;
}

export interface DashboardStats {
  storeName?: string;
  storeId: string;
  ordersToday: number;
  lowStockCount: number;
  searchIndexStatus: string;
  inventory: InventoryItem[];
  recentOrders: any[];
}
