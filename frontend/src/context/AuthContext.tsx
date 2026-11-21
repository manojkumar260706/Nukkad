import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { loginApi, registerApi, getMeApi } from '../api/client';

interface AuthContextType {
  customer: User | null;
  shopkeeper: User | null;
  customerToken: string | null;
  shopkeeperToken: string | null;
  loginCustomer: (email: string, password: string) => Promise<void>;
  registerCustomer: (input: { name: string; email: string; password: string; phone?: string }) => Promise<void>;
  loginShopkeeper: (email: string, password: string) => Promise<void>;
  logoutCustomer: () => void;
  logoutShopkeeper: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [customer, setCustomer] = useState<User | null>(null);
  const [shopkeeper, setShopkeeper] = useState<User | null>(null);
  const [customerToken, setCustomerToken] = useState<string | null>(localStorage.getItem('nukkad_customer_token'));
  const [shopkeeperToken, setShopkeeperToken] = useState<string | null>(localStorage.getItem('nukkad_shopkeeper_token'));

  // Restore sessions on mount
  useEffect(() => {
    if (customerToken) {
      getMeApi(customerToken)
        .then(({ user }) => setCustomer(user))
        .catch(() => {
          localStorage.removeItem('nukkad_customer_token');
          setCustomerToken(null);
        });
    }
    if (shopkeeperToken) {
      getMeApi(shopkeeperToken)
        .then(({ user }) => setShopkeeper(user))
        .catch(() => {
          localStorage.removeItem('nukkad_shopkeeper_token');
          setShopkeeperToken(null);
        });
    }
  }, []);

  const loginCustomer = async (email: string, password: string) => {
    const { user, token } = await loginApi({ email, password, expectedRole: 'customer' });
    setCustomer(user);
    setCustomerToken(token);
    localStorage.setItem('nukkad_customer_token', token);
  };

  const registerCustomer = async (input: { name: string; email: string; password: string; phone?: string }) => {
    const { user, token } = await registerApi({ ...input, role: 'customer' });
    setCustomer(user);
    setCustomerToken(token);
    localStorage.setItem('nukkad_customer_token', token);
  };

  const loginShopkeeper = async (email: string, password: string) => {
    const { user, token } = await loginApi({ email, password, expectedRole: 'shopkeeper' });
    setShopkeeper(user);
    setShopkeeperToken(token);
    localStorage.setItem('nukkad_shopkeeper_token', token);
  };

  const logoutCustomer = () => {
    setCustomer(null);
    setCustomerToken(null);
    localStorage.removeItem('nukkad_customer_token');
  };

  const logoutShopkeeper = () => {
    setShopkeeper(null);
    setShopkeeperToken(null);
    localStorage.removeItem('nukkad_shopkeeper_token');
  };

  return (
    <AuthContext.Provider
      value={{
        customer,
        shopkeeper,
        customerToken,
        shopkeeperToken,
        loginCustomer,
        registerCustomer,
        loginShopkeeper,
        logoutCustomer,
        logoutShopkeeper
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
