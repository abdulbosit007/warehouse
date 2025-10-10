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

// Owner Pages
import OwnerIncomingProducts from "../pages/owner/IncomingProducts";
import OwnerHistory from "../pages/owner/History";
import OwnerRequests from "../pages/owner/Requests";
import OwnerUserManagement from "../pages/owner/UserManagement";
import BatchDetail from "../pages/owner/BatchDetail";
import OwnerHome from "../pages/owner/Home";

// Branch Pages
import BranchRequests from "../pages/branch/Requests";
import BranchHistory from "../pages/branch/History";
import BranchBranchRequests from "../pages/branch/BranchRequests";
import BranchHome from "../pages/branch/Home";

// Shared
import Profile from "../pages/Profile";
import { useEffect, useRef, useState } from "react";

/**
 * Protected route:
 * - waits a short moment before redirecting (avoids bounce during session restore),
 * - redirects to "/" only if user is truly absent.
 */
function Protected({ user, children }) {
  const [ready, setReady] = useState(false);
  const tRef = useRef(null);
  useEffect(() => {
    tRef.current = setTimeout(() => setReady(true), 200); // small grace
    return () => clearTimeout(tRef.current);
  }, []);
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading…
      </div>
    );
  }
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
          <Route path="requests" element={<OwnerRequests />} />
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
          <Route path="requests" element={<BranchRequests />} />
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
          <Route path="requests" element={<BranchRequests />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
