import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Auth + layouts
import SignIn from "../layouts/SignIn";
import WarehouseLayout from "../layouts/WarehouseLayout";
import OwnerLayout from "../layouts/OwnerLayout";
import BranchLayout from "../layouts/BranchLayout";

// Warehouse Pages
import WarehouseBranchRequests from "../pages/warehouse/BranchRequests";
import WarehouseHistory from "../pages/warehouse/History";
import WarehouseOwnerRequests from "../pages/warehouse/OwnerRequests";
import WarehouseBatchReview from "../pages/warehouse/BatchDetail";
import WarehouseHome from "../pages/warehouse/Home";
import WarehouseStockCorrections from "../pages/warehouse/StockCorrections";
import WarehouseAuditReview from "../pages/warehouse/AuditReview";

import OwnerIncomingProducts from "../pages/owner/IncomingProducts";
import OwnerHistory from "../pages/owner/History";
import OwnerInventoryBatches from "../pages/owner/InventoryBatches";
import OwnerInventoryBatchDetail from "../pages/owner/InventoryBatchDetail";
import OwnerAuditDetail from "../pages/owner/AuditDetail";
import OwnerUserManagement from "../pages/owner/UserManagement";
import BatchDetail from "../pages/owner/BatchDetail";
import OwnerHome from "../pages/owner/Home";

// Branch Pages
import BranchStockCorrections from "../pages/branch/StockCorrections";
import BranchHistory from "../pages/branch/History";
import BranchBranchRequests from "../pages/branch/BranchRequests";
import BranchHome from "../pages/branch/Home";
import BranchAuditReview from "../pages/branch/AuditReview";

// Shared
import Profile from "../pages/Profile";
// import { useEffect, useRef, useState } from "react";

/**
 * Protected route:
 * - waits a short moment before redirecting (avoids bounce during session restore),
 * - redirects to "/" only if user is truly absent.
 */
function Protected({ user, children }) {
  if (!user) return <Navigate to="/" replace />;
  return children;
}

export default function AllRouters({ user }) {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<SignIn />} />

        {/* OWNER */}
        <Route
          path="/owner"
          element={
            <Protected user={user}>
              <OwnerLayout user={user} />
            </Protected>
          }
        >
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<OwnerHome />} />
          <Route path="incoming-product" element={<OwnerIncomingProducts />} />
          <Route path="history" element={<OwnerHistory />} />
          <Route path="inventory-batches" element={<OwnerInventoryBatches />} />
          <Route path="inventory-batches/:locationId" element={<OwnerInventoryBatchDetail />} />
          <Route path="audit/:id" element={<OwnerAuditDetail />} />
          <Route path="user-management" element={<OwnerUserManagement />} />
          <Route path="profile" element={<Profile />} />
          <Route path="batch/:id" element={<BatchDetail />} />
        </Route>

        {/* WAREHOUSE */}
        <Route
          path="/warehouse"
          element={
            <Protected user={user}>
              <WarehouseLayout user={user} />
            </Protected>
          }
        >
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<WarehouseHome />} />
          <Route path="history" element={<WarehouseHistory />} />
          <Route path="branch-requests" element={<WarehouseBranchRequests />} />
          <Route path="owner-requests" element={<WarehouseOwnerRequests />} />
          <Route path="stock-corrections" element={<WarehouseStockCorrections />} />
          <Route path="audit-review" element={<WarehouseAuditReview />} />
          <Route path="batch/:id" element={<WarehouseBatchReview />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        {/* BRANCH — support BOTH /branch and /branch/:id */}
        <Route
          path="/branch"
          element={
            <Protected user={user}>
              <BranchLayout user={user} />
            </Protected>
          }
        >
          {/* bare /branch (owner/warehouse can land here; branch users will auto-redirect to their own id) */}
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<BranchHome />} />
          <Route path="history" element={<BranchHistory />} />
          <Route path="branch-requests" element={<BranchBranchRequests />} />
          <Route path="stock-corrections" element={<BranchStockCorrections />} />
          <Route path="audit-review" element={<BranchAuditReview />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        {/* parameterized /branch/:id (same layout; BranchLayout enforces access) */}
        <Route
          path="/branch/:id"
          element={
            <Protected user={user}>
              <BranchLayout user={user} />
            </Protected>
          }
        >
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<BranchHome />} />
          <Route path="history" element={<BranchHistory />} />
          <Route path="branch-requests" element={<BranchBranchRequests />} />
          <Route path="stock-corrections" element={<BranchStockCorrections />} />
          <Route path="audit-review" element={<BranchAuditReview />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
