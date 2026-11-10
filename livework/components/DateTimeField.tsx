// Livework — DateTimeField: native date + time picker for the event forms.
//
// Replaces the old free-text date input. On Android, Hermes' Date.parse
// rejects many typed formats, so events failed to save with a confusing
// error. The picker hands the form a real Date — no parsing, no format
// errors, and the value shown is always exactly what will be saved.
//
// Android: two-step native dialogs (date, then time). Dismissing either
// dialog keeps the previous value — no partial save.
// iOS: inline spinner with Done / Cancel.
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { THEME } from "../lib/theme";

export function formatDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Sensible default when nothing is picked yet: the next full hour.
function nextHour(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

export default function DateTimeField({
  value,
  onChange,
  error,
}: {
  value: Date | null;
  onChange: (d: Date) => void;
  error: string | null;
}) {
  const [show, setShow] = useState(false);
  const [mode, setMode] = useState<"date" | "time">("date");
  const [temp, setTemp] = useState<Date>(value ?? nextHour());

  function open() {
    setTemp(value ?? nextHour());
    setMode("date");
    setShow(true);
  }

  function onAndroidChange(e: DateTimePickerEvent, selected?: Date) {
    if (e.type === "dismissed") {
      // Dismissing either dialog keeps the previous value.
      setShow(false);
      return;
    }
    const picked = selected ?? temp;
    if (mode === "date") {
      // Keep the current time-of-day, then open the time dialog.
      const merged = new Date(temp);
      merged.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
      setTemp(merged);
      setMode("time");
      // show stays true: the picker re-renders as the time dialog.
    } else {
      const merged = new Date(temp);
      merged.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
      setShow(false);
      onChange(merged);
    }
  }

  return (
    <View>
      <Pressable
        style={[styles.field, error ? styles.fieldError : null]}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel="Pick event date and time"
      >
        <Text style={value ? styles.value : styles.placeholder}>
          {value ? formatDateTime(value) : "Tap to pick a date & time"}
        </Text>
        <Ionicons name="calendar-outline" size={20} color={THEME.textMuted} />
      </Pressable>
      {!!error && <Text style={styles.inlineError}>{error}</Text>}

      {show && Platform.OS === "android" && (
        <DateTimePicker
          value={temp}
          mode={mode}
          is24Hour={false}
          onChange={onAndroidChange}
        />
      )}

      {show && Platform.OS === "ios" && (
        <View style={styles.iosWrap}>
          <DateTimePicker
            value={temp}
            mode="datetime"
            display="spinner"
            textColor="#fff"
            onChange={(_, selected) => {
              if (selected) setTemp(selected);
            }}
          />
          <View style={styles.iosBtns}>
            <Pressable style={styles.iosBtn} onPress={() => setShow(false)}>
              <Text style={styles.iosBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.iosBtn, styles.iosDone]}
              onPress={() => {
                setShow(false);
                onChange(temp);
              }}
            >
              <Text style={[styles.iosBtnText, styles.iosDoneText]}>Done</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldError: { borderColor: "#F9A8D4" },
  value: { color: "#fff", fontSize: 15 },
  placeholder: { color: THEME.textFaint, fontSize: 15 },
  inlineError: { color: "#F9A8D4", fontSize: 12, marginTop: 6, lineHeight: 16 },
  iosWrap: {
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 12,
    marginTop: 8,
    padding: 8,
  },
  iosBtns: { flexDirection: "row", justifyContent: "flex-end", gap: 8, padding: 4 },
  iosBtn: {
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  iosBtnText: { color: THEME.textMuted, fontSize: 14, fontWeight: "700" },
  iosDone: { backgroundColor: THEME.purple, borderColor: THEME.purple },
  iosDoneText: { color: "#fff" },
});
