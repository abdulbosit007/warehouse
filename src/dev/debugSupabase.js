// src/dev/debugSupabase.js
export async function runQ(label, qb) {
  const started = performance.now();
  try {
    const { data, error } = await qb;
    const ms = (performance.now() - started).toFixed(1);
    if (error) {
      console.error(`❌ ${label} failed in ${ms}ms`, error);
    } else {
      const n = Array.isArray(data) ? data.length : data == null ? 0 : 1;
      console.log(`✅ ${label} OK in ${ms}ms — rows: ${n}`, data);
    }
    return { data, error };
  } catch (e) {
    console.error(`💥 ${label} threw`, e);
    return { data: null, error: e };
  }
}
