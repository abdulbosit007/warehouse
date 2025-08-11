// src/pages/owner/Home.jsx
import ProductSearch from "../../components/ProductSearch";
export default function OwnerHome() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Owner — Home</h1>
      <ProductSearch scope="owner" countField="total_qty" />
    </div>
  );
}
