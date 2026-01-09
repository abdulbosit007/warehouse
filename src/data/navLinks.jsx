// src/data/navLinks.js
import {
  Home,
  GitBranch,
  ClipboardList,
  ClipboardCheck,
  Clock,
  Users,
  User,
  UserCircle,
  Wrench,
  AlertTriangle,
} from "lucide-react";

/* -----------------------------
   WAREHOUSE LINKS
----------------------------- */
export const warehouseLinks = [
  {
    to: "/warehouse/home",
    label: "Home",
    icon: <Home className="w-4 h-4" />,
  },
  {
    to: "/warehouse/branch-requests",
    label: "Branch Requests",
    icon: <GitBranch className="w-4 h-4" />,
  },
  {
    to: "/warehouse/owner-requests",
    label: "Incoming Batches",
    icon: <ClipboardList className="w-4 h-4" />,
  },
  {
    to: "/warehouse/stock-corrections",
    label: "Stock Corrections",
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  {
    to: "/warehouse/audit-review",
    label: "Audit Review",
    icon: <ClipboardCheck className="w-4 h-4" />,
  },
  {
    to: "/warehouse/history",
    label: "History",
    icon: <Clock className="w-4 h-4" />,
  },
  {
    to: "/warehouse/profile",
    label: "Profile",
    icon: <User className="w-4 h-4" />,
  },
];

/* -----------------------------
   OWNER LINKS
----------------------------- */
export const ownerLinks = [
  {
    to: "/owner/home",
    label: "Home",
    icon: <Home className="w-4 h-4" />,
  },
  {
    to: "/owner/inventory-batches",
    label: "Inventory Batches",
    icon: <ClipboardList className="w-4 h-4" />,
  },
  {
    to: "/owner/incoming-product",
    label: "Incoming Batches",
    icon: <Wrench className="w-4 h-4" />,
  },
  {
    to: "/owner/history",
    label: "History",
    icon: <Clock className="w-4 h-4" />,
  },
  {
    to: "/owner/user-management",
    label: "User Management",
    icon: <Users className="w-4 h-4" />,
  },
  {
    to: "/owner/profile",
    label: "Profile",
    icon: <UserCircle className="w-4 h-4" />,
  },
];

/* -----------------------------
   BRANCH LINKS
   - Accepts optional branchId
   - Safely falls back to `/branch` if undefined
----------------------------- */
export const branchLinks = (branchId) => {
  // ensure we never render links like "undefined/home"
  const base = branchId ? `/branch/${branchId}` : "/branch";
  return [
    {
      to: `${base}/home`,
      label: "Home",
      icon: <Home className="w-4 h-4" />,
    },
    {
      to: `${base}/stock-corrections`,
      label: "Stock Corrections",
      icon: <AlertTriangle className="w-4 h-4" />,
    },
    {
      to: `${base}/audit-review`,
      label: "Audit Review",
      icon: <ClipboardCheck className="w-4 h-4" />,
    },
    {
      to: `${base}/branch-requests`,
      label: "Branch Requests",
      icon: <GitBranch className="w-4 h-4" />,
    },
    {
      to: `${base}/history`,
      label: "Operations",
      icon: <Clock className="w-4 h-4" />,
    },
    {
      to: `${base}/profile`,
      label: "Profile",
      icon: <UserCircle className="w-4 h-4" />,
    },
  ];
};
