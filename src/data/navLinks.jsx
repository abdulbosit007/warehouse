// src/data/navLinks.js
import {
  Home,
  GitBranch,
  ClipboardList,
  Clock,
  Users,
  Package,
  User,
  UserCircle,
  Wrench,
} from "lucide-react";

// WAREHOUSE LINKS
export const warehouseLinks = [
  { to: "/warehouse/home", label: "Home", icon: <Home className="w-4 h-4" /> },
  {
    to: "/warehouse/branch-requests",
    label: "Branch Requests",
    icon: <GitBranch className="w-4 h-4" />,
  },
  {
    to: "/warehouse/owner-requests",
    label: "Owner Requests",
    icon: <ClipboardList className="w-4 h-4" />,
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

export const ownerLinks = [
  { to: "/owner/home", label: "Home", icon: <Home className="w-4 h-4" /> },
  {
    to: "/owner/requests",
    label: "Requests",
    icon: <ClipboardList className="w-4 h-4" />,
  },
  {
    to: "/owner/incoming-product-fix",
    label: "Incoming Product Fix",
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

// BRANCH LINKS — pass branchId
export const branchLinks = (branchId) => [
  {
    to: `/branch/${branchId}/home`,
    label: "Home",
    icon: <Home className="w-4 h-4" />,
  },
  {
    to: `/branch/${branchId}/requests`,
    label: "Requests",
    icon: <ClipboardList className="w-4 h-4" />,
  },
  {
    to: `/branch/${branchId}/branch-requests`,
    label: "Branch Requests",
    icon: <GitBranch className="w-4 h-4" />,
  },
  {
    to: `/branch/${branchId}/history`,
    label: "History",
    icon: <Clock className="w-4 h-4" />,
  },
  {
    to: `/branch/${branchId}/profile`,
    label: "Profile",
    icon: <UserCircle className="w-4 h-4" />,
  },
];
