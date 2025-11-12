export const nf = new Intl.NumberFormat();

export const todayPlus = (d) => {
  const x = new Date();
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
};

export const ymd = (d) => {
  const x = new Date(d);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const startOfDayUTC = (date) =>
  new Date(ymd(date) + "T00:00:00Z").toISOString();

export const nextDayUTC = (date) => {
  const d = new Date(ymd(date) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
};

export const oneYearAgoISO = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 365);
  return d.toISOString();
};
