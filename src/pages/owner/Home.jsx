// src/pages/owner/Home.jsx
import ProductSearch from "../../components/ProductSearch";
import ProductsTable from "../../components/ProductsTable";
export default function OwnerHome() {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Owner — Home</h1>
      <ProductSearch scope="owner" countField="total_qty" />
      <ProductsTable scope="owner" />
    </div>
  );
}
