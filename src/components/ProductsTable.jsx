// src/components/ProductsTable.jsx
import { useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import { useProducts } from "../hooks/useProducts";

const COLS = [
  { id: "id",    label: "ID",    sortable: true, width: 160 },
  { id: "name",  label: "Name",  sortable: true },
  { id: "sku",   label: "SKU",   sortable: true, width: 160 },
  { id: "price", label: "Price", sortable: true, width: 120, align: "right" },
];

export default function ProductsTable() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  const { rows, total, loading, error } = useProducts({
    page, pageSize, search, sortBy, sortDir,
  });

  const onSort = (col) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir("asc"); }
  };

  return (
    <Paper elevation={0} sx={{ p: 2, border: "1px solid #eef0f3", borderRadius: 2 }}>
      <Toolbar sx={{ px: 0, pb: 2, gap: 2, flexWrap: "wrap" }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>Products</Typography>
        <TextField
          size="small"
          placeholder="Search by name or SKU"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
      </Toolbar>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {COLS.map((c) => (
                <TableCell
                  key={c.id}
                  sx={{ width: c.width }}
                  align={c.align || "left"}
                  sortDirection={sortBy === c.id ? sortDir : false}
                >
                  {c.sortable ? (
                    <TableSortLabel
                      active={sortBy === c.id}
                      direction={sortBy === c.id ? sortDir : "asc"}
                      onClick={() => onSort(c.id)}
                    >
                      {c.label}
                    </TableSortLabel>
                  ) : c.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={COLS.length}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <CircularProgress size={18} /> Loading…
                  </Box>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLS.length}>No data</TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.id}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.sku}</TableCell>
                  <TableCell align="right">
                    {r.price != null ? Number(r.price).toLocaleString() : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_e, p) => setPage(p)}
        rowsPerPage={pageSize}
        onRowsPerPageChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[5, 10, 25, 50]}
      />
    </Paper>
  );
}
