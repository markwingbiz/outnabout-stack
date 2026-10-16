// Livework — shared venue form (Phase 7 Slice 2).
// Used by both setup-venue.tsx (onboarding: creates tenant + membership +
// venue) and venue-form.tsx (venues screen: add / edit a venue row).
// The form is UI + validation only: the parent supplies onSubmit, which
// performs the actual inserts/updates. Both screens therefore share the
// exact same fields, labels, placeholders, and validation — no divergent
// copies of the form.
//
// Fields mirror the venues table columns the vendor edits: name (required),
// address, city, state, phone, website. venues.hours / venues.tags have DB
// defaults and are never edited here; tenant_id is set by the parent, not
// by this form.
import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, Alert } from "react-native";
import { THEME } from "../lib/theme";

export type VenueFormValues = {
  name: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  website: string;
};

type Props = {
  initial?: Partial<VenueFormValues>;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (values: VenueFormValues) => void | Promise<void>;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

export default function VenueForm({ initial, submitLabel, busy, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [state, setState] = useState(initial?.state ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");

  function handleSubmit() {
    if (!name.trim()) {
      Alert.alert("Missing venue name", "Enter your venue name.");
      return;
    }
    void onSubmit({
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      phone: phone.trim(),
      website: website.trim(),
    });
  }

  return (
    <View>
      <Field label="Venue Name *">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. The Brickhouse"
          placeholderTextColor={THEME.textFaint}
          style={styles.input}
        />
      </Field>

      <Field label="Address">
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="Street address"
          placeholderTextColor={THEME.textFaint}
          style={styles.input}
        />
      </Field>

      <Field label="City">
        <TextInput
          value={city}
          onChangeText={setCity}
          placeholder="City"
          placeholderTextColor={THEME.textFaint}
          style={styles.input}
        />
      </Field>

      <Field label="State">
        <TextInput
          value={state}
          onChangeText={setState}
          placeholder="State"
          placeholderTextColor={THEME.textFaint}
          style={styles.input}
        />
      </Field>

      <Field label="Phone">
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="Phone"
          placeholderTextColor={THEME.textFaint}
          style={styles.input}
          keyboardType="phone-pad"
        />
      </Field>

      <Field label="Website">
        <TextInput
          value={website}
          onChangeText={setWebsite}
          placeholder="https://…"
          placeholderTextColor={THEME.textFaint}
          style={styles.input}
          keyboardType="url"
          autoCapitalize="none"
        />
      </Field>

      <Pressable style={[styles.saveBtn, busy && { opacity: 0.7 }]} onPress={handleSubmit} disabled={busy}>
        <Text style={styles.saveText}>{busy ? "Saving…" : submitLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 14 },
  label: { color: THEME.textMuted, fontSize: 13, fontWeight: "700", marginBottom: 8 },
  input: {
    backgroundColor: THEME.card,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
    color: "#fff",
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: THEME.purple,
    borderRadius: 12,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  saveText: { color: "#fff", fontWeight: "900", fontSize: 16 },
});
