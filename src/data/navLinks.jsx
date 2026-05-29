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
  Settings,
  Activity,
  BarChart2,
} from "lucide-react";

/* -----------------------------
   WAREHOUSE LINKS
----------------------------- */
export const warehouseLinks = [
  {
    to: "/warehouse/home",
    label: "nav.home",
    icon: <Home className="w-4 h-4" />,
  },
  {
    to: "/warehouse/branch-requests",
    label: "nav.branchRequests",
    icon: <GitBranch className="w-4 h-4" />,
    badgeKey: "branchRequests",
  },
  {
    to: "/warehouse/owner-requests",
    label: "nav.incomingBatches",
    icon: <ClipboardList className="w-4 h-4" />,
    badgeKey: "incomingBatches",
  },
  {
    to: "/warehouse/inventory-management",
    label: "nav.inventoryManagement",
    icon: <ClipboardCheck className="w-4 h-4" />,
  },
  {
    to: "/warehouse/profile",
    label: "nav.profile",
    icon: <User className="w-4 h-4" />,
  },
];

/* -----------------------------
   OWNER LINKS
----------------------------- */
export const ownerLinks = [
  {
    to: "/owner/home",
    label: "nav.home",
    icon: <Home className="w-4 h-4" />,
  },
  {
    to: "/owner/history",
    label: "Analytics & Logs",
    icon: <Activity className="w-4 h-4" />,
  },
  {
    to: "/owner/branch-requests",
    label: "nav.branchRequests",
    icon: <GitBranch className="w-4 h-4" />,
  },
  {
    to: "/owner/inventory-batches",
    label: "nav.inventoryBatches",
    icon: <ClipboardList className="w-4 h-4" />,
    badgeKey: "inventoryBatches",
  },
  {
    to: "/owner/incoming-product",
    label: "nav.incomingBatches",
    icon: <Wrench className="w-4 h-4" />,
  },
  {
    to: "/owner/settings",
    label: "nav.settings",
    icon: <Settings className="w-4 h-4" />,
  },
  {
    to: "/owner/profile",
    label: "nav.profile",
    icon: <UserCircle className="w-4 h-4" />,
  },
];

/* -----------------------------
   BRANCH LINKS
   - Accepts optional branchId
   - Safely falls back to `/branch` if undefined
----------------------------- */
export const branchLinks = (branchId) => {
  const base = branchId ? `/branch/${branchId}` : "/branch";

  return [
    {
      to: `${base}/home`,
      label: "nav.home",
      icon: <Home className="w-4 h-4" />,
    },
    {
      to: `${base}/inventory-management`,
      label: "nav.inventoryManagement",
      icon: <ClipboardCheck className="w-4 h-4" />,
    },
    {
      to: `${base}/branch-requests`,
      label: "nav.branchRequests",
      icon: <GitBranch className="w-4 h-4" />,
      badgeKey: "branchRequests",
    },
    {
      to: `${base}/history`,
      label: "nav.operations",
      icon: <Clock className="w-4 h-4" />,
    },
    {
      to: `${base}/profile`,
      label: "nav.profile",
      icon: <UserCircle className="w-4 h-4" />,
    },
  ];
};
