import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { 
  Package, 
  AlertTriangle, 
  ShoppingCart, 
  RotateCcw, 
  Calendar,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  X,
  Edit3,
  Check
} from "lucide-react";

export default function ActiveLoans({
  loans = [],
  loading = false,
  nf,
  onConvertToSale,
  onMarkReturned,
  onRefresh,
  onUpdateNote,
  onUpdateDueDate,
  onSellAll,
}) {
  const [expandedLoans, setExpandedLoans] = useState(new Set());
  const [actionModal, setActionModal] = useState(null);
  const [actionQty, setActionQty] = useState(1);
  const [actionNote, setActionNote] = useState("");
  const [noteModal, setNoteModal] = useState(null);
  const [editNoteText, setEditNoteText] = useState("");
  const [dueDateModal, setDueDateModal] = useState(null);
  const [editDueDate, setEditDueDate] = useState("");

  const activeLoans = loans.filter(loan => 
    (loan.items || []).some(item => (item.remaining || 0) > 0)
  ).sort((a, b) => {
    const aOverdue = a.due_date && new Date(a.due_date) < new Date();
    const bOverdue = b.due_date && new Date(b.due_date) < new Date();
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    return (a.borrower_name || '').localeCompare(b.borrower_name || '');
  });

  const toggleLoan = (loanId) => {
    setExpandedLoans((prev) => {
      const next = new Set(prev);
      if (next.has(loanId)) next.delete(loanId);
      else next.add(loanId);
      return next;
    });
  };

  const openActionModal = (loan, item, type) => {
    setActionModal({ loan, item, type });
    setActionQty(1);
    setActionNote("");
  };

  const handleSubmit = () => {
    if (!actionModal) return;
    const { loan, item, type } = actionModal;
    if (actionQty > 0) {
      if (type === 'sell' && onConvertToSale) {
        onConvertToSale(loan, item, actionQty, actionNote);
      } else if (type === 'return' && onMarkReturned) {
        onMarkReturned(loan, item, actionQty, actionNote);
      }
    }
    setActionModal(null);
  };

  const isOverdue = (dueDate) => dueDate && new Date(dueDate) < new Date();
  const getDaysOverdue = (dueDate) => {
    if (!dueDate) return 0;
    const diff = Math.floor((new Date() - new Date(dueDate)) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  // Calculate progress for a loan
  const getLoanProgress = (loan) => {
    const items = loan.items || [];
    const totalQty = items.reduce((sum, i) => sum + (i.qty || 0), 0);
    const remainingQty = items.reduce((sum, i) => sum + (i.remaining || 0), 0);
    const completedQty = totalQty - remainingQty;
    const percentage = totalQty > 0 ? Math.round((completedQty / totalQty) * 100) : 0;
    return { totalQty, remainingQty, completedQty, percentage };
  };

  const getTotalItems = () => activeLoans.reduce((sum, loan) => 
    sum + (loan.items || []).filter(i => (i.remaining || 0) > 0).length, 0
  );

  return (
    <>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-200">
              <Package className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-neutral-900">Active Loans</h3>
              <p className="text-xs text-neutral-500">
                {activeLoans.length} active · {getTotalItems()} items pending
              </p>
            </div>
          </div>
          {onRefresh && (
            <button onClick={onRefresh} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-neutral-600 hover:bg-neutral-100 border border-neutral-200 transition-all hover:shadow-sm">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center py-16 bg-white rounded-2xl border border-neutral-200">
            <div className="w-8 h-8 border-3 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
            <p className="text-sm text-neutral-500 mt-3">Loading loans...</p>
          </div>
        ) : activeLoans.length === 0 ? (
          <div className="flex flex-col items-center py-16 bg-white rounded-2xl border border-neutral-200">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
              <Check className="w-7 h-7 text-emerald-600" />
            </div>
            <p className="font-medium text-neutral-700">All caught up!</p>
            <p className="text-sm text-neutral-400 mt-1">No active loans pending</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeLoans.map((loan) => {
              const overdue = isOverdue(loan.due_date);
              const daysOver = getDaysOverdue(loan.due_date);
              const isExpanded = expandedLoans.has(loan.id);
              const activeItems = (loan.items || []).filter(i => (i.remaining || 0) > 0);
              const progress = getLoanProgress(loan);

              return (
                <div 
                  key={loan.id} 
                  className={`rounded-2xl border overflow-hidden transition-all bg-white ${
                    overdue 
                      ? 'border-red-300' 
                      : 'border-neutral-200 hover:border-emerald-200 hover:shadow-md'
                  }`}
                >
                  {/* Loan Header */}
                  <button
                    onClick={() => toggleLoan(loan.id)}
                    className="w-full p-4 flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      {/* Avatar */}
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shadow-sm ${
                        overdue 
                          ? 'bg-gradient-to-br from-red-500 to-orange-500 text-white' 
                          : 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white'
                      }`}>
                        {loan.borrower_name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-neutral-900">{loan.borrower_name}</span>
                          {overdue && (
                            <span className="flex items-center gap-1 text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-medium">
                              <AlertTriangle className="w-3 h-3" />
                              {daysOver}d late
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-neutral-500 mt-0.5">
                          <span>{loan.borrower_store_no || loan.borrower_phone || "—"}</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {loan.due_date || "No due date"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Simple item count */}
                      <div className="text-sm text-neutral-500">
                        {activeItems.length} item{activeItems.length !== 1 ? 's' : ''}
                      </div>
                      {isExpanded ? <ChevronUp className="w-5 h-5 text-neutral-400" /> : <ChevronDown className="w-5 h-5 text-neutral-400" />}
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3">
                      {/* Due Date & Note Section */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Due Date Section */}
                        <div className="flex items-start gap-3 p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                          <Calendar className="w-4 h-4 text-neutral-500 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-neutral-600 mb-0.5">Due Date</div>
                            <div className={`text-sm ${overdue ? 'text-red-600 font-medium' : 'text-neutral-800'}`}>
                              {loan.due_date || <span className="text-neutral-400 italic">Not set</span>}
                            </div>
                          </div>
                          {onUpdateDueDate && (
                            <button
                              onClick={() => {
                                setDueDateModal({ loan });
                                setEditDueDate(loan.due_date || "");
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-neutral-200/70 text-neutral-700 hover:bg-neutral-300 transition-colors"
                            >
                              <Edit3 className="w-3 h-3" />
                              Edit
                            </button>
                          )}
                        </div>

                        {/* Note Section */}
                        <div className="flex items-start gap-3 p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                          <MessageSquare className="w-4 h-4 text-neutral-500 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-neutral-600 mb-0.5">Note</div>
                            {loan.note ? (
                              <div className="text-sm text-neutral-800">{loan.note}</div>
                            ) : (
                              <div className="text-sm text-neutral-400 italic">No note</div>
                            )}
                          </div>
                          {onUpdateNote && (
                            <button
                              onClick={() => {
                                setNoteModal({ loan });
                                setEditNoteText(loan.note || "");
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-neutral-200/70 text-neutral-700 hover:bg-neutral-300 transition-colors"
                            >
                              <Edit3 className="w-3 h-3" />
                              {loan.note ? "Edit" : "Add"}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Products Table */}
                      <div className="rounded-xl overflow-hidden border border-neutral-200">
                        <table className="w-full text-sm">
                          <thead className="bg-neutral-100">
                            <tr className="text-xs text-neutral-600 font-semibold">
                              <th className="px-3 py-2.5 text-left">Product</th>
                              <th className="px-3 py-2.5 text-center w-20">Progress</th>
                              <th className="px-3 py-2.5 text-right pr-14">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100">
                            {(loan.items || []).map((item) => {
                              const itemProgress = item.qty > 0 ? Math.round(((item.qty - item.remaining) / item.qty) * 100) : 0;
                              const isCompleted = (item.remaining || 0) <= 0;
                              return (
                                <tr key={item.product_id} className={isCompleted ? "bg-emerald-50/50" : "hover:bg-neutral-50"}>
                                  <td className="px-3 py-3">
                                    <div className={`font-medium ${isCompleted ? 'text-emerald-600' : 'text-neutral-800'}`}>
                                      {item.name}
                                      {isCompleted && <span className="ml-2 text-xs">✓</span>}
                                    </div>
                                    <div className="text-xs text-neutral-400">{item.sku || "—"}</div>
                                  </td>
                                  <td className="px-3 py-3">
                                    <div className="flex flex-col items-center gap-1">
                                      <div className={`text-xs ${isCompleted ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>
                                        {(item.sold || 0) + (item.returned || 0)}/{item.qty}
                                      </div>
                                      {/* Split progress bar: dark for returned, green for sold */}
                                      <div className="w-16 h-1.5 bg-neutral-200 rounded-full overflow-hidden flex">
                                        {item.returned > 0 && (
                                          <div 
                                            className="h-full bg-neutral-700"
                                            style={{ width: `${(item.returned / item.qty) * 100}%` }}
                                          />
                                        )}
                                        {item.sold > 0 && (
                                          <div 
                                            className="h-full bg-emerald-500"
                                            style={{ width: `${(item.sold / item.qty) * 100}%` }}
                                          />
                                        )}
                                      </div>
                                      {/* Legend */}
                                      {(item.sold > 0 || item.returned > 0) && (
                                        <div className="flex items-center gap-2 text-[10px]">
                                          {item.returned > 0 && <span className="text-neutral-700">●{item.returned}</span>}
                                          {item.sold > 0 && <span className="text-emerald-600">●{item.sold}</span>}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-3 py-3">
                                    {isCompleted ? (
                                      <div className="text-xs text-emerald-600 text-right font-medium pr-10">Done</div>
                                    ) : (
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          onClick={() => openActionModal(loan, item, 'return')}
                                          className="w-16 py-1.5 rounded-lg text-xs font-semibold bg-neutral-700 text-white hover:bg-neutral-800 transition-colors shadow-sm text-center"
                                        >
                                          Return
                                        </button>
                                        <button
                                          onClick={() => openActionModal(loan, item, 'sell')}
                                          className="w-16 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-sm text-center"
                                        >
                                          Sell
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Sell All Button - at bottom */}
                      {onSellAll && activeItems.length > 0 && (
                        <button
                          onClick={() => onSellAll(loan)}
                          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold text-sm hover:from-emerald-600 hover:to-teal-600 transition-all shadow-md flex items-center justify-center gap-2"
                        >
                          <ShoppingCart className="w-4 h-4" />
                          Sell All Remaining ({activeItems.reduce((sum, i) => sum + i.remaining, 0)} items)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setActionModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className={`px-5 py-4 flex items-center justify-between ${actionModal.type === 'sell' ? 'bg-gradient-to-r from-emerald-500 to-teal-600' : 'bg-gradient-to-r from-neutral-700 to-neutral-800'}`}>
              <div className="flex items-center gap-2">
                {actionModal.type === 'sell' ? <ShoppingCart className="w-5 h-5 text-white" /> : <RotateCcw className="w-5 h-5 text-white" />}
                <span className="font-bold text-white">{actionModal.type === 'sell' ? 'Mark as Sold' : 'Mark as Returned'}</span>
              </div>
              <button onClick={() => setActionModal(null)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                <div className="font-semibold text-neutral-800">{actionModal.item.name}</div>
                <div className="text-xs text-neutral-500 mt-0.5">{actionModal.item.sku}</div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-neutral-600">Available:</span>
                  <span className="font-bold text-emerald-600">{nf.format(actionModal.item.remaining)}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1.5">
                  Quantity to {actionModal.type} <span className="text-neutral-400 font-normal">(max: {actionModal.item.remaining})</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={actionQty === 0 ? '' : actionQty}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      setActionQty(0);
                    } else {
                      const num = parseInt(val, 10);
                      if (!isNaN(num)) {
                        setActionQty(Math.min(Math.max(0, num), actionModal.item.remaining));
                      }
                    }
                  }}
                  className="w-full rounded-xl border-2 border-neutral-200 px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1.5">
                  Note <span className="text-neutral-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder="Add a note..."
                  rows={2}
                  className="w-full rounded-xl border-2 border-neutral-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-neutral-100 bg-neutral-50 flex gap-3">
              <button onClick={() => setActionModal(null)} className="flex-1 py-3 rounded-xl border-2 border-neutral-200 text-neutral-600 font-semibold hover:bg-white transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={actionQty <= 0}
                className={`flex-1 py-3 rounded-xl text-white font-semibold transition-colors disabled:opacity-50 shadow-lg ${actionModal.type === 'sell' ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700' : 'bg-gradient-to-r from-neutral-700 to-neutral-800 hover:from-neutral-800 hover:to-neutral-900'}`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Note Edit Modal */}
      {noteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setNoteModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 bg-gradient-to-r from-amber-500 to-orange-500 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-white" />
                <span className="font-bold text-white">{noteModal.loan.note ? "Edit Note" : "Add Note"}</span>
              </div>
              <button onClick={() => setNoteModal(null)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                <div className="font-semibold text-neutral-800">{noteModal.loan.borrower_name}</div>
                <div className="text-xs text-neutral-500">{noteModal.loan.borrower_store_no || noteModal.loan.borrower_phone}</div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Note</label>
                <textarea
                  value={editNoteText}
                  onChange={(e) => setEditNoteText(e.target.value)}
                  placeholder="Add a note for this loan..."
                  rows={4}
                  className="w-full rounded-xl border-2 border-neutral-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none"
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-neutral-100 bg-neutral-50 flex gap-3">
              <button onClick={() => setNoteModal(null)} className="flex-1 py-3 rounded-xl border-2 border-neutral-200 text-neutral-600 font-semibold hover:bg-white transition-colors">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (onUpdateNote) onUpdateNote(noteModal.loan.id, editNoteText);
                  setNoteModal(null);
                }}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold hover:from-amber-600 hover:to-orange-600 transition-colors shadow-lg"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Due Date Edit Modal */}
      {dueDateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setDueDateModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 bg-gradient-to-r from-neutral-700 to-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-white" />
                <span className="font-bold text-white">Edit Due Date</span>
              </div>
              <button onClick={() => setDueDateModal(null)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            <div className="p-4">
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 mb-4">
                <div className="font-semibold text-neutral-800">{dueDateModal.loan.borrower_name}</div>
                <div className="text-xs text-neutral-500">{dueDateModal.loan.borrower_store_no || dueDateModal.loan.borrower_phone}</div>
              </div>
              <style>{`
                .rdp-neutral.rdp-root {
                  --rdp-accent-color: #404040;
                  --rdp-accent-background-color: #f5f5f5;
                }
                .rdp-neutral .rdp-selected > button,
                .rdp-neutral [aria-selected="true"] button {
                  background-color: #404040 !important;
                  color: white !important;
                  border-radius: 9999px !important;
                }
                .rdp-neutral .rdp-today:not(.rdp-selected) > button,
                .rdp-neutral [data-today="true"]:not([aria-selected="true"]) button {
                  border: 2px solid #404040 !important;
                  color: #404040 !important;
                }
                .rdp-neutral .rdp-day:not(.rdp-selected) button:hover {
                  background-color: #f5f5f5 !important;
                }
              `}</style>
              <DayPicker
                mode="single"
                selected={editDueDate ? new Date(editDueDate + "T12:00:00") : undefined}
                onSelect={(d) => {
                  if (d) {
                    const yyyy = d.getFullYear();
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const dd = String(d.getDate()).padStart(2, '0');
                    setEditDueDate(`${yyyy}-${mm}-${dd}`);
                  }
                }}
                defaultMonth={editDueDate ? new Date(editDueDate + "T12:00:00") : new Date()}
                showOutsideDays
                className="!font-sans rdp-neutral mx-auto"
              />
            </div>
            <div className="px-5 py-4 border-t border-neutral-100 bg-neutral-50 flex gap-3">
              <button onClick={() => setDueDateModal(null)} className="flex-1 py-3 rounded-xl border-2 border-neutral-200 text-neutral-600 font-semibold hover:bg-white transition-colors">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (onUpdateDueDate) onUpdateDueDate(dueDateModal.loan.id, editDueDate);
                  setDueDateModal(null);
                }}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-neutral-700 to-neutral-800 text-white font-semibold hover:from-neutral-800 hover:to-neutral-900 transition-colors shadow-lg"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
