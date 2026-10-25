import React, { useState } from "react";
import { styles } from "./styles";
import { STATUS, TASK_TYPES, getType } from "./data";
import { Detail, Field, Modal, StatusBadge } from "./ui";

export function TaskFormModal({
  taskForm,
  setTaskForm,
  onClose,
  onSave,
}) {
  return (
    <Modal title="إضافة مهمة / معاملة جديدة" onClose={onClose}>
      <div style={styles.formGrid}>
        <Field label="اسم المهمة / المعاملة">
          <input
            value={taskForm.title}
            onChange={(e) =>
              setTaskForm({
                ...taskForm,
                title: e.target.value,
              })
            }
            placeholder="اسم المهمة"
            style={styles.input}
          />
        </Field>

        <Field label="نوع العمل">
          <select
            value={taskForm.type}
            onChange={(e) =>
              setTaskForm({
                ...taskForm,
                type: e.target.value,
              })
            }
            style={styles.input}
          >
            {TASK_TYPES.map((type) => (
              <option key={type.id} value={type.id}>
                {type.title}
              </option>
            ))}
          </select>
        </Field>

        <Field label="المسؤول">
          <input
            value={taskForm.responsible}
            onChange={(e) =>
              setTaskForm({
                ...taskForm,
                responsible: e.target.value,
              })
            }
            placeholder="اسم الموظف المسؤول"
            style={styles.input}
          />
        </Field>

        <Field label="تاريخ ورود المعاملة">
          <input
            type="date"
            value={taskForm.receivedDate}
            onChange={(e) =>
              setTaskForm({
                ...taskForm,
                receivedDate: e.target.value,
              })
            }
            style={styles.input}
          />
        </Field>

        <Field label="موعد الاستحقاق">
          <input
            type="date"
            value={taskForm.dueDate}
            onChange={(e) =>
              setTaskForm({
                ...taskForm,
                dueDate: e.target.value,
              })
            }
            style={styles.input}
          />
        </Field>

        <Field label="الحالة">
          <select
            value={taskForm.status}
            onChange={(e) =>
              setTaskForm({
                ...taskForm,
                status: e.target.value,
              })
            }
            style={styles.input}
          >
            {Object.entries(STATUS).map(([key, value]) => (
              <option key={key} value={key}>
                {value.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="ملاحظات" full>
          <textarea
            value={taskForm.notes}
            onChange={(e) =>
              setTaskForm({
                ...taskForm,
                notes: e.target.value,
              })
            }
            style={{
              ...styles.input,
              minHeight: "90px",
              resize: "vertical",
            }}
          />
        </Field>
      </div>

      <div style={styles.modalActions}>
        <button style={styles.secondaryButton} onClick={onClose}>
          إلغاء
        </button>
        <button style={styles.primaryButton} onClick={onSave}>
          حفظ المهمة
        </button>
      </div>
    </Modal>
  );
}

export function ClaimFormModal({
  claimForm,
  setClaimForm,
  claimLoading,
  onClose,
  onSave,
}) {
  return (
    <Modal title="＋ إضافة مطالبة جديدة" onClose={onClose}>
      <div style={styles.manualClaimIntro}>
        <span style={styles.manualClaimIcon}>📋</span>
        <div>
          <strong>إضافة مطالبة يدويًا</strong>
          <p>البيانات سيتم حفظها مباشرة في قاعدة بيانات Supabase.</p>
        </div>
      </div>

      <div style={styles.formGrid}>
        <Field label="اسم صاحب المطالبة">
          <input
            value={claimForm.claimantName}
            onChange={(e) =>
              setClaimForm({
                ...claimForm,
                claimantName: e.target.value,
              })
            }
            placeholder="اسم صاحب المطالبة"
            style={styles.input}
          />
        </Field>

        <Field label="رقم المطالبة">
          <input
            value={claimForm.claimNumber}
            onChange={(e) =>
              setClaimForm({
                ...claimForm,
                claimNumber: e.target.value,
              })
            }
            placeholder="رقم المطالبة"
            style={styles.input}
          />
        </Field>

        <Field label="التصنيف / الشيت">
          <input
            value={claimForm.sheetName}
            onChange={(e) =>
              setClaimForm({
                ...claimForm,
                sheetName: e.target.value,
              })
            }
            placeholder="مثال: مطالبات أغسطس"
            style={styles.input}
          />
        </Field>

        <Field label="تاريخ المطالبة">
          <input
            type="date"
            value={claimForm.claimDate}
            onChange={(e) =>
              setClaimForm({
                ...claimForm,
                claimDate: e.target.value,
              })
            }
            style={styles.input}
          />
        </Field>

        <Field label="المبلغ">
          <input
            type="number"
            value={claimForm.amount}
            onChange={(e) =>
              setClaimForm({
                ...claimForm,
                amount: e.target.value,
              })
            }
            placeholder="قيمة المطالبة"
            style={styles.input}
          />
        </Field>

        <Field label="الحالة">
          <select
            value={claimForm.status}
            onChange={(e) =>
              setClaimForm({
                ...claimForm,
                status: e.target.value,
              })
            }
            style={styles.input}
          >
            <option value="">اختار الحالة</option>
            <option value="جديدة">جديدة</option>
            <option value="قيد المراجعة">قيد المراجعة</option>
            <option value="في انتظار مستندات">في انتظار مستندات</option>
            <option value="تم التنفيذ">تم التنفيذ</option>
            <option value="مرفوضة">مرفوضة</option>
          </select>
        </Field>

        <Field label="ملاحظات" full>
          <textarea
            value={claimForm.notes}
            onChange={(e) =>
              setClaimForm({
                ...claimForm,
                notes: e.target.value,
              })
            }
            placeholder="أي ملاحظات إضافية..."
            style={{
              ...styles.input,
              minHeight: 100,
              resize: "vertical",
            }}
          />
        </Field>
      </div>

      <div style={styles.modalActions}>
        <button style={styles.secondaryButton} onClick={onClose}>
          إلغاء
        </button>
        <button
          style={styles.primaryButton}
          onClick={onSave}
          disabled={claimLoading}
        >
          {claimLoading ? "جاري الحفظ..." : "💾 حفظ المطالبة"}
        </button>
      </div>
    </Modal>
  );
}

export function TaskDetailsModal({ task, onClose, onUpdate, onDelete }) {
  return (
    <Modal title="تفاصيل المهمة" onClose={onClose}>
      <div style={styles.detailHeader}>
        <div>
          <h3 style={{ margin: 0 }}>{task.title}</h3>
          <p style={styles.cardSub}>{getType(task.type)?.title}</p>
        </div>
        <StatusBadge status={task.status} />
      </div>

      <div style={styles.detailGrid}>
        <Detail label="المسؤول" value={task.responsible || "—"} />
        <Detail label="تاريخ الورود" value={task.receivedDate || "—"} />
        <Detail label="موعد التنفيذ" value={task.dueDate || "غير محدد"} />
        <Detail label="المراجعة" value={task.reviewed ? "تمت" : "لم تتم"} />
        <Detail label="الرفع" value={task.uploaded ? "تم" : "لم يتم"} />
        <Detail label="الملاحظات" value={task.notes || "لا توجد"} />
      </div>

      <div style={styles.statusActions}>
        <span style={styles.actionTitle}>تحديث الحالة:</span>
        {Object.entries(STATUS).map(([key, value]) => (
          <button
            key={key}
            onClick={() =>
              onUpdate(task.id, {
                status: key,
              })
            }
            style={{
              ...styles.statusButton,
              background: task.status === key ? value.bg : "#fff",
              borderColor: task.status === key ? value.color : "#E5E7EB",
              color: value.color,
            }}
          >
            {value.icon} {value.label}
          </button>
        ))}
      </div>

      <div style={styles.checkRow}>
        <label>
          <input
            type="checkbox"
            checked={task.reviewed}
            onChange={(e) =>
              onUpdate(task.id, {
                reviewed: e.target.checked,
              })
            }
          />{" "}
          تمت المراجعة
        </label>

        <label>
          <input
            type="checkbox"
            checked={task.uploaded}
            onChange={(e) =>
              onUpdate(task.id, {
                uploaded: e.target.checked,
              })
            }
          />{" "}
          تم الرفع
        </label>
      </div>

      <div style={styles.modalActions}>
        <button
          style={styles.deleteLargeButton}
          onClick={() => onDelete(task.id)}
        >
          حذف المهمة
        </button>
        <button style={styles.primaryButton} onClick={onClose}>
          إغلاق
        </button>
      </div>
    </Modal>
  );
}

export function InstallmentModal({
  claim,
  installmentNumber,
  amount,
  onClose,
  onSave,
}) {
  const [form, setForm] = useState({
    amount: amount || "",
    receiptNumber: "",
    paidAt: "",
    notes: "",
  });

  return (
    <Modal title={` تسديد القسط ${installmentNumber}`} onClose={onClose}>
      <div style={styles.formGrid}>
        <Field label="مبلغ القسط">
          <input
            type="number"
            value={form.amount}
            onChange={(e) =>
              setForm({ ...form, amount: e.target.value })
            }
            style={styles.input}
          />
        </Field>

        <Field label="رقم الإيصال">
          <input
            value={form.receiptNumber}
            onChange={(e) =>
              setForm({ ...form, receiptNumber: e.target.value })
            }
            style={styles.input}
          />
        </Field>

        <Field label="تاريخ السداد">
          <input
            type="date"
            value={form.paidAt}
            onChange={(e) =>
              setForm({ ...form, paidAt: e.target.value })
            }
            style={styles.input}
          />
        </Field>

        <Field label="ملاحظات" full>
          <textarea
            value={form.notes}
            onChange={(e) =>
              setForm({ ...form, notes: e.target.value })
            }
            style={{ ...styles.input, minHeight: 80, resize: "vertical" }}
          />
        </Field>
      </div>

      <div style={styles.modalActions}>
        <button style={styles.secondaryButton} onClick={onClose}>
          إلغاء
        </button>
        <button
          style={styles.primaryButton}
          onClick={() =>
            onSave(claim.id, installmentNumber, form.amount, form.receiptNumber, form.paidAt, form.notes)
          }
        >
          💾 تأكيد السداد
        </button>
      </div>
    </Modal>
  );
}

export function ExcelPreviewModal({ preview, importing, onClose, onImport }) {
  const [onlyNew, setOnlyNew] = useState(true);

  return (
    <Modal title="معاينة الملف قبل الاستيراد" onClose={onClose}>
      <div style={{ marginBottom: 12, lineHeight: 1.8 }}>
        <div><strong>اسم الملف:</strong> {preview.fileName}</div>
        <div><strong>عدد الملفات (Sheets):</strong> {preview.sheets.join("، ")}</div>
        <div><strong>عدد الأعمدة:</strong> {preview.columns.length}</div>
        <div><strong>إجمالي السجلات:</strong> {preview.totalRows}</div>
        <div style={{ color: "#16A34A" }}><strong>جديد:</strong> {preview.newRows}</div>
        <div style={{ color: "#DC2626" }}><strong>موجود مسبقًا:</strong> {preview.duplicateRows}</div>
      </div>

      {preview.issues?.length > 0 && (
        <div style={{ ...styles.infoBox, background: "#FEF3C7", marginBottom: 12 }}>
          <strong>تنبيهات ({preview.issues.length}):</strong>
          <ul style={{ margin: "6px 0 0", paddingInlineStart: 18 }}>
            {preview.issues.slice(0, 5).map((issue, idx) => (
              <li key={idx}>
                {issue.sheet_name} - صف {issue.row_number} ({issue.claimant_name}):{" "}
                {issue.message}
              </li>
            ))}
          </ul>
          {preview.issues.length > 5 && (
            <div>و{preview.issues.length - 5} تنبيهات أخرى.</div>
          )}
        </div>
      )}

      <div style={{ marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          style={{ ...styles.secondaryButton, flex: 1 }}
          onClick={() => setOnlyNew(true)}
        >
          استيراد جديد فقط
        </button>
        <button
          style={{ ...styles.secondaryButton, flex: 1 }}
          onClick={() => setOnlyNew(false)}
        >
          استيراد الكل مع تحديث الموجود
        </button>
      </div>

      <div style={{ maxHeight: 300, overflowY: "auto", marginBottom: 12 }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>الشيت</th>
              <th style={styles.th}>الصف</th>
              <th style={styles.th}>الاسم</th>
              <th style={styles.th}>رقم المطالبة</th>
              <th style={styles.th}>المبلغ</th>
              <th style={styles.th}>حالة السداد</th>
              <th style={styles.th}>الأقساط</th>
              <th style={styles.th}>حالة الاستيراد</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.slice(0, 100).map((row, idx) => (
              <tr key={idx} style={row.isDuplicate ? { background: "#FEF2F2" } : styles.tr}>
                <td style={styles.td}>{row.sheet_name}</td>
                <td style={styles.td}>{row.row_number}</td>
                <td style={styles.td}>{row.claimant_name || ""}</td>
                <td style={styles.td}>{row.claim_number || ""}</td>
                <td style={styles.td}>{row.total_amount}</td>
                <td style={styles.td}>{row.payment_status || ""}</td>
                <td style={styles.td}>{row.installments.length}</td>
                <td style={styles.td}>
                  {row.isDuplicate ? (
                    <span style={{ color: "#DC2626", fontWeight: 700 }}>مكرر</span>
                  ) : (
                    <span style={{ color: "#16A34A", fontWeight: 700 }}>جديد</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {preview.rows.length > 100 && (
          <div style={styles.infoBox}>يُعرض أول 100 سجل للمعاينة فقط.</div>
        )}
      </div>

      <div style={styles.modalActions}>
        <button style={styles.secondaryButton} onClick={onClose}>
          إغلاق
        </button>
        <button
          style={{ ...styles.primaryButton, background: importing ? "#94A3B8" : "#2563EB" }}
          onClick={() => onImport(onlyNew)}
          disabled={importing}
        >
          {importing ? "جاري الاستيراد..." : "✅ تأكيد الاستيراد"}
        </button>
      </div>
    </Modal>
  );
}
