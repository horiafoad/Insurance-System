import fs from "node:fs";

const plan = JSON.parse(fs.readFileSync("scripts/claims-replace/import-plan.json", "utf8"));
const claims = plan.claims;

const q = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return `'${String(v).replace(/'/g, "''")}'`;
};
const j = (v) => (v === null || v === undefined ? "NULL" : `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`);
const d = (v) => (v ? `'${String(v).slice(0, 10)}'::date` : "NULL");
const ts = (v) => (v ? `'${String(v)}'::timestamptz` : "NULL");

let sql = `-- Import of "مطالبات (4).xlsx" into public.claims / public.claim_installments\n`;
sql += `-- Generated ${new Date().toISOString()}\n`;
sql += `-- Expected: ${plan.summary.totalClaims} claims, ${plan.summary.totalInst} installments\n\n`;
sql += `BEGIN;\n\n`;
sql += `-- Safety check: the claims section must be empty before this import.\n`;
sql += `DO $$\nDECLARE n bigint;\nBEGIN\n  SELECT count(*) INTO n FROM public.claims;\n  IF n <> 0 THEN\n    RAISE EXCEPTION 'Aborting: public.claims is not empty (% rows).', n;\n  END IF;\nEND $$;\n\n`;
sql += `CREATE TEMP TABLE _claims_import (\n  sheet_name text, row_number integer, data jsonb, claimant_name text, claim_number text,\n  claim_date date, amount numeric, status text, notes text, file_name text, pdf_url text,\n  payment_status text, total_amount numeric, paid_amount numeric, remaining_amount numeric,\n  started_at timestamptz, settled_at timestamptz, settlement_reason text, settlement_notes text,\n  installments jsonb\n) ON COMMIT DROP;\n\n`;

for (const c of claims) {
  sql += `INSERT INTO _claims_import VALUES (${q(c.sheet_name)}, ${c.row_number}, ${j(c.data)}, ${q(c.claimant_name)}, ${q(c.claim_number)}, ${d(c.claim_date)}, ${q(c.amount)}, ${q(c.status)}, ${q(c.notes)}, ${q(c.file_name)}, ${q(c.pdf_url)}, ${q(c.payment_status)}, ${q(c.total_amount)}, ${q(c.paid_amount)}, ${q(c.remaining_amount)}, ${ts(c.started_at)}, ${ts(c.settled_at)}, ${q(c.settlement_reason)}, ${q(c.settlement_notes)}, ${j(c.installments)});\n`;
}

sql += `\nINSERT INTO public.claims (sheet_name, row_number, data, claimant_name, claim_number, claim_date, amount, status, notes, file_name, pdf_url, payment_status, total_amount, paid_amount, remaining_amount, started_at, settled_at, settlement_reason, settlement_notes)\nSELECT sheet_name, row_number, data, claimant_name, claim_number, claim_date, amount, status, notes, file_name, pdf_url, payment_status, total_amount, paid_amount, remaining_amount, started_at, settled_at, settlement_reason, settlement_notes FROM _claims_import;\n\n`;
sql += `INSERT INTO public.claim_installments (claim_id, installment_number, amount, paid, paid_at, receipt_number)\nSELECT c.id, (i->>'number')::int, (i->>'amount')::numeric, (i->>'paid')::boolean, NULLIF(i->>'paid_at','')::timestamptz, NULLIF(i->>'receipt_number','')\nFROM _claims_import ci\nJOIN public.claims c ON c.sheet_name = ci.sheet_name AND c.row_number = ci.row_number\nCROSS JOIN LATERAL jsonb_array_elements(ci.installments) i;\n\n`;

sql += `DO $$\nDECLARE\n  v_claims bigint; v_inst bigint; v_total numeric; v_paid numeric; v_remaining numeric;\nBEGIN\n  SELECT count(*) INTO v_claims FROM public.claims;\n  SELECT count(*) INTO v_inst FROM public.claim_installments;\n  SELECT COALESCE(sum(total_amount),0), COALESCE(sum(paid_amount),0), COALESCE(sum(remaining_amount),0) INTO v_total, v_paid, v_remaining FROM public.claims;\n  IF v_claims <> ${plan.summary.totalClaims} THEN RAISE EXCEPTION 'Claim count mismatch: % (expected ${plan.summary.totalClaims})', v_claims; END IF;\n  IF v_inst <> ${plan.summary.totalInst} THEN RAISE EXCEPTION 'Installment count mismatch: % (expected ${plan.summary.totalInst})', v_inst; END IF;\n  IF round(v_total,2) <> ${plan.summary.totalAmount.toFixed(2)} THEN RAISE EXCEPTION 'Total amount mismatch: %', v_total; END IF;\n  IF round(v_paid,2) <> ${plan.summary.totalPaid.toFixed(2)} THEN RAISE EXCEPTION 'Paid amount mismatch: %', v_paid; END IF;\n  IF round(v_remaining,2) <> ${plan.summary.totalRemaining.toFixed(2)} THEN RAISE EXCEPTION 'Remaining amount mismatch: %', v_remaining; END IF;\n  RAISE NOTICE 'Import OK: % claims, % installments, total=%, paid=%, remaining=%', v_claims, v_inst, v_total, v_paid, v_remaining;\nEND $$;\n\nCOMMIT;\n`;
fs.writeFileSync("scripts/claims-replace/import.sql", sql, "utf8");
console.log("wrote import.sql", sql.length, "bytes");
