// src/pages/branch/Home.jsx
import { useParams } from "react-router-dom";
import ProductSearch from "../../components/ProductSearch";
export default function BranchHome() {
  const { id } = useParams(); // e.g., "1"
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Branch {id} — Home</h1>
      <ProductSearch scope="branch" branchId={id} countField="total_qty" />
    </div>
  );
}
