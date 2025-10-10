// "Branch-3" / "branch_7" / "Branch 12" → "3" / "7" / "12"
export function getBranchIdFromRole(name = "") {
  const m = String(name)
    .trim()
    .match(/^branch[-_ ]?(\d+)$/i);
  return m ? m[1] : null;
}
export const isOwner = (name = "") => /^owner$/i.test(String(name).trim());
export const isWarehouse = (name = "") =>
  /^warehouse$/i.test(String(name).trim());
export const isBranchRole = (name = "") => getBranchIdFromRole(name) !== null;
