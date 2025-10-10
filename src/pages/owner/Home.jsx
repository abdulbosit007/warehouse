import ProductsTable from "../../components/ProductsTable";
import useCurrentUser from "../../hooks/useCurrentUser";
import { CircularProgress } from "@mui/material";

export default function OwnerHome() {
  const { loading, error, roleBase } = useCurrentUser();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <CircularProgress style={{ color: "black" }} />
          <div className="text-gray-700">Loading user…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return <Blocked title="Error" message={error} />;
  }

  if (roleBase !== "owner") {
    return <Blocked title="Forbidden" message="Owner access only." />;
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Owner — Home</h1>
      <ProductsTable />
    </div>
  );
}

function Blocked({ title, message }) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="max-w-md p-6 bg-white border border-gray-200 rounded-2xl">
        <h2 className="mb-2 text-xl font-semibold">{title}</h2>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
}
