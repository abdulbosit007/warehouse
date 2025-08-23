// src/pages/branch/Home.jsx
import { useParams } from "react-router-dom";
export default function BranchHome() {
  const { id } = useParams(); // e.g., "1"
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Branch {id} — Home</h1>
    </div>
  );
}
