// src/components/warehouse/AuditReviewContent.jsx
// Wrapper component that renders Audit Review content for the Inventory Management page

import WarehouseAuditReview from "../../pages/warehouse/AuditReview";

// For now, we re-export the existing component
// The InventoryManagement parent handles auth checks
export default function AuditReviewContent() {
  return <WarehouseAuditReview asTab />;
}
