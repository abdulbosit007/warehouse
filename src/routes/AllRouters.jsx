import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Auth + layouts
import SignIn from "../layouts/SignIn";
import WarehouseLayout from "../layouts/WarehouseLayout";
import OwnerLayout from "../layouts/OwnerLayout";
import BranchLayout from "../layouts/BranchLayout";

//Warehouse Pages
import WarehouseHome from "../pages/warehouse/Home";
import WarehouseBranchRequests from "../pages/warehouse/BranchRequests";
import WarehouseHistory from "../pages/warehouse/History";
import WarehouseOwnerRequests from "../pages/warehouse/OwnerRequests";
import WarehouseBatchReview from "../pages/warehouse/BatchDetail";

//Owner Pages
import OwnerHome from "../pages/owner/Home";
import OwnerIncomingProducts from "../pages/owner/IncomingProducts";
import OwnerHistory from "../pages/owner/History";
import OwnerRequests from "../pages/owner/Requests";
import OwnerUserManagement from "../pages/owner/UserManagement";
import BatchDetail from "../pages/owner/BatchDetail";

//Branch Pages
import BranchHome from "../pages/branch/Home";
import BranchRequests from "../pages/branch/Requests";
import BranchHistory from "../pages/branch/History";
import BranchBranchRequests from "../pages/branch/BranchRequests";

//Profile Page
import Profile from "../pages/Profile";

// Route guard
function Protected({ user, children }) {
  if (!user) return <Navigate to="/" replace />;
  return children;
}

export default function AllRouters({ user }) {
  return (
    <BrowserRouter>
      <Routes>
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
          <Route path="/owner/batch/:id" element={<BatchDetail />} />
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
          <Route path="home" element={<OwnerHome />} />
          <Route path="history" element={<WarehouseHistory />} />
          <Route path="branch-requests" element={<WarehouseBranchRequests />} />
          <Route path="owner-requests" element={<WarehouseOwnerRequests />} />
          <Route
            path="/warehouse/batch/:id"
            element={<WarehouseBatchReview />}
          />
          <Route path="profile" element={<Profile />} />
        </Route>

        {/* BRANCH (dynamic id) */}
        <Route
          path="/branch/:id"
          element={
            <Protected user={user}>
              <BranchLayout user={user} />
            </Protected>
          }
        >
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<OwnerHome />} />
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
