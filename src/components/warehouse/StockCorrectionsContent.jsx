// src/components/warehouse/StockCorrectionsContent.jsx
// Wrapper component that renders Stock Corrections content for the Inventory Management page

import WarehouseStockCorrections from "../../pages/warehouse/StockCorrections";

// For now, we re-export the existing component
// The InventoryManagement parent handles auth checks
export default function StockCorrectionsContent() {
  return <WarehouseStockCorrections asTab />;
}
