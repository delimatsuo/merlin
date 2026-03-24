"use client";

import { useState, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { X, Loader2 } from "lucide-react";
import { useTranslation } from "@/lib/hooks/useTranslation";
import { api } from "@/lib/api";
import { useJobFeedStore, type JobPreferences } from "@/lib/store";
import { toast } from "sonner";

const WORK_MODES = [
  { value: "remote", labelKey: "vagas.prefs.remote" },
  { value: "hybrid", labelKey: "vagas.prefs.hybrid" },
  { value: "onsite", labelKey: "vagas.prefs.onsite" },
] as const;

interface Props {
  initial?: JobPreferences | null;
  onSaved?: () => void;
}

export function JobPreferencesForm({ initial, onSaved }: Props) {
  const { t } = useTranslation();
  const { setPreferences } = useJobFeedStore();

  const [titles, setTitles] = useState<string[]>(initial?.desired_titles || []);
  const [titleInput, setTitleInput] = useState("");
  const [locations, setLocations] = useState<string[]>(initial?.locations || []);
  const [locationInput, setLocationInput] = useState("");
  const [workMode, setWorkMode] = useState<string[]>(initial?.work_mode || []);
  const [emailDigest, setEmailDigest] = useState(initial?.email_digest ?? true);
  const [saving, setSaving] = useState(false);

  const addChip = (
    value: string,
    list: string[],
    setList: (v: string[]) => void,
    max: number,
  ) => {
    const trimmed = value.trim();
    if (!trimmed || list.length >= max) return;
    if (list.some((item) => item.toLowerCase() === trimmed.toLowerCase())) return;
    setList([...list, trimmed]);
  };

  const removeChip = (index: number, list: string[], setList: (v: string[]) => void) => {
    setList(list.filter((_, i) => i !== index));
  };

  const handleKeyDown = (
    e: KeyboardEvent<HTMLInputElement>,
    value: string,
    setValue: (v: string) => void,
    list: string[],
    setList: (v: string[]) => void,
    max: number,
  ) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addChip(value, list, setList, max);
      setValue("");
    }
    if (e.key === "Backspace" && !value && list.length > 0) {
      setList(list.slice(0, -1));
    }
  };

  const toggleOption = (value: string, list: string[], setList: (v: string[]) => void) => {
    if (list.includes(value)) {
      setList(list.filter((v) => v !== value));
    } else {
      setList([...list, value]);
    }
  };

  const handleSave = async () => {
    if (titles.length === 0) return;

    setSaving(true);
    try {
      const result = await api.put<JobPreferences>("/api/jobs/preferences", {
        desired_titles: titles,
        locations,
        work_mode: workMode,
        seniority: [],
        min_score: 50,
        email_digest: emailDigest,
      });
      setPreferences(result);
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar preferências.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="apple-shadow rounded-2xl bg-card overflow-hidden">
      <div className="px-8 pt-8 pb-2">
        <h2 className="text-lg font-semibold text-foreground">
          {t("vagas.prefs.title")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("vagas.prefs.subtitle")}
        </p>
      </div>

      <div className="p-8 pt-6 space-y-6">
        {/* Desired Titles (chips input) */}
        <div>
          <label className="text-xs font-medium text-foreground mb-2 block">
            {t("vagas.prefs.titlesLabel")}
          </label>
          <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-secondary min-h-[44px] focus-within:ring-2 focus-within:ring-ring transition-all">
            {titles.map((title, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-foreground/[0.06] text-xs font-medium"
              >
                {title}
                <button
                  onClick={() => removeChip(i, titles, setTitles)}
                  className="text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {titles.length < 10 && (
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onKeyDown={(e) =>
                  handleKeyDown(e, titleInput, setTitleInput, titles, setTitles, 10)
                }
                onBlur={() => {
                  if (titleInput.trim()) {
                    addChip(titleInput, titles, setTitles, 10);
                    setTitleInput("");
                  }
                }}
                placeholder={titles.length === 0 ? t("vagas.prefs.titlesPlaceholder") : ""}
                className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
              />
            )}
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-1.5">
            {t("vagas.prefs.titlesHint")}
          </p>
        </div>

        {/* Locations (chips input) */}
        <div>
          <label className="text-xs font-medium text-foreground mb-2 block">
            {t("vagas.prefs.locationsLabel")}
          </label>
          <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-secondary min-h-[44px] focus-within:ring-2 focus-within:ring-ring transition-all">
            {locations.map((loc, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-foreground/[0.06] text-xs font-medium"
              >
                {loc}
                <button
                  onClick={() => removeChip(i, locations, setLocations)}
                  className="text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {locations.length < 10 && (
              <input
                type="text"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                onKeyDown={(e) =>
                  handleKeyDown(e, locationInput, setLocationInput, locations, setLocations, 10)
                }
                onBlur={() => {
                  if (locationInput.trim()) {
                    addChip(locationInput, locations, setLocations, 10);
                    setLocationInput("");
                  }
                }}
                placeholder={locations.length === 0 ? t("vagas.prefs.locationsPlaceholder") : ""}
                className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
              />
            )}
          </div>
        </div>

        {/* Work Mode (toggle pills) */}
        <div>
          <label className="text-xs font-medium text-foreground mb-2 block">
            {t("vagas.prefs.workModeLabel")}
          </label>
          <div className="flex flex-wrap gap-2">
            {WORK_MODES.map((mode) => (
              <button
                key={mode.value}
                onClick={() => toggleOption(mode.value, workMode, setWorkMode)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                  workMode.includes(mode.value)
                    ? "bg-foreground text-background"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(mode.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Email digest toggle */}
        <label className="flex items-center gap-3 cursor-pointer group">
          <div className="relative">
            <input
              type="checkbox"
              checked={emailDigest}
              onChange={(e) => setEmailDigest(e.target.checked)}
              className="peer sr-only"
            />
            <div className="h-6 w-10 rounded-full bg-secondary transition-colors duration-200 peer-checked:bg-foreground" />
            <div className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-4" />
          </div>
          <span className="text-sm text-foreground">
            {t("vagas.prefs.emailDigest")}
          </span>
        </label>

        {/* Save button */}
        <Button
          onClick={handleSave}
          disabled={titles.length === 0 || saving}
          className="h-11 px-6 rounded-full text-sm font-semibold w-full"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("vagas.prefs.saving")}
            </>
          ) : (
            t("vagas.prefs.save")
          )}
        </Button>
      </div>
    </div>
  );
}
