import React from "react";
import { Select } from "@base-ui/react/select";
import styles from "./RoomSelect.module.css";

function Chevron() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <path d="M2.5 6.2 5 8.6l4.5-5.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** @param items list of { value, label } */
export default function RoomSelect({ disabled = false, items, label, onValueChange, value }) {
  return (
    <div className={styles.field}>
      <Select.Root disabled={disabled} items={items} onValueChange={onValueChange} value={value}>
        <Select.Label className={styles.label}>{label}</Select.Label>
        <Select.Trigger className={styles.trigger}>
          <Select.Value className={styles.value} />
          <Select.Icon className={styles.icon}><Chevron /></Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner className={styles.positioner} alignItemWithTrigger={false} sideOffset={6}>
            <Select.Popup className={styles.popup}>
              <Select.List>
                {items.map((item) => (
                  <Select.Item key={item.value} className={styles.item} value={item.value}>
                    <Select.ItemText>{item.label}</Select.ItemText>
                    <Select.ItemIndicator className={styles.indicator}><Check /></Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
