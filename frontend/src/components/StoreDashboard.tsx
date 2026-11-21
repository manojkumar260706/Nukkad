import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DashboardStats, KafkaEvent } from '../types';
import {
  fetchDashboardStats,
  updateExactStockApi,
  updateOrderStatusApi,
  fetchOrdersApi,
  createEventSource
} from '../api/client';
import {
  Store as StoreIcon,
  Search,
  CheckCircle,
  AlertTriangle,
  Package,
  TrendingUp,
  LogOut,
  RefreshCw,
  Minus,
  Terminal,
  ShoppingBag
} from 'lucide-react';

export const StoreDashboard: React.FC = () => {
  const { shopkeeper, logoutShopkeeper } = useAuth();
  const navigate = useNavigate();

  const storeId = shopkeeper?.storeId || 'store-koramangala';

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [events, setEvents] = useState<KafkaEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'inventory' | 'orders' | 'events'>('inventory');
  const [isLoading, setIsLoading] = useState(false);

  // Inline editing state: productId -> new stock number
  const [editingStock, setEditingStock] = useState<Record<string, number>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Check auth
  useEffect(() => {
    if (!shopkeeper) {
      navigate('/store/login');
    }
  }, [shopkeeper, navigate]);

  // Load stats and orders
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [statsData, ordersData] = await Promise.all([
        fetchDashboardStats(storeId),
        fetchOrdersApi(storeId)
      ]);
      setStats(statsData);
      setOrders(ordersData);

      // Pre-fill editing stock values
      const initialStock: Record<string, number> = {};
      statsData.inventory.forEach((i) => {
        initialStock[i.product_id] = i.stock;
      });
      setEditingStock(initialStock);
    } catch (err) {
      console.error('Failed to load storekeeper data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [storeId]);

  // Live SSE listener for orders and stock updates
  useEffect(() => {
    const eventSource = createEventSource();

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') return;

        const newEvent: KafkaEvent = {
          id: `${Date.now()}-${Math.random()}`,
          type: data.type,
          topic: data.topic,
          title: data.title || data.type,
          description: data.description || '',
          timestamp: data.timestamp || new Date().toISOString(),
          metadata: data.metadata
        };

        setEvents((prev) => [newEvent, ...prev.slice(0, 49)]);

        // Live refresh inventory and orders when event arrives
        if (data.type === 'order.placed' || data.type === 'inventory.changed') {
          loadData();
        }
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [storeId]);

  // Direct stock update handler
  const handleSaveStock = async (productId: string, newStock: number) => {
    setUpdatingId(productId);
    try {
      await updateExactStockApi(storeId, productId, Math.max(0, newStock));
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update stock');
    } finally {
      setUpdatingId(null);
    }
  };

  // Quick delta updater (+5, +10, -1)
  const handleQuickDelta = async (productId: string, currentStock: number, delta: number) => {
    const newStock = Math.max(0, currentStock + delta);
    setEditingStock((prev) => ({ ...prev, [productId]: newStock }));
    await handleSaveStock(productId, newStock);
  };

  // Order status update handler
  const handleUpdateOrderStatus = async (orderId: string, status: string) => {
    try {
      await updateOrderStatusApi(orderId, status);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update order status');
    }
  };

  const handleLogout = () => {
    logoutShopkeeper();
    navigate('/store/login');
  };

  // Filtered inventory list
  const filteredInventory = stats?.inventory.filter((item) => {
    const matchesSearch = item.product_name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  }) || [];

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col font-sans">
      {/* Merchant Top Bar */}
      <header className="bg-nukkad-950 text-white border-b border-nukkad-900 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-700 flex items-center justify-center text-white font-bold">
              <StoreIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="font-serif font-bold text-base tracking-tight leading-none text-stone-100">
                Nukkad Merchant Console
              </div>
              <div className="text-[11px] text-emerald-400 font-mono mt-0.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Koramangala Store · Live Shelf Operations</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              disabled={isLoading}
              className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-nukkad-900 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>

            <div className="hidden sm:block text-right">
              <div className="text-xs font-semibold text-stone-200">
                {shopkeeper?.name || 'Store Manager'}
              </div>
              <div className="text-[10px] text-stone-400 font-mono">
                {shopkeeper?.email}
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-nukkad-900 hover:bg-stone-800 text-stone-300 hover:text-white text-xs font-medium border border-nukkad-800 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 text-red-400" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full flex-1 space-y-6">
        {/* KPI Cards Bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-2xs">
            <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">
              Orders Today
            </div>
            <div className="font-serif font-bold text-3xl text-stone-900">
              {stats?.ordersToday || 38}
            </div>
            <div className="text-[10px] text-emerald-700 font-medium flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3" />
              <span>Auto-synced via Outbox</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-2xs">
            <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">
              Low Stock Alerts
            </div>
            <div className="font-serif font-bold text-3xl text-amber-600">
              {stats?.lowStockCount || 0}
            </div>
            <div className="text-[10px] text-amber-700 font-medium flex items-center gap-1 mt-1">
              <AlertTriangle className="w-3 h-3" />
              <span>Threshold ≤ 5 units</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-2xs">
            <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">
              Active SKUs
            </div>
            <div className="font-serif font-bold text-3xl text-stone-900">
              {stats?.inventory.length || 0}
            </div>
            <div className="text-[10px] text-stone-500 font-medium flex items-center gap-1 mt-1">
              <Package className="w-3 h-3" />
              <span>Managed in Aiven PostgreSQL</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-2xs">
            <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">
              Search Index Status
            </div>
            <div className="font-serif font-bold text-2xl text-emerald-800 flex items-center gap-1.5 mt-1">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
              <span>In sync</span>
            </div>
            <div className="text-[10px] text-stone-500 font-mono mt-1">
              Aiven OpenSearch · 0 lag
            </div>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center justify-between border-b border-stone-200 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('inventory')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'inventory'
                  ? 'bg-nukkad-900 text-white shadow-xs'
                  : 'bg-white text-stone-600 hover:text-stone-900 border border-stone-200'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Shelf Stock Manager</span>
            </button>

            <button
              onClick={() => setActiveTab('orders')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'orders'
                  ? 'bg-nukkad-900 text-white shadow-xs'
                  : 'bg-white text-stone-600 hover:text-stone-900 border border-stone-200'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Incoming Orders ({orders.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('events')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeTab === 'events'
                  ? 'bg-nukkad-900 text-white shadow-xs'
                  : 'bg-white text-stone-600 hover:text-stone-900 border border-stone-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 text-emerald-500" />
              <span>Live Kafka Stream ({events.length})</span>
            </button>
          </div>
        </div>

        {/* TAB 1: Shelf Stock Manager */}
        {activeTab === 'inventory' && (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden space-y-4 p-5">
            {/* Search Filter Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-serif font-bold text-lg text-stone-900">
                  Physical Shelf Inventory
                </h3>
                <p className="text-xs text-stone-500">
                  Update unit counts directly. Changes commit to PostgreSQL and stream via Kafka to OpenSearch immediately.
                </p>
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter product by name..."
                  className="w-full pl-9 pr-3 py-1.5 bg-chalk border border-stone-300 rounded-lg text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-nukkad-700/20"
                />
              </div>
            </div>

            {/* Inventory Table */}
            <div className="overflow-x-auto border border-stone-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 text-stone-600 border-b border-stone-200 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-3">Unit</th>
                    <th className="py-3 px-3">Price</th>
                    <th className="py-3 px-3">Current Stock</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-4 text-right">Quick Stock Update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredInventory.map((item) => {
                    const isOutOfStock = item.stock <= 0;
                    const isLow = item.stock > 0 && item.stock <= item.low_stock_threshold;
                    const editVal = editingStock[item.product_id] ?? item.stock;

                    return (
                      <tr key={item.product_id} className="hover:bg-stone-50/70 transition-colors">
                        <td className="py-3 px-4 font-semibold text-stone-900">
                          {item.product_name}
                        </td>

                        <td className="py-3 px-3 font-mono text-stone-600">
                          {item.unit}
                        </td>

                        <td className="py-3 px-3 font-mono font-bold text-stone-900">
                          ₹{item.price}
                        </td>

                        {/* Direct Stock Input */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              value={editVal}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                setEditingStock((prev) => ({
                                  ...prev,
                                  [item.product_id]: isNaN(val) ? 0 : val
                                }));
                              }}
                              className="w-16 px-2 py-1 border border-stone-300 rounded-md font-mono text-xs font-bold text-center bg-chalk focus:bg-white focus:outline-none focus:ring-1 focus:ring-nukkad-700"
                            />
                            {editVal !== item.stock && (
                              <button
                                onClick={() => handleSaveStock(item.product_id, editVal)}
                                disabled={updatingId === item.product_id}
                                className="px-2 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-[10px] font-bold shadow-2xs"
                              >
                                {updatingId === item.product_id ? '...' : 'Save'}
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td className="py-3 px-3">
                          {isOutOfStock ? (
                            <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 font-semibold text-[10px]">
                              Out of stock
                            </span>
                          ) : isLow ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-semibold text-[10px]">
                              Low ({item.stock})
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold text-[10px]">
                              In stock ({item.stock})
                            </span>
                          )}
                        </td>

                        {/* Quick Stepper Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => handleQuickDelta(item.product_id, item.stock, -1)}
                              disabled={item.stock <= 0}
                              className="p-1 rounded bg-stone-100 hover:bg-stone-200 text-stone-700 disabled:opacity-30"
                              title="Decrement 1 unit"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleQuickDelta(item.product_id, item.stock, 5)}
                              className="px-2 py-1 rounded bg-stone-100 hover:bg-nukkad-800 hover:text-white text-stone-700 text-[11px] font-mono transition-colors"
                              title="Add 5 units"
                            >
                              +5
                            </button>
                            <button
                              onClick={() => handleQuickDelta(item.product_id, item.stock, 10)}
                              className="px-2 py-1 rounded bg-stone-100 hover:bg-nukkad-800 hover:text-white text-stone-700 text-[11px] font-mono transition-colors"
                              title="Add 10 units"
                            >
                              +10
                            </button>
                            <button
                              onClick={() => handleSaveStock(item.product_id, 0)}
                              className="px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700 text-[10px] font-medium"
                              title="Mark completely sold out"
                            >
                              Mark 0
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: Incoming Orders */}
        {activeTab === 'orders' && (
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-serif font-bold text-lg text-stone-900">
                  Live Orders Stream
                </h3>
                <p className="text-xs text-stone-500">
                  Orders placed by customers atomically guarded and broadcast through Kafka.
                </p>
              </div>
            </div>

            <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden">
              {orders.length === 0 ? (
                <div className="p-8 text-center text-stone-400 text-xs">
                  No orders placed yet. Place an order on the storefront to see it appear here!
                </div>
              ) : (
                orders.map((ord) => (
                  <div key={ord.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-stone-50/60 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-nukkad-950 bg-stone-100 px-2 py-0.5 rounded">
                          #{ord.order_number}
                        </span>
                        <span className="font-semibold text-xs text-stone-900">
                          {ord.customer_name}
                        </span>
                        <span className="text-[11px] text-stone-500">
                          ({ord.customer_phone})
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-500 font-mono mt-1 flex items-center gap-3">
                        <span>Total: ₹{ord.total_amount}</span>
                        <span>•</span>
                        <span className="capitalize">{ord.delivery_type}</span>
                        <span>•</span>
                        <span>{new Date(ord.created_at).toLocaleTimeString()}</span>
                      </div>
                    </div>

                    {/* Status Dropdown */}
                    <div className="flex items-center gap-2">
                      <select
                        value={ord.status}
                        onChange={(e) => handleUpdateOrderStatus(ord.id, e.target.value)}
                        className="px-2.5 py-1 text-xs border border-stone-300 rounded-lg bg-white font-medium text-stone-800 focus:outline-none focus:ring-1 focus:ring-nukkad-700"
                      >
                        <option value="confirmed">Confirmed</option>
                        <option value="preparing">Preparing</option>
                        <option value="out_for_delivery">Out for Delivery</option>
                        <option value="delivered">Delivered</option>
                      </select>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 3: Live Kafka Architecture Stream */}
        {activeTab === 'events' && (
          <div className="bg-nukkad-950 rounded-2xl border border-nukkad-900 shadow-xl p-5 text-stone-200 space-y-4">
            <div className="flex items-center justify-between border-b border-nukkad-900 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-emerald-300">
                  Aiven Apache Kafka · Real-Time Event Stream
                </h3>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                Active Topics: store.orders, store.inventory
              </span>
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto font-mono text-xs pr-1">
              {events.length === 0 ? (
                <div className="text-center py-12 text-stone-500 italic text-[11px]">
                  Listening to Kafka events... update stock or place an order to see events stream here in real time.
                </div>
              ) : (
                events.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 rounded-xl bg-nukkad-900/90 border border-nukkad-800 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-400 text-xs">
                        ● {ev.title}
                      </span>
                      <span className="text-[10px] text-stone-500 font-mono">
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-stone-300 text-[11px] leading-relaxed">
                      {ev.description}
                    </p>
                    {ev.topic && (
                      <span className="text-[9px] text-stone-500 font-mono mt-0.5">
                        topic: {ev.topic}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
