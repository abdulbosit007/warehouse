// src/pages/warehouse/Home.jsx
import ProductSearch from "../../components/ProductSearch";
export default function WarehouseHome() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Warehouse — Home</h1>
      <ProductSearch scope="warehouse" countField="total_qty" />
    </div>
  );
}
