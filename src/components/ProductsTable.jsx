import { useEffect, useMemo, useState } from "react";
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
} from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ClearRoundedIcon from "@mui/icons-material/ClearRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";

import { useProducts } from "../hooks/useProducts";
import { useProductFilterMeta } from "../hooks/useProductFilterMeta";
import useCurrentUser from "../hooks/useCurrentUser";

const nfQty = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const nfMoney = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

const bwFieldSx = {
  "& .MuiOutlinedInput-root": { borderRadius: 2 },
  "& .MuiOutlinedInput-notchedOutline": { borderColor: "black !important" },
  "&:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "black !important",
  },
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

export default function ProductsTable() {
  // who am I
  const {
    loading: userLoading,
    error: userErr,
    roleBase,
    locationName,
  } = useCurrentUser();
  const isOwner = roleBase === "owner";
  const isBranch = roleBase === "branch";
  const isWarehouse = roleBase === "warehouse";

  // search / pagination
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  // filters state (location = locations.name)
  const [filters, setFilters] = useState({
    category: "",
    status: "available",
    location: "",
    location_in: undefined,
    quantity: "",
    quantityOp: "",
    quantityMin: "",
    quantityMax: "",
    sale_price: "",
    salePriceOp: "",
    salePriceMin: "",
    salePriceMax: "",
  });

  // meta: categories + locations(kind) to map labels and limit warehouses
  const {
    categories = [],
    locations = [],
    loading: metaLoading,
  } = useProductFilterMeta();

  // name <-> label
  const nameToLabel = useMemo(() => {
    const m = new Map();
    for (const l of locations) m.set(l.name, l.location_name || l.name);
    return m;
  }, [locations]);
  const labelToName = useMemo(() => {
    const m = new Map();
    for (const l of locations) m.set(l.location_name || l.name, l.name);
    return m;
  }, [locations]);

  // warehouses only set
  const warehouseOnlyLocations = useMemo(
    () => locations.filter((l) => (l.kind || "").toLowerCase() === "warehouse"),
    [locations]
  );
  const warehouseNames = useMemo(
    () => warehouseOnlyLocations.map((l) => l.name),
    [warehouseOnlyLocations]
  );

  // UI selects (role-aware)
  const [locationLabelSel, setLocationLabelSel] = useState("");
  useEffect(() => {
    if (!roleBase) return;
    if (isBranch) setLocationLabelSel(locationName || "");
    else setLocationLabelSel("");
  }, [roleBase, isBranch, locationName]);

  const [categorySel, setCategorySel] = useState("");
  const [qtyOp, setQtyOp] = useState("");
  const [qtyMin, setQtyMin] = useState("");
  const [qtyMax, setQtyMax] = useState("");
  const [spOp, setSpOp] = useState("");
  const [spMin, setSpMin] = useState("");
  const [spMax, setSpMax] = useState("");

  // build operators
  const buildQuantityString = () => {
    if (qtyOp === "between" && qtyMin && qtyMax) return `${qtyMin}-${qtyMax}`;
    if (qtyOp === "gte" && qtyMin) return `>=${qtyMin}`;
    if (qtyOp === "lte" && qtyMin) return `<=${qtyMin}`;
    if (qtyOp === "eq" && qtyMin) return `=${qtyMin}`;
    return "";
  };
  const buildSalePriceString = () => {
    if (spOp === "between" && spMin && spMax) return `${spMin}-${spMax}`;
    if (spOp === "gte" && spMin) return `>=${spMin}`;
    if (spOp === "lte" && spMin) return `<=${spMin}`;
    if (spOp === "eq" && spMin) return `=${spMin}`;
    return "";
  };

  // effective filters used by hook
  const effectiveFilters = useMemo(() => {
    const base = { ...filters, status: "available" };

    if (isBranch) {
      const enforcedName = labelToName.get(locationName || "") || "";
      return { ...base, location: enforcedName, location_in: undefined };
    }

    if (isWarehouse) {
      const pickedName = labelToName.get(locationLabelSel || "") || "";
      console.log(base);
      // eslint-disable-next-line no-unused-vars
      const { sale_price, salePriceOp, salePriceMin, salePriceMax, ...rest } =
        base; // hide price filter for WH
      if (pickedName) {
        return { ...rest, location: pickedName, location_in: undefined };
      }
      return { ...rest, location: "", location_in: warehouseNames };
    }

    return base; // owner
  }, [
    filters,
    isBranch,
    isWarehouse,
    locationName,
    labelToName,
    warehouseNames,
    locationLabelSel,
  ]);

  // data
  const {
    rows = [],
    loading,
    error,
    total,
  } = useProducts({
    page: page - 1,
    pageSize,
    search,
    filters: effectiveFilters,
  });

  // visible rows: only warehouses for WH view (страховка, если view вернёт лишнее)
  const visibleRows = useMemo(() => {
    if (!isWarehouse) return rows;
    const allow = new Set(warehouseNames);
    return rows.filter((r) => allow.has(r.location));
  }, [rows, isWarehouse, warehouseNames]);

  // single “global” loading: пока не готовы роль, мета, данные — показываем один экран
  const ready = !!roleBase && !userLoading && !metaLoading && !loading;

  // apply/clear
  const [dialogOpen, setDialogOpen] = useState(false);

  const applyFilters = () => {
    let nextLocationName = filters.location;
    if (isOwner || isWarehouse) {
      nextLocationName = labelToName.get(locationLabelSel || "") || "";
    }
    setFilters((prev) => ({
      ...prev,
      category: categorySel || "",
      location: nextLocationName,
      status: "available",
      quantityOp: qtyOp,
      quantityMin: qtyMin,
      quantityMax: qtyMax,
      quantity: buildQuantityString(),
      salePriceOp: isWarehouse ? "" : spOp,
      salePriceMin: isWarehouse ? "" : spMin,
      salePriceMax: isWarehouse ? "" : spMax,
      sale_price: isWarehouse ? "" : buildSalePriceString(),
    }));
    setPage(1);
    setDialogOpen(false);
  };

  const clearFilters = () => {
    setCategorySel("");
    setQtyOp("");
    setQtyMin("");
    setQtyMax("");
    setSpOp("");
    setSpMin("");
    setSpMax("");
    setLocationLabelSel(isBranch ? locationName || "" : "");
    setFilters({
      category: "",
      status: "available",
      location: "",
      location_in: undefined,
      quantity: "",
      quantityOp: "",
      quantityMin: "",
      quantityMax: "",
      sale_price: "",
      salePriceOp: "",
      salePriceMin: "",
      salePriceMax: "",
    });
    setPage(1);
  };

  const chips = useMemo(() => {
    const list = [];
    if (categorySel) list.push(["category", `Category: ${categorySel}`]);
    const showLocationChip = isOwner || isWarehouse;
    if (showLocationChip && (filters.location || locationLabelSel)) {
      const label = nameToLabel.get(filters.location) || locationLabelSel || "";
      if (label) list.push(["location", `Location: ${label}`]);
    }
    if (filters.quantity)
      list.push(["quantity", `Qty: ${filters.quantity.replace("-", "–")}`]);
    if (!isWarehouse && filters.sale_price)
      list.push([
        "sale_price",
        `Price: ${filters.sale_price.replace("-", "–")}`,
      ]);
    return list;
  }, [
    categorySel,
    filters,
    isOwner,
    isWarehouse,
    nameToLabel,
    locationLabelSel,
  ]);

  const hasAnyFilter =
    !!categorySel ||
    !!filters.quantity ||
    (!!filters.sale_price && !isWarehouse) ||
    ((isOwner || isWarehouse) && !!(filters.location || locationLabelSel));

  // columns per role
  const showPriceCol = !isWarehouse;
  const showLocationCol = !isBranch;
  const columns = [
    "Name",
    "SKU",
    "Category",
    ...(showPriceCol ? ["Sale price"] : []),
    "Quantity",
    ...(showLocationCol ? ["Location"] : []),
  ];
  const colCount = columns.length;

  // --- SINGLE GLOBAL LOADING SCREEN ---
  if (!ready) {
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <div className="text-sm text-neutral-800">Loading…</div>
      </div>
    );
  }

  // --- MAIN RENDER (once everything is ready) ---
  return (
    <Stack spacing={2}>
      {userErr && <Alert severity="error">{userErr}</Alert>}

      {/* Toolbar */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        gap={2}
        flexWrap="wrap"
      >
        <Typography variant="h6" sx={{ minWidth: 120 }}>
          Products
        </Typography>

        <Stack
          direction="row"
          alignItems="center"
          gap={1.25}
          sx={{ minWidth: 280 }}
        >
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
                  <IconButton
                    size="small"
                    aria-label="Clear search"
                    onClick={() => setSearchInput("")}
                  >
                    <ClearRoundedIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
            sx={{
              width: { xs: "100%", sm: 320 },
              "& .MuiOutlinedInput-root": { borderRadius: 2 },
            }}
          />

          <Tooltip title="Filters">
            <IconButton
              onClick={() => setDialogOpen(true)}
              aria-label="Open filters"
              sx={{
                border: "1px solid",
                borderColor: "common.black",
                bgcolor: hasAnyFilter ? "common.black" : "transparent",
                color: hasAnyFilter ? "common.white" : "common.black",
                borderRadius: 2,
                "&:hover": {
                  bgcolor: "common.black",
                  color: "common.white",
                  borderColor: "common.black",
                },
              }}
            >
              <TuneRoundedIcon />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Active chips */}
      {chips.length > 0 && (
        <Box mt={0.5}>
          <Stack
            direction="row"
            spacing={1}
            flexWrap="wrap"
            aria-label="Active filters"
          >
            {chips.map(([k, label]) => (
              <Chip
                key={k}
                size="small"
                variant="outlined"
                label={label}
                onDelete={() => {
                  if (k === "quantity") {
                    setQtyOp("");
                    setQtyMin("");
                    setQtyMax("");
                    setFilters((f) => ({ ...f, quantity: "" }));
                  } else if (k === "sale_price") {
                    setSpOp("");
                    setSpMin("");
                    setSpMax("");
                    setFilters((f) => ({ ...f, sale_price: "" }));
                  } else if (k === "location") {
                    setLocationLabelSel("");
                    setFilters((f) => ({
                      ...f,
                      location: "",
                      location_in: undefined,
                    }));
                  } else if (k === "category") {
                    setCategorySel("");
                    setFilters((f) => ({ ...f, category: "" }));
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
        </Box>
      )}

      {/* Table */}
      <Paper
        elevation={0}
        sx={{
          p: 0,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        {error && (
          <Alert severity="error" sx={{ m: 2 }}>
            {error}
          </Alert>
        )}

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
            <colgroup>
              {Array.from({ length: colCount }).map((_, i) => (
                <col key={i} style={{ width: `calc(100% / ${colCount})` }} />
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
                {columns.map((c) => (
                  <TableCell key={c}>{c}</TableCell>
                ))}
              </TableRow>
            </TableHead>

            <TableBody>
              {visibleRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colCount} sx={{ bgcolor: "white" }}>
                    <Stack alignItems="center" sx={{ py: 2 }}>
                      <Typography variant="subtitle1" color="text.primary">
                        Result not found
                      </Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((r) => (
                  <TableRow
                    key={
                      r.product_list_id || `${r.sku}-${r.name}-${Math.random()}`
                    }
                    hover
                    sx={{
                      bgcolor: "white",
                      "&:hover": { bgcolor: "grey.100" },
                    }}
                  >
                    <TableCell
                      sx={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.name ?? "—"}
                    </TableCell>
                    <TableCell
                      sx={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.sku ?? "—"}
                    </TableCell>
                    <TableCell
                      sx={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.category ?? "—"}
                    </TableCell>

                    {!isWarehouse && (
                      <TableCell
                        align="left"
                        sx={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.sale_price != null
                          ? nfMoney.format(Number(r.sale_price))
                          : "—"}
                      </TableCell>
                    )}

                    <TableCell
                      align="left"
                      sx={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.quantity != null
                        ? nfQty.format(Number(r.quantity))
                        : "—"}
                    </TableCell>

                    {!isBranch && (
                      <TableCell
                        sx={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {nameToLabel.get(r.location) || r.location || "—"}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Pagination */}
      <Box
        sx={{
          mt: 2,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          p: 1.25,
        }}
      >
        <Pagination
          count={
            typeof total === "number"
              ? Math.max(1, Math.ceil(total / pageSize))
              : 10
          }
          page={page}
          onChange={(_, p) => setPage(p)}
          variant="outlined"
          shape="rounded"
          sx={{
            "& .MuiPaginationItem-root": {
              color: "black",
              borderColor: "black",
            },
            "& .Mui-selected": {
              bgcolor: "black !important",
              color: "white !important",
              borderColor: "black",
            },
          }}
        />
      </Box>

      {/* Filters dialog (same design) */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
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
            <Box sx={sectionBoxSx}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                Inventory
              </Typography>

              {/* Quantity */}
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.25}
                sx={{ mb: 1.5 }}
              >
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

              {/* Price – hidden for warehouse */}
              {!isWarehouse && (
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
                        label="Min"
                        type="number"
                        size="small"
                        value={spMin}
                        onChange={(e) => setSpMin(e.target.value)}
                        sx={bwFieldSx}
                      />
                      <TextField
                        label="Max"
                        type="number"
                        size="small"
                        value={spMax}
                        onChange={(e) => setSpMax(e.target.value)}
                        sx={bwFieldSx}
                      />
                    </>
                  ) : (
                    <TextField
                      label="Price"
                      type="number"
                      size="small"
                      value={spMin}
                      onChange={(e) => setSpMin(e.target.value)}
                      sx={bwFieldSx}
                    />
                  )}
                </Stack>
              )}
            </Box>

            {/* Attributes */}
            <Box sx={sectionBoxSx}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                Attributes
              </Typography>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
                <TextField
                  label="Category"
                  select
                  value={categorySel}
                  onChange={(e) => setCategorySel(e.target.value)}
                  size="small"
                  fullWidth
                  disabled={metaLoading}
                  sx={bwFieldSx}
                >
                  <MenuItem value="">Any</MenuItem>
                  {categories.map((c) => (
                    <MenuItem key={c} value={c}>
                      {c}
                    </MenuItem>
                  ))}
                </TextField>

                {(isOwner || isWarehouse) && (
                  <TextField
                    label="Location"
                    select
                    value={locationLabelSel}
                    onChange={(e) => setLocationLabelSel(e.target.value)}
                    size="small"
                    fullWidth
                    disabled={metaLoading}
                    sx={bwFieldSx}
                  >
                    <MenuItem value="">Any</MenuItem>
                    {(isOwner ? locations : warehouseOnlyLocations).map((l) => (
                      <MenuItem key={l.name} value={l.location_name || l.name}>
                        {l.location_name || l.name}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              </Stack>
            </Box>
          </Stack>
        </DialogContent>

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
            onClick={() => setDialogOpen(false)}
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
