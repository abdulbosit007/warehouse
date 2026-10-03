// What a branch request is for:
//   restock — normal request: fills the requester's own stock
//   sale    — sale request (Sale page): a customer order, sold on arrival
//   loan    — loan request (Sale page, Loan tab): loaned to a borrower on arrival
export const requestType = (purpose) => (purpose === "sale" || purpose === "loan" ? purpose : "restock");

// Tint of a request card's header (the part shown when folded); the items inside stay white.
const HEADER = {
  restock: "bg-slate-100 hover:bg-slate-200/70",
  sale: "bg-orange-100/80 hover:bg-orange-100",
  loan: "bg-violet-100/80 hover:bg-violet-100",
};

export const requestHeaderClass = (purpose) => HEADER[requestType(purpose)];
