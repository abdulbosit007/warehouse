import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Auth + layouts
import SignIn from "../layouts/SignIn"
import WarehouseLayout from "../layouts/WarehouseLayout";
import OwnerLayout from "../layouts/OwnerLayout";
import BranchLayout from "../layouts/BranchLayout";

// Pages
import WarehouseHome from "../pages/warehouse/Home";
import OwnerHome from "../pages/owner/Home";
import BranchHome from "../pages/branch/Home";
import Profile from "../pages/Profile";

// Route guard
function Protected({ user, children }) {
    if (!user) return <Navigate to="/" replace />
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
                    <Route path="profile" element={<Profile />} />
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
                    <Route path="home" element={<BranchHome />} />
                    <Route path="profile" element={<Profile />} />
                </Route>

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}