import React from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { StorefrontPage } from './components/StorefrontPage';
import { CustomerOrders } from './components/CustomerOrders';
import { CustomerLoginPage } from './components/CustomerLoginPage';
import { ShopkeeperLoginPage } from './components/ShopkeeperLoginPage';
import { StoreDashboard } from './components/StoreDashboard';

const Router = window.location.protocol === 'nukkad:' ? HashRouter : BrowserRouter;

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Customer Shopper Endpoints */}
          <Route path="/" element={<StorefrontPage />} />
          <Route path="/demos" element={<Navigate to="/store/dashboard?tab=database" replace />} />
          <Route path="/orders" element={<CustomerOrders />} />
          <Route path="/login" element={<CustomerLoginPage />} />

          {/* Shopkeeper Merchant Portal Endpoints */}
          <Route path="/store/login" element={<ShopkeeperLoginPage />} />
          <Route path="/store/dashboard" element={<StoreDashboard />} />

          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
};

export default App;
