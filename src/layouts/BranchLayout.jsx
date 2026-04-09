import { useParams, useNavigate, Navigate, Outlet } from "react-router-dom";
import { branchLinks } from "../data/navLinks";
import Navbar from "../components/Navbar";
import { getBranchIdFromRole, isOwner, isWarehouse } from "../utils/roleUtils";
import { useMemo, useEffect } from "react";
import useCurrentUser from "../hooks/useCurrentUser";
import useNavBadges from "../hooks/useNavBadges";

export default function BranchLayout({ user }) {
  const navigate = useNavigate();
  const params = useParams();
  const routeId = params.id ?? null;

  const { loading, roleBase, locationName, locationId } = useCurrentUser();
  const badges = useNavBadges({ roleBase, locationId });

  const roleName = user?.user_role?.name || user?.roleName || "";
  const myBranchId = useMemo(() => getBranchIdFromRole(roleName), [roleName]);
  const canViewAny = isOwner(roleName) || isWarehouse(roleName);

  useEffect(() => {
    if (!canViewAny && myBranchId && routeId !== myBranchId) {
      navigate(`/branch/${myBranchId}`, { replace: true });
    }
  }, [canViewAny, myBranchId, routeId, navigate]);

  // While loading, show nothing to prevent flash
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-neutral-500">Loading...</div>
      </div>
    );
  }

  // Redirect non-branch users to their appropriate dashboard
  if (roleBase !== "branch") {
    if (roleBase === "owner") {
      return <Navigate to="/owner/home" replace />;
    }
    if (roleBase === "warehouse") {
      return <Navigate to="/warehouse/home" replace />;
    }
    // Unknown role or not logged in - redirect to sign in
    return <Navigate to="/" replace />;
  }

  const effectiveId = routeId || myBranchId;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar
        user={user}
        links={branchLinks(effectiveId)} // ✅ pass branchId-aware links
        brand={{
          code: effectiveId ? `B-${effectiveId}` : "B",
          title: locationName || (effectiveId ? `Branch ${effectiveId}` : "Branch"),
        }}
        theme="emerald"
        badges={badges}
      />
      <main className="mx-auto max-w-7xl p-3 md:p-6">
        <Outlet context={{ branchId: effectiveId }} />
      </main>
    </div>
  );
}
