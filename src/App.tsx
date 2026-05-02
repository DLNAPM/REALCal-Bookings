/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Home } from './pages/Home';
import { PropertyDetail } from './pages/PropertyDetail';
import { Checkout } from './pages/Checkout';
import { Confirmation } from './pages/Confirmation';
import { AdminDashboard } from './pages/AdminDashboard';
import { MyBookings } from './pages/MyBookings';
import { OptIn } from './pages/OptIn';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { HelpModal } from './components/HelpModal';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
           <Route path="/" element={<Home />} />
           <Route path="/property/:id" element={<PropertyDetail />} />
           <Route path="/checkout" element={<Checkout />} />
           <Route path="/confirmation" element={<Confirmation />} />
           <Route path="/admin" element={<AdminDashboard />} />
           <Route path="/my-bookings" element={<MyBookings />} />
           <Route path="/opt-in" element={<OptIn />} />
           <Route path="/privacy" element={<PrivacyPolicy />} />
           <Route path="*" element={<Home />} />
        </Routes>
        <HelpModal />
      </BrowserRouter>
    </AuthProvider>
  );
}
