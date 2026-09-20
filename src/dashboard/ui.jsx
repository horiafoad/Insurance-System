import { styles } from "./styles";
import { STATUS, getType } from "./data";

export function StatCard({ title, value, icon }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statIcon}>{icon}</div>
      <div>
        <div style={styles.statTitle}>{title}</div>
        <div style={styles.statValue}>{value}</div>
      </div>
    </div>
  );
}

export function ClaimStat({ title, value, icon }) {
  return (
    <div style={styles.claimStat}>
      <div style={styles.claimStatIcon}>{icon}</div>
      <div>
        <div style={styles.statTitle}>{title}</div>
        <div style={styles.claimStatValue}>{value}</div>
      </div>
    </div>
  );
}

export function MetricBar({ label, value }) {
  return (
    <div style={styles.progressWrap}>
      <div style={styles.progressLabel}>
        <span>{label}</span>
        <b>{value}%</b>
      </div>
      <div style={styles.progressTrack}>
        <div
          style={{
            ...styles.progressFill,
            width: `${Math.min(value, 100)}%`,
          }}
        />
      </div>
    </div>
  );
}

export function MetricRow({ name, value, weight }) {
  return (
    <div style={styles.criteriaRow}>
      <div style={{ minWidth: "190px" }}>
        <b>{name}</b>
        <small style={styles.weight}>وزن {weight}</small>
      </div>
      <div style={styles.criteriaBar}>
        <div
          style={{
            ...styles.criteriaFill,
            width: `${Math.min(value, 100)}%`,
          }}
        />
      </div>
      <b style={{ width: 55 }}>{value}%</b>
    </div>
  );
}

export function StatusBadge({ status }) {
  const item = STATUS[status] || STATUS.not_started;

  return (
    <span
      style={{
        ...styles.statusBadge,
        color: item.color,
        background: item.bg,
      }}
    >
      {item.icon} {item.label}
    </span>
  );
}

export function TaskMini({ task, onClick }) {
  return (
    <button style={styles.taskMini} onClick={onClick}>
      <span style={styles.taskMiniIcon}>{getType(task.type)?.icon || "📋"}</span>
      <span style={styles.taskMiniInfo}>
        <b>{task.title}</b>
        <small>{task.responsible || "بدون مسؤول"}</small>
      </span>
      <StatusBadge status={task.status} />
    </button>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{title}</h2>
          <button style={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, full = false }) {
  return (
    <div
      style={
        full
          ? {
              gridColumn: "1 / -1",
            }
          : {}
      }
    >
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  );
}

export function Detail({ label, value }) {
  return (
    <div style={styles.detailItem}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

export function EmptyState({ text }) {
  return <div style={styles.empty}>{text}</div>;
}
