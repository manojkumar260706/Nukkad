import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Category, Product, CartItem, Store } from '../types';
import {
  fetchCategories,
  searchProductsApi,
  createOrderApi,
  fetchStores,
  createEventSource
} from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Navbar } from './Navbar';
import { defaultSearchFilters, SearchBar } from './SearchBar';
import { ProductCard } from './ProductCard';
import { playPaymentAnimation } from './paymentAnimation';
import { ShoppingPlanner } from './ShoppingPlanner';
import { CartDrawer } from './CartDrawer';
import { RaceBattleModal } from './RaceBattleModal';
import { ShoppingBag, ChevronRight, Search as SearchIcon } from 'lucide-react';

export const StorefrontPage: React.FC = () => {
  const { customer, shopkeeper } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [filters, setFilters] = useState(defaultSearchFilters);
  const searchRequest = useRef<AbortController>();
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [totalResults, setTotalResults] = useState<number>(0);
  const [page, setPage] = useState(1);
  const [isSearching, setIsSearching] = useState(true);

  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isRaceModalOpen, setIsRaceModalOpen] = useState<boolean>(false);

  const [location, setLocation] = useState<{ latitude: number; longitude: number }>();
  const [stores, setStores] = useState<Store[]>([]);
  const [cartNotice, setCartNotice] = useState('');
  const [checkingStore, setCheckingStore] = useState(false);
  useEffect(() => {
    let active = true;
    navigator.geolocation?.getCurrentPosition(({ coords }) => {
      if (active) setLocation({ latitude: coords.latitude, longitude: coords.longitude });
    }, () => {}, { timeout: 5000, maximumAge: 60000 });
    return () => { active = false; };
  }, []);
  const cartStoreId = cart[0]?.product.store_id;
  const cartStore = stores.find(store => store.id === cartStoreId);
  const cartStoreName = cart[0]?.product.store_name || cartStore?.name || 'your current store';

  useEffect(() => {
    fetchStores().then(setStores).catch(console.error);
  }, []);

  // Load categories
  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch((err) => console.error('Failed to load categories:', err));
  }, []);

  // Search products
  const executeSearch = useCallback(async () => {
    searchRequest.current?.abort();
    const request = new AbortController();
    searchRequest.current = request;
    setIsSearching(true);
    try {
      const data = await searchProductsApi({
        q: submittedQuery,
        nearest: true,
        ...location,
        page,
        category: selectedCategory,
        minPrice: filters.minPrice === '' ? undefined : Number(filters.minPrice),
        maxPrice: filters.maxPrice === '' ? undefined : Number(filters.maxPrice),
        inStockOnly: filters.inStockOnly,
        sort: filters.sort || undefined
      }, request.signal);
      if (request.signal.aborted) return;
      setProducts(data.hits);
      setTotalResults(data.total);
    } catch (err) {
      if (request.signal.aborted) return;
      if (request === searchRequest.current) {
        setProducts([]);
        setTotalResults(0);
      }
      console.error('Search error:', err);
    } finally {
      if (request === searchRequest.current && !request.signal.aborted) {
        searchRequest.current = undefined;
        setIsSearching(false);
      }
    }
  }, [submittedQuery, selectedCategory, filters, location, page]);

  useEffect(() => {
    if (searchQuery.trim() === submittedQuery) return;
    const timer = window.setTimeout(() => {
      setPage(1);
      setSubmittedQuery(searchQuery.trim());
    }, 200);
    return () => window.clearTimeout(timer);
  }, [searchQuery, submittedQuery]);

  const refreshSearch = useRef(executeSearch);
  useEffect(() => {
    refreshSearch.current = executeSearch;
    void executeSearch();
    return () => searchRequest.current?.abort();
  }, [executeSearch]);

  useEffect(() => {
    const eventSource = createEventSource();
    let timer: number | undefined;
    eventSource.onmessage = event => {
      try {
        const { type } = JSON.parse(event.data);
        if (timer !== undefined || !['database.changed', 'inventory.changed', 'order.placed', 'order.held', 'search.synced'].includes(type)) return;
        timer = window.setTimeout(() => {
          timer = undefined;
          void refreshSearch.current();
        }, 250);
      } catch (err) {
        console.error('Error processing SSE:', err);
      }
    };
    return () => {
      window.clearTimeout(timer);
      eventSource.close();
    };
  }, []);

  // Cart operations
  const handleAddToCart = async (product: Product) => {
    if (checkingStore) return;
    setCartNotice('');
    const needsMatch = Boolean(cartStoreId && cartStoreId !== product.store_id);
    if (needsMatch && cartStoreId) {
      setCheckingStore(true);
      try {
        const { hits } = await searchProductsApi({ storeId: cartStoreId, matchListing: product.id, inStockOnly: true });
        const match = hits[0];
        if (!match) {
          setCartNotice(`You can only check out from one store. ${cartStoreName} has no matching item in stock for ${product.name}.`);
          return;
        }
        product = match;
        setCartNotice(`Using ${match.name} from ${cartStoreName} at ₹${match.price} per ${match.unit}.`);
      } catch {
        setCartNotice(`Could not check availability at ${cartStoreName}. Try again.`);
        return;
      } finally {
        setCheckingStore(false);
      }
    }
    setCart((prev) => {
      if ((needsMatch || prev.length) && prev[0]?.product.store_id !== product.store_id) return prev;
      const existing = prev.find((item) => item.product.product_id === product.product_id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        return prev.map((item) =>
          item.product.product_id === product.product_id
            ? { product, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    setCart((prev) => {
      if (quantity <= 0) {
        return prev.filter((item) => item.product.product_id !== productId);
      }
      return prev.map((item) =>
        item.product.product_id === productId ? { ...item, quantity } : item
      );
    });
  };

  const handleClearCart = () => { setCart([]); setCartNotice(''); };

  const handlePlaceOrder = async (orderData: {
    customerName: string;
    customerPhone: string;
    deliveryType: 'delivery' | 'pickup';
    address?: string;
    postalCode?: string;
  }) => {
    if (!cartStoreId || cart.some(item => item.product.store_id !== cartStoreId)) {
      throw new Error('Your cart must contain items from one store.');
    }
    // Open during the click so browsers allow the tab before checkout finishes.
    const paymentTab = window.open('about:blank', '_blank');
    let bagAnimation: Animation | undefined;
    if (paymentTab) {
      paymentTab.opener = null;
      paymentTab.document.title = 'Opening Razorpay';
      const { document: paymentDocument } = paymentTab;
      bagAnimation = playPaymentAnimation(paymentDocument.body);
    }

    try {
      const { order } = await createOrderApi({
        storeId: cartStoreId,
        ...orderData,
        items: cart.map((item) => ({
          productId: item.product.product_id,
          quantity: item.quantity
        }))
      });

      const animation = bagAnimation;
      if (order.paymentUrl && paymentTab && !paymentTab.closed && animation) {
        await new Promise<void>(resolve => {
          // A closed tab cannot finish its animation. Fall back to this tab.
          const checkTab = window.setInterval(() => {
            if (paymentTab.closed) finish();
          }, 100);
          function finish() {
            window.clearInterval(checkTab);
            resolve();
          }
          animation.finished.then(finish, finish);
        });
      }

      handleClearCart();
      setIsCartOpen(false);

      if (order.paymentUrl && paymentTab && !paymentTab.closed) {
        paymentTab.location.replace(order.paymentUrl);
      } else if (order.paymentUrl) {
        window.location.assign(order.paymentUrl);
        return;
      } else {
        paymentTab?.close();
      }
      navigate('/orders');
    } catch (error) {
      paymentTab?.close();
      throw error;
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen bg-chalk flex flex-col justify-between selection:bg-nukkad-100 font-sans">
      <div>
        {/* Clean Shopper Navbar */}
        <Navbar
          location={location ? 'Near you' : 'All stores'}
          cartCount={cartCount}
          cartTotal={cartTotal}
          onOpenCart={() => setIsCartOpen(true)}
          onOpenRaceTest={shopkeeper && import.meta.env.VITE_ENABLE_DEMO_ACCOUNTS === 'true' ? () => setIsRaceModalOpen(true) : undefined}
        />

        <SearchBar
          filters={filters}
          setFilters={value => { setPage(1); setFilters(value); }}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          categories={categories}
          selectedCategory={selectedCategory}
          setSelectedCategory={value => { setPage(1); setSelectedCategory(value); }}
          isSearching={isSearching}
          onSearchSubmit={() => {
            if (searchQuery.trim() === submittedQuery) void executeSearch();
            else {
              setPage(1);
              setSubmittedQuery(searchQuery.trim());
            }
          }}
        />

        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-serif text-2xl font-bold tracking-tight text-nukkad-950 sm:text-3xl">
                {categories.find(category => category.id === selectedCategory)?.name || 'Groceries & essentials'}
              </h1>
              <p className="mt-1 text-sm text-stone-600">{location ? 'Nearest available listings' : 'Browse listings from all stores'}</p>
            </div>
            <p aria-live="polite" className="text-sm text-stone-600">{totalResults} {totalResults === 1 ? 'item' : 'items'}</p>
          </div>
        </div>

        {/* Product Card Grid */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {products.length === 0 && isSearching ? (
            <div role="status" className="grid min-h-48 place-items-center text-sm text-stone-600">Loading products…</div>
          ) : products.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-stone-300 p-8 space-y-3">
              <SearchIcon className="w-10 h-10 text-stone-400 mx-auto stroke-1" />
              <h3 className="font-serif font-bold text-lg text-stone-800">
                {searchQuery.trim() ? `No results for “${searchQuery}”` : 'No products to show'}
              </h3>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                Try searching for staples like "atta", "rice", "oil", or dairy like "amul milk".
              </p>
              <button
                onClick={() => {
                  setPage(1);
                  setSearchQuery('');
                  setSubmittedQuery('');
                  setSelectedCategory('all');
                  setFilters(defaultSearchFilters);
                }}
                className="mt-2 px-4 py-2 bg-nukkad-800 text-white rounded-xl text-xs font-semibold"
              >
                View All Products
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-5">
              {products.map((product) => {
                const cartItem = cart.find((i) => i.product.store_id === product.store_id && i.product.product_id === product.product_id);
                return (
                  <ProductCard
                    key={product.id}
                    product={product}
                    cartQuantity={cartItem?.quantity || 0}
                    onAddToCart={handleAddToCart}
                    onUpdateQuantity={handleUpdateQuantity}
                  />
                );
              })}
            </div>
          )}
        </div>

        {(page > 1 || totalResults > page * 24) && (
          <nav aria-label="Search pages" className="flex items-center justify-center gap-4 pb-5 text-sm">
            <button className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={page === 1 || isSearching} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {page}</span>
            <button className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={totalResults <= page * 24 || isSearching} onClick={() => setPage(page + 1)}>Next</button>
          </nav>
        )}

        {/* Floating Bottom Cart Bar (Deck Slide 1: "2 items · ₹450 View cart ›") */}
        {cartCount > 0 && (
          <div className="fixed bottom-4 inset-x-0 z-30 px-4 sm:px-6 pointer-events-none">
            <div className="max-w-md mx-auto pointer-events-auto">
              {cartNotice && (
                <p role="alert" className="mb-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  {cartNotice}
                </p>
              )}
              <button
                onClick={() => { setCartNotice(''); setIsCartOpen(true); }}
                className="w-full bg-nukkad-900 hover:bg-black text-white py-3.5 px-5 rounded-2xl shadow-xl flex items-center justify-between transition-all transform active:scale-[0.99] border border-nukkad-800"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-300">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div className="text-left font-sans">
                    <span className="font-bold text-sm block leading-none">
                      {cartCount} {cartCount === 1 ? 'item' : 'items'} · ₹{cartTotal}
                    </span>
                    <span className="text-[11px] text-emerald-300/80 leading-tight">
                      {cartStoreName}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-xs font-bold text-emerald-300">
                  <span>View cart</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            </div>
          </div>
        )}
      </div>


      <ShoppingPlanner cartVisible={cartCount > 0} cartOpen={isCartOpen} storefrontLocation={location}
        localities={[...new Set(stores.map(store => store.locality?.trim()).filter(Boolean))]} />

      {/* Cart & Checkout Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        key={customer?.id || 'guest'}
        customerName={customer?.name || ''}
        customerPhone={customer?.phone || ''}
        signedIn={Boolean(customer)}
        storeAddress={cartStore?.address}
        storePin={cartStore?.pin ?? undefined}
        items={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onClearCart={handleClearCart}
        onPlaceOrder={handlePlaceOrder}
      />

      {/* Race Condition Battle Modal */}
      <RaceBattleModal
        isOpen={isRaceModalOpen}
        onClose={() => setIsRaceModalOpen(false)}
      />

      {/* Clean Minimal Footer */}
      <footer className="bg-white border-t border-stone-200 py-6 px-4 sm:px-6 mt-12 text-xs text-stone-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 font-sans">
          <div className="flex items-center gap-2">
            <span className="font-serif font-bold text-stone-900 text-sm">Nukkad</span>
            <span>· Real-time retail storefront</span>
          </div>

          <div className="text-[11px] text-stone-400">
            © 2024 Nukkad Technologies Inc.
          </div>

        </div>
      </footer>
    </div>
  );
};
