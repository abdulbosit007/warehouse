// src/pages/owner/IncomingBatches.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createBatch,
  deleteBatch,
  getBatchesSummaryWithOrigin,
  updateBatch,
} from "../../lib/incoming";
import useCurrentUser from "../../hooks/useCurrentUser";

// 🔵 ProductsTable dagi kabi premium table uchun MUI importlar
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Box,
  Typography,
} from "@mui/material";

const INDIGO = "#4f46e5";

function OriginModal({ open, onClose, onSelect }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">Select batch origin</h2>
        <div className="grid gap-3">
          <button
            onClick={() => onSelect("chinese")}
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-red-700 hover:bg-red-100"
          >
            Chinese
          </button>
          <button
            onClick={() => onSelect("uzbek")}
            className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-green-700 hover:bg-green-100"
          >
            Uzbek
          </button>
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-gray-800 px-4 py-2 text-white hover:bg-black"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const chipForOrigin = (o) => {
  const v = String(o ?? "")
    .trim()
    .toLowerCase();
  if (v === "chinese") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200">
        <span className="h-2 w-2 rounded-full bg-red-500" />
        Chinese
      </span>
    );
  }
  if (v === "uzbek") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 ring-1 ring-green-200">
        <span className="h-2 w-2 rounded-full bg-green-500" />
        Uzbek
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
      <span className="h-2 w-2 rounded-full bg-gray-400" />—
    </span>
  );
};

const chipForStatus = (s) => {
  const v = (s || "").toLowerCase();
  const cls =
    v === "approved"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : v === "rejected"
      ? "bg-red-50 text-red-700 ring-red-200"
      : v === "sent"
      ? "bg-blue-50 text-blue-700 ring-blue-200"
      : "bg-gray-100 text-gray-800 ring-gray-200";
  const label = v ? v[0].toUpperCase() + v.slice(1) : "—";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs ring-1 ${cls}`}>
      {label}
    </span>
  );
};

const fmtDate = (iso) => {
  try {
    const d = new Date(iso);
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return `${String(d.getDate()).padStart(2, "0")} ${
      months[d.getMonth()]
    }, ${d.getFullYear()}`;
  } catch {
    return "-";
  }
};

export default function IncomingBatches() {
  const { loading: uLoading, userRow } = useCurrentUser();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getBatchesSummaryWithOrigin();
    if (error) setErr(error.message);
    const sorted = (data || []).slice().sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      return tb - ta;
    });
    setRows(sorted);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const latest = rows[0] ?? null;
  const latestCounts = useMemo(() => {
    if (!latest) return { approved: 0, sent: 0, rejected: 0, draft: 0 };
    return {
      approved: latest.approved_count ?? 0,
      sent: latest.sent_count ?? 0,
      rejected: latest.rejected_count ?? 0,
      draft: latest.draft_count ?? 0,
    };
  }, [latest]);

  const latestIsCleanAndApproved = useMemo(() => {
    const { approved, sent, rejected, draft } = latestCounts;
    return approved > 0 && sent === 0 && rejected === 0 && draft === 0;
  }, [latestCounts]);

  const canCreateBatch = useMemo(() => {
    if (!rows.length) return true;
    return latestIsCleanAndApproved;
  }, [rows.length, latestIsCleanAndApproved]);

  const handleCreateClick = () => {
    setErr("");
    setModalOpen(true);
  };

  const handleSelectOrigin = async (origin) => {
    try {
      setModalOpen(false);

      if (
        latest &&
        (latest.status || "").toLowerCase() === "open" &&
        latestIsCleanAndApproved
      ) {
        await updateBatch(latest.id, { status: "closed" });
      }

      await createBatch({
        created_by: userRow?.user_id ?? null,
        origin, // 'chinese' | 'uzbek'
      });
      await load();
    } catch (e) {
      setErr(e.message);
    }
  };

  const handleDelete = async (b) => {
    setErr("");
    try {
      await deleteBatch(b.id);
      await load();
    } catch (e) {
      setErr(e.message);
    }
  };

  const onRowKey = (e, id) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate(`/owner/batch/${id}`);
    }
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Incoming batches</h1>
        <button
          onClick={handleCreateClick}
          disabled={loading || uLoading || !canCreateBatch}
          className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50"
          title={
            !canCreateBatch
              ? "Create is allowed when the latest batch has approved > 0 and draft/sent/rejected are all 0."
              : "Create a new incoming batch"
          }
        >
          Create batch
        </button>
      </div>

      {err && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* 🔵 ProductsTable dagi premium MUI table UI */}
      <Paper
        elevation={0}
        sx={{
          p: 0,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          overflow: "hidden",
          bgcolor: "common.white",
        }}
      >
        <TableContainer>
          <Table
            size="small"
            stickyHeader
            aria-label="Incoming batches table"
            sx={{
              tableLayout: "fixed",
              width: "100%",
              "& th, & td": { p: "10px 16px" },
            }}
          >
            <colgroup>
              {Array.from({ length: 8 }).map((_, i) => (
                <col
                  key={i}
                  style={{ width: `calc(100% / 8)` }}
                />
              ))}
            </colgroup>

            <TableHead>
              <TableRow
                sx={{
                  "& th": {
                    bgcolor: INDIGO,
                    color: "common.white",
                    borderBottom: "1px solid",
                    borderColor: INDIGO,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontSize: 12,
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                  },
                }}
              >
                <TableCell>Origin</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Draft</TableCell>
                <TableCell>Sent</TableCell>
                <TableCell>Approved</TableCell>
                <TableCell>Rejected</TableCell>
                <TableCell>Created</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.map((r) => {
                const canDelete =
                  (r.sent_count ?? 0) +
                    (r.approved_count ?? 0) +
                    (r.rejected_count ?? 0) ===
                  0;

                return (
                  <TableRow
                    key={r.id}
                    tabIndex={0}
                    role="button"
                    hover
                    onClick={() => navigate(`/owner/batch/${r.id}`)}
                    onKeyDown={(e) => onRowKey(e, r.id)}
                    sx={{
                      cursor: "pointer",
                      bgcolor: "white",
                      "&:hover": { bgcolor: "grey.100" },
                    }}
                  >
                    <TableCell>
                      {chipForOrigin(r.origin)}
                    </TableCell>
                    <TableCell>
                      {chipForStatus(r.status)}
                    </TableCell>
                    <TableCell>{r.draft_count ?? 0}</TableCell>
                    <TableCell>{r.sent_count ?? 0}</TableCell>
                    <TableCell>{r.approved_count ?? 0}</TableCell>
                    <TableCell>{r.rejected_count ?? 0}</TableCell>
                    <TableCell>{fmtDate(r.created_at)}</TableCell>
                    <TableCell align="right">
                      {canDelete && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); // navigatsiyani to‘xtatish
                            handleDelete(r);
                          }}
                          className="inline-flex items-center rounded-lg border px-2.5 py-1.5 text-sm text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}

              {rows.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={8} sx={{ bgcolor: "white" }}>
                    <Box sx={{ py: 3, textAlign: "center" }}>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                      >
                        No batches yet.
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {loading && (
          <Box sx={{ p: 2, textAlign: "center" }}>
            <Typography
              variant="body2"
              color="text.secondary"
            >
              Loading...
            </Typography>
          </Box>
        )}
      </Paper>

      <OriginModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelect={handleSelectOrigin}
      />
    </div>
  );
}
