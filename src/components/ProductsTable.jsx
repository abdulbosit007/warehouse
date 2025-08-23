import { useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import FilterAltRoundedIcon from "@mui/icons-material/FilterAltRounded";
import { useProducts } from "../hooks/useProducts";

// Static columns (no sorting)
const COLS = [
  { id: "name",       label: "Name",        minWidth: 180 },
  { id: "sku",        label: "SKU",         width: 160 },
  { id: "category",   label: "Category",    width: 160 },
  { id: "sale_price", label: "Sale price",  width: 120, align: "right" },
  { id: "quantity",   label: "Qty",         width: 90,  align: "right" },
  { id: "location",   label: "Location",    width: 150 },
  { id: "status",     label: "Status",      width: 140 },
];

// If you don't have meta tables, hardcode options for now:
const LOCATION_OPTIONS = ["warehouse", "store", "branch-1", "branch-2"];
const STATUS_OPTIONS = ["in_stock", "sold", "reserved", "damaged"];

export default function ProductsTable() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // Search term (name OR sku)
  const [search, setSearch] = useState("");

  // Filters (all optional)
  const [filters, setFilters] = useState({
    name: "",
    sku: "",
    category: "",
    quantity: "",
    location: "",
    status: "",
  });

  const { rows, total, loading, error } = useProducts({
    page,
    pageSize,
    search,
    filters,
  });

  // Filter dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const openFilters = () => setDialogOpen(true);
  const closeFilters = () => setDialogOpen(false);

  // dot on button when any filter is active
  const hasActiveFilters = useMemo(
    () => Object.values(filters).some((v) => v !== "" && v != null),
    [filters]
  );

  // Form refs for dialog
  const nameRef = useRef();
  const skuRef = useRef();
  const categoryRef = useRef();
  const quantityRef = useRef();
  const locationRef = useRef();
  const statusRef = useRef();

  const applyFilters = () => {
    setFilters({
      name: nameRef.current?.value || "",
      sku: skuRef.current?.value || "",
      category: categoryRef.current?.value || "",
      quantity: quantityRef.current?.value || "",
      location: locationRef.current?.value || "",
      status: statusRef.current?.value || "",
    });
    setPage(0);
    closeFilters();
  };

  const clearFilters = () => {
    if (nameRef.current) nameRef.current.value = "";
    if (skuRef.current) skuRef.current.value = "";
    if (categoryRef.current) categoryRef.current.value = "";
    if (quantityRef.current) quantityRef.current.value = "";
    if (locationRef.current) locationRef.current.value = "";
    if (statusRef.current) statusRef.current.value = "";
    setFilters({ name: "", sku: "", category: "", quantity: "", location: "", status: "" });
    setPage(0);
  };

  // (Optional) debounce search typing
  const onSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(0);
  };

  return (
    <Stack spacing={2}>
      {/* Top row: title, search, filter button */}
      <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Products
        </Typography>

        <TextField
          size="small"
          placeholder="Search name or SKU"
          value={search}
          onChange={onSearchChange}
          sx={{ width: 280 }}
        />

        <Badge color="primary" variant="dot" invisible={!hasActiveFilters}>
          <IconButton onClick={openFilters} aria-label="Open filters">
            <FilterAltRoundedIcon />
          </IconButton>
        </Badge>
      </Box>

      {/* Table */}
      <Paper elevation={0} sx={{ p: 2, border: "1px solid #eef0f3", borderRadius: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {COLS.map((c) => (
                  <TableCell key={c.id} sx={{ width: c.width, minWidth: c.minWidth }} align={c.align || "left"}>
                    {c.label}
                  </TableCell>
                ))}
                <TableCell align="right" sx={{ width: 56 }} />
              </TableRow>
            </TableHead>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={COLS.length + 1}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <CircularProgress size={18} /> Loading…
                    </Box>
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLS.length + 1}>No data</TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.product_list_id} hover>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.sku}</TableCell>
                    <TableCell>{r.category}</TableCell>
                    <TableCell align="right">
                      {r.sale_price != null ? Number(r.sale_price).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell align="right">
                      {r.quantity != null ? Number(r.quantity).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>{r.location || "—"}</TableCell>
                    <TableCell>{r.status || "—"}</TableCell>
                    <TableCell />
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Pagination */}
      <Box>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_e, p) => setPage(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => {
            setPageSize(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[5, 10, 25, 50]}
        />
      </Box>

      {/* Centered Filter Dialog */}
      <Dialog open={dialogOpen} onClose={closeFilters} fullWidth maxWidth="sm">
        <DialogTitle>Filter products</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField inputRef={nameRef} label="Name (contains)" defaultValue={filters.name} size="small" fullWidth />
            <TextField inputRef={skuRef} label="SKU (contains)" defaultValue={filters.sku} size="small" fullWidth />
            <TextField
              inputRef={categoryRef}
              label="Category"
              placeholder="e.g. electronics"
              defaultValue={filters.category}
              size="small"
              fullWidth
            />
            <TextField
              inputRef={quantityRef}
              label="Quantity (exact)"
              type="number"
              defaultValue={filters.quantity}
              size="small"
              fullWidth
            />
            <TextField inputRef={locationRef} label="Location" select defaultValue={filters.location} size="small" fullWidth>
              <MenuItem value="">Any</MenuItem>
              {LOCATION_OPTIONS.map((l) => (
                <MenuItem key={l} value={l}>
                  {l}
                </MenuItem>
              ))}
            </TextField>
            <TextField inputRef={statusRef} label="Status" select defaultValue={filters.status} size="small" fullWidth>
              <MenuItem value="">Any</MenuItem>
              {STATUS_OPTIONS.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={clearFilters} color="inherit">
            Clear
          </Button>
          <Button onClick={applyFilters} variant="contained">
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
