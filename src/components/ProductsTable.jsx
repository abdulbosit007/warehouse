import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  CircularProgress,
} from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ClearRoundedIcon from "@mui/icons-material/ClearRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import { useProducts } from "../hooks/useProducts";
import { useProductFilterMeta } from "../hooks/useProductFilterMeta";
import useCurrentUser from "../hooks/useCurrentUser";

// Number formatting
const nfQty = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

// Black & White field styles
const bwFieldSx = {
  "& .MuiOutlinedInput-root": { borderRadius: 2 },
  "& .MuiOutlinedInput-notchedOutline": { borderColor: "black !important" },
  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "black !important" },
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "black !important",
    borderWidth: 1,
  },
  "& .MuiInputLabel-root.Mui-focused": { color: "black !important" },
};
const sectionBoxSx = {
  border: "1px solid",
  borderColor: "common.black",
  borderRadius: 2,
  p: 2,
  bgcolor: "common.white",
};

// Role mapping (adjust numbers if yours differ)
const ROLE = {
  WAREHOUSE: 1,
  BRANCH: 2,
  OWNER: 0,
};

// Map role/branch → EXACT location strings from DB
const warehouseLocationName = "warehouse";
function branchIdToLocationName(branchId) {
  if (branchId === 0) return "warehouse";
  return `branch${branchId}`;
}

export default function ProductsTable() {
  // Current user
  const { error: userErr, userRow } = useCurrentUser();
  const role = userRow?.role ?? null;
  const branch = userRow?.branch ?? null;

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Search (debounced)
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Filters persisted state
  const [filters, setFilters] = useState({
    name: "",
    sku: "",
    category: "",
    sale_price: "",
    quantity: "",
    quantityOp: "",
    quantityMin: "",
    quantityMax: "",
    salePriceOp: "",
    salePriceMin: "",
    salePriceMax: "",
    location: "",
    status: "",
  });

  // Enforced scope based on role
  const enforced = useMemo(() => {
    if (role === ROLE.OWNER) return {};
    if (role === ROLE.WAREHOUSE) return { location: warehouseLocationName };
    if (role === ROLE.BRANCH) return { location: branchIdToLocationName(branch) };
    return {}; // unknown role yet
  }, [role, branch]);

  // Effective filters passed to API
  const effectiveFilters = useMemo(
    () => ({ ...filters, ...enforced }),
    [filters, enforced]
  );

  // Data + totals
  const { rows = [], loading, error, total } = useProducts({
    page: page - 1,
    pageSize,
    search,
    filters: effectiveFilters,
  });

  // Meta options
  const {
    categories = [],
    locations = [],
    statuses = [],
    loading: metaLoading,
  } = useProductFilterMeta();

  // Filter dialog UI state
  const [dialogOpen, setDialogOpen] = useState(false);
  const openFilters = () => setDialogOpen(true);
  const closeFilters = () => setDialogOpen(false);

  const categoryRef = useRef(null);
  const locationRef = useRef(null);
  const statusRef   = useRef(null);

  // Quantity UI local
  const [qtyOp, setQtyOp] = useState(filters.quantityOp || "");
  const [qtyMin, setQtyMin] = useState(filters.quantityMin || "");
  const [qtyMax, setQtyMax] = useState(filters.quantityMax || "");

  // Sale price UI local
  const [spOp, setSpOp] = useState(filters.salePriceOp || "");
  const [spMin, setSpMin] = useState(filters.salePriceMin || "");
  const [spMax, setSpMax] = useState(filters.salePriceMax || "");

  // Non-owner?
  const isScoped = role !== ROLE.OWNER;

  // For scoped users, seed fixed location into filters (no UI)
  useEffect(() => {
    if (!isScoped) return;
    const enforcedLocation = enforced.location || "";
    setFilters((f) => ({ ...f, location: enforcedLocation }));
    // locationRef is not rendered for scoped users, so no need to sync its value
  }, [isScoped, enforced.location]);

  // Active filters indicator (don’t count enforced location)
  const hasActiveFilters = useMemo(() => {
    return Boolean(
      filters.category || filters.status ||
      filters.quantity || filters.sale_price ||
      (!isScoped && filters.location)
    );
  }, [filters, isScoped]);

  // Build filter strings for API
  const buildQuantityString = () => {
    if (qtyOp === "between" && qtyMin && qtyMax) return `${qtyMin}-${qtyMax}`;
    if (qtyOp === "gte" && qtyMin) return `>=${qtyMin}`;
    if (qtyOp === "lte" && qtyMin) return `<=${qtyMin}`;
    if (qtyOp === "eq"  && qtyMin) return `=${qtyMin}`;
    return "";
  };
  const buildSalePriceString = () => {
    if (spOp === "between" && spMin && spMax) return `${spMin}-${spMax}`;
    if (spOp === "gte" && spMin) return `>=${spMin}`;
    if (spOp === "lte" && spMin) return `<=${spMin}`;
    if (spOp === "eq"  && spMin) return `=${spMin}`;
    return "";
  };

  // Apply filters (keep enforced location for non-owners)
  const applyFilters = () => {
    const nextLocation = isScoped ? (enforced.location || "") : (locationRef.current?.value || "");
    setFilters((prev) => ({
      ...prev,
      category: categoryRef.current?.value || "",
      location: nextLocation,
      status: statusRef.current?.value || "",
      quantityOp: qtyOp,
      quantityMin: qtyMin,
      quantityMax: qtyMax,
      quantity: buildQuantityString(),
      salePriceOp: spOp,
      salePriceMin: spMin,
      salePriceMax: spMax,
      sale_price: buildSalePriceString(),
    }));
    setPage(1);
    closeFilters();
  };

  // Clear filters (keep enforced location for non-owners)
  const clearFilters = () => {
    if (categoryRef.current) categoryRef.current.value = "";
    if (statusRef.current)   statusRef.current.value = "";

    const resetLocation = isScoped ? (enforced.location || "") : "";
    if (locationRef.current) locationRef.current.value = resetLocation; // only exists for owner

    setQtyOp(""); setQtyMin(""); setQtyMax("");
    setSpOp(""); setSpMin(""); setSpMax("");

    setFilters({
      name: "",
      sku: "",
      category: "",
      sale_price: "",
      quantity: "",
      quantityOp: "",
      quantityMin: "",
      quantityMax: "",
      salePriceOp: "",
      salePriceMin: "",
      salePriceMax: "",
      location: resetLocation,
      status: "",
    });
    setPage(1);
  };

  // Filter chips (don’t show enforced location for non-owners)
  const chips = useMemo(() => {
    const list = [];
    if (filters.category) list.push(["category", `Category: ${filters.category}`]);
    if (!isScoped && filters.location) list.push(["location", `Location: ${filters.location}`]);
    if (filters.status)   list.push(["status",   `Status: ${filters.status}`]);
    if (filters.quantity) list.push(["quantity", `Qty: ${filters.quantity.replace("-", "–")}`]);
    if (filters.sale_price) list.push(["sale_price", `Price: $${filters.sale_price.replace("-", "–$")}`]);
    return list;
  }, [filters, isScoped]);

  const filterChips = chips.length ? (
    <Stack direction="row" spacing={1} flexWrap="wrap" aria-label="Active filters">
      {chips.map(([k, label]) => (
        <Chip
          key={k}
          size="small"
          variant="outlined"
          label={label}
          onDelete={() => {
            if (k === "quantity") {
              setQtyOp(""); setQtyMin(""); setQtyMax("");
              setFilters((f) => ({ ...f, quantity: "" }));
            } else if (k === "sale_price") {
              setSpOp(""); setSpMin(""); setSpMax("");
              setFilters((f) => ({ ...f, sale_price: "" }));
            } else if (k === "location") {
              const newLoc = isScoped ? (enforced.location || "") : "";
              setFilters((f) => ({ ...f, location: newLoc }));
              if (locationRef.current) locationRef.current.value = newLoc;
            } else {
              setFilters((f) => ({ ...f, [k]: "" }));
            }
            setPage(1);
          }}
        />
      ))}
      <Chip
        size="small"
        label="Clear all"
        onClick={clearFilters}
        onDelete={clearFilters}
        deleteIcon={<CloseRoundedIcon />}
        variant="outlined"
      />
    </Stack>
  ) : null;

  const pageCount = typeof total === "number"
    ? Math.max(1, Math.ceil(total / pageSize))
    : 10;

  return (
    <Stack spacing={2}>
     
      {userErr && <Alert severity="error">{userErr}</Alert>}

      {/* Toolbar */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
        <Typography variant="h6" sx={{ minWidth: 120 }}>Products</Typography>

        <Stack direction="row" alignItems="center" gap={1.25} sx={{ minWidth: 280 }}>
          <TextField
            size="small"
            placeholder="Search name or SKU"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search products by name or SKU"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: searchInput ? (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label="Clear search" onClick={() => setSearchInput("")}>
                    <ClearRoundedIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
            sx={{ width: { xs: "100%", sm: 320 }, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
          />

          <Tooltip title="Filters">
            <IconButton
              onClick={openFilters}
              aria-label="Open filters"
              sx={{
                border: "1px solid",
                borderColor: "common.black",
                bgcolor: hasActiveFilters ? "common.black" : "transparent",
                color: hasActiveFilters ? "common.white" : "common.black",
                borderRadius: 2,
                "&:hover": { bgcolor: "common.black", color: "common.white", borderColor: "common.black" },
              }}
            >
              <TuneRoundedIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Active filter chips */}
      {filterChips && <Box mt={0.5}>{filterChips}</Box>}

      {/* Table */}
      <Paper elevation={0} sx={{ p: 0, border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}

        <TableContainer>
          <Table
            size="small"
            stickyHeader
            aria-label="Products table"
            sx={{
              tableLayout: "fixed",
              width: "100%",
              "& th, & td": { p: "10px 16px" },
            }}
          >
            {/* 7 equal columns */}
            <colgroup>
              {Array.from({ length: 7 }).map((_, i) => (
                <col key={i} style={{ width: "calc(100% / 7)" }} />
              ))}
            </colgroup>

            <TableHead>
              <TableRow
                sx={{
                  "& th": {
                    bgcolor: "common.black",
                    color: "common.white",
                    borderBottom: "1px solid",
                    borderColor: "common.black",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  },
                }}
              >
                <TableCell>Name</TableCell>
                <TableCell>SKU</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Sale price</TableCell>
                <TableCell>Quantity</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ bgcolor: "white", py: 6 }}>
                    <Stack alignItems="center" justifyContent="center" spacing={1}>
                      <CircularProgress size={28} sx={{ color: "common.black" }} />
                      <Typography variant="body2" color="text.secondary">
                        Loading…
                      </Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ bgcolor: "white" }}>
                    <Stack alignItems="center" sx={{ py: 2 }}>
                      <Typography variant="subtitle1" color="text.primary">
                        Result not found
                      </Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow
                    key={r.product_list_id || `${r.sku}-${r.name}-${Math.random()}`}
                    hover
                    sx={{ bgcolor: "white", "&:hover": { bgcolor: "grey.100" } }}
                  >
                    <TableCell sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name ?? "—"}</TableCell>
                    <TableCell sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sku ?? "—"}</TableCell>
                    <TableCell sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.category ?? "—"}</TableCell>

                    {/* $ with no decimals */}
                    <TableCell align="left" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.sale_price != null ? `$${Number(r.sale_price)}` : "—"}
                    </TableCell>

                    <TableCell align="left" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.quantity != null ? nfQty.format(Number(r.quantity)) : "—"}
                    </TableCell>

                    <TableCell sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.location ?? "—"}</TableCell>
                    <TableCell sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.status ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Pagination */}
      <Box sx={{ mt: 2, display: "flex", justifyContent: "center", alignItems: "center", p: 1.25 }}>
        <Pagination
          count={pageCount}
          page={page}
          onChange={(_, p) => setPage(p)}
          variant="outlined"
          shape="rounded"
          sx={{
            "& .MuiPaginationItem-root": { color: "black", borderColor: "black" },
            "& .Mui-selected": {
              bgcolor: "black !important",
              color: "white !important",
              borderColor: "black",
            },
          }}
        />
      </Box>

      {/* ===== Filter Dialog ===== */}
      <Dialog
        open={dialogOpen}
        onClose={closeFilters}
        fullWidth
        maxWidth="sm"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle
          sx={{
            bgcolor: "common.white",
            color: "common.black",
            fontWeight: 600,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
          }}
        >
          Filter products
        </DialogTitle>

        <DialogContent dividers sx={{ bgcolor: "common.white", p: 2.5 }}>
          <Stack spacing={2.5}>
            {/* Section: Inventory */}
            <Box sx={sectionBoxSx}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                Inventory
              </Typography>

              {/* Quantity */}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ mb: 1.5 }}>
                <TextField
                  select
                  label="Qty operator"
                  size="small"
                  value={qtyOp}
                  onChange={(e) => setQtyOp(e.target.value)}
                sx={{ minWidth: 160, ...bwFieldSx }}
                >
                  <MenuItem value="">Any</MenuItem>
                  <MenuItem value="eq">=</MenuItem>
                  <MenuItem value="gte">≥</MenuItem>
                  <MenuItem value="lte">≤</MenuItem>
                  <MenuItem value="between">Between</MenuItem>
                </TextField>

                {qtyOp === "between" ? (
                  <>
                    <TextField
                      label="Qty min"
                      type="number"
                      size="small"
                      value={qtyMin}
                      onChange={(e) => setQtyMin(e.target.value)}
                      sx={bwFieldSx}
                    />
                    <TextField
                      label="Qty max"
                      type="number"
                      size="small"
                      value={qtyMax}
                      onChange={(e) => setQtyMax(e.target.value)}
                      sx={bwFieldSx}
                    />
                  </>
                ) : (
                  <TextField
                    label="Qty"
                    type="number"
                    size="small"
                    value={qtyMin}
                    onChange={(e) => setQtyMin(e.target.value)}
                    sx={bwFieldSx}
                  />
                )}
              </Stack>

              {/* Sale price */}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
                <TextField
                  select
                  label="Price operator"
                  size="small"
                  value={spOp}
                  onChange={(e) => setSpOp(e.target.value)}
                  sx={{ minWidth: 160, ...bwFieldSx }}
                >
                  <MenuItem value="">Any</MenuItem>
                  <MenuItem value="eq">=</MenuItem>
                  <MenuItem value="gte">≥</MenuItem>
                  <MenuItem value="lte">≤</MenuItem>
                  <MenuItem value="between">Between</MenuItem>
                </TextField>

                {spOp === "between" ? (
                  <>
                    <TextField
                      label="Min $"
                      type="number"
                      size="small"
                      value={spMin}
                      onChange={(e) => setSpMin(e.target.value)}
                      sx={bwFieldSx}
                    />
                    <TextField
                      label="Max $"
                      type="number"
                      size="small"
                      value={spMax}
                      onChange={(e) => setSpMax(e.target.value)}
                      sx={bwFieldSx}
                    />
                  </>
                ) : (
                  <TextField
                    label="Price $"
                    type="number"
                    size="small"
                    value={spMin}
                    onChange={(e) => setSpMin(e.target.value)}
                    sx={bwFieldSx}
                  />
                )}
              </Stack>
            </Box>

            {/* Section: Attributes */}
            <Box sx={sectionBoxSx}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                Attributes
              </Typography>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
                <TextField
                  inputRef={categoryRef}
                  label="Category"
                  select
                  defaultValue={filters.category}
                  size="small"
                  fullWidth
                  disabled={metaLoading}
                  sx={bwFieldSx}
                >
                  <MenuItem value="">Any</MenuItem>
                  {categories.map((c) => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </TextField>

                {/* Location filter is ONLY visible for Owner */}
                {role === ROLE.OWNER && (
                  <TextField
                    inputRef={locationRef}
                    label="Location"
                    select
                    defaultValue={filters.location}
                    size="small"
                    fullWidth
                    disabled={metaLoading}
                    sx={bwFieldSx}
                  >
                    <MenuItem value="">Any</MenuItem>
                    {locations.map((l) => (
                      <MenuItem key={l} value={l}>{l}</MenuItem>
                    ))}
                  </TextField>
                )}

                <TextField
                  inputRef={statusRef}
                  label="Status"
                  select
                  defaultValue={filters.status}
                  size="small"
                  fullWidth
                  disabled={metaLoading}
                  sx={bwFieldSx}
                >
                  <MenuItem value="">Any</MenuItem>
                  {statuses.map((s) => (
                    <MenuItem key={s} value={s}>{s}</MenuItem>
                  ))}
                </TextField>
              </Stack>
            </Box>
          </Stack>
        </DialogContent>

        {/* Sticky footer */}
        <DialogActions
          sx={{
            position: "sticky",
            bottom: 0,
            bgcolor: "common.white",
            borderTop: "1px solid",
            borderColor: "common.black",
            px: 2,
            py: 1.5,
            gap: 1,
          }}
        >
          <Button
            onClick={clearFilters}
            color="inherit"
            variant="outlined"
            sx={{
              borderColor: "common.black",
              color: "common.black",
              "&:hover": { borderColor: "common.black", bgcolor: "grey.100" },
            }}
            startIcon={<ClearRoundedIcon />}
          >
            Clear
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button
            onClick={closeFilters}
            color="inherit"
            variant="outlined"
            sx={{
              borderColor: "common.black",
              color: "common.black",
              "&:hover": { borderColor: "common.black", bgcolor: "grey.100" },
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={applyFilters}
            variant="contained"
            sx={{
              bgcolor: "common.black",
              color: "common.white",
              "&:hover": { bgcolor: "common.black" },
            }}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
