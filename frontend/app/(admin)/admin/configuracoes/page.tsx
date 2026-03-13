"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAdminStore, type AdminSettingsData } from "@/lib/store";

export default function AdminConfiguracoes() {
  const { settings, setSettings } = useAdminStore();
  const [form, setForm] = useState<AdminSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<AdminSettingsData>("/api/admin/settings");
        setSettings(data);
        setForm(data);
      } catch {
        // handled
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setSaved(false);
    try {
      const updated = await api.put<AdminSettingsData>("/api/admin/settings", form);
      setSettings(updated);
      setForm(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // handled
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-xs text-muted-foreground">Carregando configurações...</p>;
  }

  if (!form) {
    return <p className="text-xs text-muted-foreground">Erro ao carregar.</p>;
  }

  return (
    <div className="space-y-8 max-w-lg">
      <h1 className="text-xl font-semibold">Configurações</h1>

      <div className="space-y-6">
        {/* Daily Limit */}
        <div className="space-y-2">
          <label className="text-xs font-medium">
            Limite diário de gerações por usuário
          </label>
          <input
            type="number"
            min={1}
            max={50}
            value={form.daily_limit}
            onChange={(e) =>
              setForm({
                ...form,
                daily_limit: Math.min(50, Math.max(1, Number(e.target.value) || 1)),
              })
            }
            className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-[10px] text-muted-foreground">Mínimo 1, máximo 50</p>
        </div>

        {/* Feature Toggles */}
        <div className="space-y-3">
          <h2 className="text-xs font-medium">Funcionalidades</h2>

          <Toggle
            label="Text-to-Speech (TTS)"
            checked={form.tts_enabled}
            onChange={(v) => setForm({ ...form, tts_enabled: v })}
          />
          <Toggle
            label="Entrevista"
            checked={form.interview_enabled}
            onChange={(v) => setForm({ ...form, interview_enabled: v })}
          />
          <Toggle
            label="Carta de apresentação"
            checked={form.cover_letter_enabled}
            onChange={(v) => setForm({ ...form, cover_letter_enabled: v })}
          />
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-foreground text-background px-6 py-2.5 text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar"}
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-xs">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? "bg-foreground" : "bg-muted"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-background transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}
