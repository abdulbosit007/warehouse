import { useParams, useNavigate } from "react-router-dom";
import { branchLinks } from "../data/navLinks";
import Navbar from "../components/Navbar";
import { getBranchIdFromRole, isOwner, isWarehouse } from "../utils/roleUtils";
import { useMemo, useEffect } from "react";
import { Outlet } from "react-router-dom";

export default function BranchLayout({ user }) {
  const navigate = useNavigate();
  const params = useParams();
  const routeId = params.id ?? null;

  const roleName = user?.user_role?.name || user?.roleName || "";
  const myBranchId = useMemo(() => getBranchIdFromRole(roleName), [roleName]);
  const canViewAny = isOwner(roleName) || isWarehouse(roleName);

  useEffect(() => {
    if (!canViewAny && myBranchId && routeId !== myBranchId) {
      navigate(`/branch/${myBranchId}`, { replace: true });
    }
  }, [canViewAny, myBranchId, routeId, navigate]);

  const effectiveId = routeId || myBranchId;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar
        user={user}
        links={branchLinks(effectiveId)} // ✅ pass branchId-aware links
        brand={{
          code: effectiveId ? `B-${effectiveId}` : "B",
          title: effectiveId ? `Branch ${effectiveId}` : "Branch",
        }}
      />
      <main className="mx-auto max-w-7xl p-3 md:p-6">
        <Outlet context={{ branchId: effectiveId }} />
      </main>
    </div>
  );
}
