import { create } from "zustand";
import { User } from "firebase/auth";

interface AuthState {
  user: User | null;
  loading: boolean;
  setAuth: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setAuth: (user) => set({ user, loading: false }),
}));

interface ProfileData {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  experience?: Array<{
    company: string;
    role: string;
    startDate: string;
    endDate?: string;
    description: string;
  }>;
  education?: Array<{
    institution: string;
    degree: string;
    field: string;
    startDate: string;
    endDate?: string;
  }>;
  skills?: string[];
  languages?: Array<{ language: string; level: string }>;
  certifications?: string[];
  status?: string;
}

interface ProfileState {
  profile: ProfileData | null;
  loading: boolean;
  setProfile: (profile: ProfileData | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  loading: false,
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
}));

interface ApplicationState {
  jobDescription: string;
  jobAnalysis: Record<string, unknown> | null;
  atsScore: number | null;
  skillsMatrix: Record<string, unknown> | null;
  tailoredResume: string | null;
  coverLetter: string | null;
  applicationId: string;
  followUp: { decision: string; questions: string[] } | null;
  setJobDescription: (text: string) => void;
  setJobAnalysis: (analysis: Record<string, unknown> | null) => void;
  setAtsScore: (score: number | null) => void;
  setSkillsMatrix: (matrix: Record<string, unknown> | null) => void;
  setTailoredResume: (resume: string | null) => void;
  setCoverLetter: (letter: string | null) => void;
  setApplicationId: (id: string) => void;
  setFollowUp: (followUp: { decision: string; questions: string[] } | null) => void;
  reset: () => void;
}

export const useApplicationStore = create<ApplicationState>((set) => ({
  jobDescription: "",
  jobAnalysis: null,
  atsScore: null,
  skillsMatrix: null,
  tailoredResume: null,
  coverLetter: null,
  applicationId: "",
  followUp: null,
  setJobDescription: (jobDescription) => set({ jobDescription }),
  setJobAnalysis: (jobAnalysis) => set({ jobAnalysis }),
  setAtsScore: (atsScore) => set({ atsScore }),
  setSkillsMatrix: (skillsMatrix) => set({ skillsMatrix }),
  setTailoredResume: (tailoredResume) => set({ tailoredResume }),
  setCoverLetter: (coverLetter) => set({ coverLetter }),
  setApplicationId: (applicationId) => set({ applicationId }),
  setFollowUp: (followUp) => set({ followUp }),
  reset: () =>
    set({
      jobDescription: "",
      jobAnalysis: null,
      atsScore: null,
      skillsMatrix: null,
      tailoredResume: null,
      coverLetter: null,
      applicationId: "",
      followUp: null,
    }),
}));

interface WorkflowState {
  profileId: string;
  applicationId: string;
  steps: {
    upload: boolean;
    interview: boolean;
    job: boolean;
    analysis: boolean;
    result: boolean;
  };
  loading: boolean;
  setProfileId: (id: string) => void;
  setApplicationId: (id: string) => void;
  setSteps: (steps: WorkflowState["steps"]) => void;
  setLoading: (loading: boolean) => void;
  markStep: (step: keyof WorkflowState["steps"]) => void;
}

// --- Processing Tasks (global background tasks) ---

interface ProcessingTask {
  id: string;
  label: string;
  status: "running" | "done" | "error";
  error?: string;
}

interface ProcessingState {
  tasks: ProcessingTask[];
  addTask: (id: string, label: string) => void;
  completeTask: (id: string) => void;
  failTask: (id: string, error: string) => void;
  removeTask: (id: string) => void;
  clearDone: () => void;
}

export const useProcessingStore = create<ProcessingState>((set) => ({
  tasks: [],
  addTask: (id, label) =>
    set((state) => ({
      tasks: [...state.tasks.filter((t) => t.id !== id), { id, label, status: "running" }],
    })),
  completeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, status: "done" } : t)),
    })),
  failTask: (id, error) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, status: "error", error } : t)),
    })),
  removeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    })),
  clearDone: () =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.status === "running"),
    })),
}));

export const useWorkflowStore = create<WorkflowState>((set) => ({
  profileId: "",
  applicationId: "",
  steps: {
    upload: false,
    interview: false,
    job: false,
    analysis: false,
    result: false,
  },
  loading: true,
  setProfileId: (profileId) => set({ profileId }),
  setApplicationId: (applicationId) => set({ applicationId }),
  setSteps: (steps) => set({ steps }),
  setLoading: (loading) => set({ loading }),
  markStep: (step) =>
    set((state) => ({
      steps: { ...state.steps, [step]: true },
    })),
}));

// --- Knowledge Store ---

interface KnowledgeState {
  knowledge: Record<string, unknown> | null;
  loading: boolean;
  setKnowledge: (knowledge: Record<string, unknown> | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useKnowledgeStore = create<KnowledgeState>((set) => ({
  knowledge: null,
  loading: false,
  setKnowledge: (knowledge) => set({ knowledge }),
  setLoading: (loading) => set({ loading }),
}));

// --- Applications List Store ---

export interface ApplicationSummary {
  id: string;
  title: string;
  company: string;
  atsScore: number | null;
  status: string;
  versionCount: number;
  createdAt: string;
}

interface ApplicationsListState {
  applications: ApplicationSummary[];
  loading: boolean;
  hasMore: boolean;
  nextCursor: string;
  setApplications: (apps: ApplicationSummary[]) => void;
  appendApplications: (apps: ApplicationSummary[]) => void;
  removeApplication: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setHasMore: (hasMore: boolean) => void;
  setNextCursor: (cursor: string) => void;
}

export const useApplicationsListStore = create<ApplicationsListState>((set) => ({
  applications: [],
  loading: false,
  hasMore: false,
  nextCursor: "",
  setApplications: (applications) => set({ applications }),
  appendApplications: (apps) =>
    set((state) => ({ applications: [...state.applications, ...apps] })),
  removeApplication: (id) =>
    set((state) => ({
      applications: state.applications.filter((a) => a.id !== id),
    })),
  setLoading: (loading) => set({ loading }),
  setHasMore: (hasMore) => set({ hasMore }),
  setNextCursor: (nextCursor) => set({ nextCursor }),
}));

// --- Admin Store ---

export interface AdminStats {
  totalUsers: number;
  generationsToday: number;
  generationsMonth: number;
  signupsMonth: number;
}

export interface AdminUser {
  uid: string;
  email: string;
  name: string;
  createdAt: string;
  profileCount: number;
  applicationCount: number;
  generationCount: number;
}

export interface AdminDailyPoint {
  date: string;
  count: number;
}

export interface AdminGeneration {
  id: string;
  uid: string;
  userEmail: string;
  company: string;
  type?: string;
  createdAt: string;
}

export interface AdminSettingsData {
  daily_limit: number;
  global_generation_limit: number;
  tts_enabled: boolean;
  interview_enabled: boolean;
  cover_letter_enabled: boolean;
}

interface AdminState {
  isAdmin: boolean | null; // null = not checked yet
  stats: AdminStats | null;
  globalGenerations: number;
  globalLimit: number;
  dailyChart: AdminDailyPoint[];
  recentGenerations: AdminGeneration[];
  users: AdminUser[];
  usersCursor: string;
  usersHasMore: boolean;
  settings: AdminSettingsData | null;
  loading: boolean;
  setIsAdmin: (v: boolean) => void;
  setStats: (s: AdminStats) => void;
  setGlobalGenerations: (n: number) => void;
  setGlobalLimit: (n: number) => void;
  setDailyChart: (d: AdminDailyPoint[]) => void;
  setRecentGenerations: (g: AdminGeneration[]) => void;
  setUsers: (u: AdminUser[]) => void;
  appendUsers: (u: AdminUser[]) => void;
  setUsersCursor: (c: string) => void;
  setUsersHasMore: (h: boolean) => void;
  setSettings: (s: AdminSettingsData) => void;
  setLoading: (l: boolean) => void;
}

export const useAdminStore = create<AdminState>((set) => ({
  isAdmin: null,
  stats: null,
  globalGenerations: 0,
  globalLimit: 10000,
  dailyChart: [],
  recentGenerations: [],
  users: [],
  usersCursor: "",
  usersHasMore: false,
  settings: null,
  loading: false,
  setIsAdmin: (isAdmin) => set({ isAdmin }),
  setStats: (stats) => set({ stats }),
  setGlobalGenerations: (globalGenerations) => set({ globalGenerations }),
  setGlobalLimit: (globalLimit) => set({ globalLimit }),
  setDailyChart: (dailyChart) => set({ dailyChart }),
  setRecentGenerations: (recentGenerations) => set({ recentGenerations }),
  setUsers: (users) => set({ users }),
  appendUsers: (users) =>
    set((state) => ({ users: [...state.users, ...users] })),
  setUsersCursor: (usersCursor) => set({ usersCursor }),
  setUsersHasMore: (usersHasMore) => set({ usersHasMore }),
  setSettings: (settings) => set({ settings }),
  setLoading: (loading) => set({ loading }),
}));

// --- LinkedIn Store ---

interface LinkedInStructured {
  name?: string;
  headline?: string;
  location?: string;
  about?: string;
  experience?: Array<{
    company: string;
    role: string;
    startDate?: string;
    endDate?: string;
    location?: string;
    description?: string;
  }>;
  education?: Array<{
    institution: string;
    degree: string;
    field?: string;
  }>;
  skills?: string[];
  certifications?: Array<{ name: string; issuer?: string }>;
  courses?: Array<{ name: string; institution?: string }>;
  honors?: string[];
  languages?: Array<{ language: string; level?: string }>;
  recommendations?: string[];
  volunteerWork?: Array<{ organization: string; role?: string }>;
}

interface LinkedInSuggestion {
  id: string;
  section: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  examples: Array<{ before: string; after: string }>;
  linkedinSpecific?: boolean;
}

interface LinkedInCrossRef {
  section: string;
  insight: string;
  source: string;
}

interface LinkedInState {
  structured: LinkedInStructured | null;
  suggestions: LinkedInSuggestion[];
  crossRef: LinkedInCrossRef[];
  loading: boolean;
  analyzing: boolean;
  setStructured: (s: LinkedInStructured | null) => void;
  setSuggestions: (s: LinkedInSuggestion[]) => void;
  setCrossRef: (c: LinkedInCrossRef[]) => void;
  setLoading: (l: boolean) => void;
  setAnalyzing: (a: boolean) => void;
  reset: () => void;
}

export const useLinkedInStore = create<LinkedInState>((set) => ({
  structured: null,
  suggestions: [],
  crossRef: [],
  loading: false,
  analyzing: false,
  setStructured: (structured) => set({ structured }),
  setSuggestions: (suggestions) => set({ suggestions }),
  setCrossRef: (crossRef) => set({ crossRef }),
  setLoading: (loading) => set({ loading }),
  setAnalyzing: (analyzing) => set({ analyzing }),
  reset: () =>
    set({
      structured: null,
      suggestions: [],
      crossRef: [],
      loading: false,
      analyzing: false,
    }),
}));

// --- Version Store ---

export interface ChangelogItem {
  section: string;
  what: string;
  why: string;
  category: "keyword" | "ats" | "impact" | "structure";
}

export interface ResumeVersion {
  id: string;
  name: string;
  type: string;
  resumeContent: string;
  coverLetterText: string;
  atsScore: number;
  changelog?: ChangelogItem[];
  createdAt: string;
  updatedAt?: string;
}

interface VersionState {
  versions: ResumeVersion[];
  activeVersionId: string;
  loading: boolean;
  setVersions: (v: ResumeVersion[]) => void;
  setActiveVersion: (id: string) => void;
  addVersion: (v: ResumeVersion) => void;
  updateVersion: (id: string, updates: Partial<ResumeVersion>) => void;
  removeVersion: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useVersionStore = create<VersionState>((set) => ({
  versions: [],
  activeVersionId: "",
  loading: false,
  setVersions: (versions) =>
    set({ versions, activeVersionId: versions[0]?.id || "" }),
  setActiveVersion: (activeVersionId) => set({ activeVersionId }),
  addVersion: (v) =>
    set((state) => ({ versions: [v, ...state.versions], activeVersionId: v.id })),
  updateVersion: (id, updates) =>
    set((state) => ({
      versions: state.versions.map((v) => (v.id === id ? { ...v, ...updates } : v)),
    })),
  removeVersion: (id) =>
    set((state) => {
      const filtered = state.versions.filter((v) => v.id !== id);
      return {
        versions: filtered,
        activeVersionId:
          state.activeVersionId === id ? filtered[0]?.id || "" : state.activeVersionId,
      };
    }),
  setLoading: (loading) => set({ loading }),
}));

// --- Job Feed Store ---

export interface MatchedJobItem {
  job_id: string;
  title: string;
  company: string;
  ats_score: number;
  matched_skills: string[];
  missing_skills: string[];
  source: string;
  source_url: string;
  posted_date: string | null;
  work_mode: string;
  location: string;
}

export interface JobPreferences {
  desired_titles: string[];
  locations: string[];
  work_mode: string[];
  seniority: string[];
  min_score: number;
  email_digest: boolean;
  consent_granted_at: string | null;
}

interface JobFeedState {
  preferences: JobPreferences | null;
  matches: MatchedJobItem[];
  date: string;
  loading: boolean;
  prefsLoading: boolean;
  setPreferences: (prefs: JobPreferences | null) => void;
  setMatches: (matches: MatchedJobItem[]) => void;
  setDate: (date: string) => void;
  setLoading: (loading: boolean) => void;
  setPrefsLoading: (loading: boolean) => void;
}

export const useJobFeedStore = create<JobFeedState>((set) => ({
  preferences: null,
  matches: [],
  date: "",
  loading: false,
  prefsLoading: true,
  setPreferences: (preferences) => set({ preferences }),
  setMatches: (matches) => set({ matches }),
  setDate: (date) => set({ date }),
  setLoading: (loading) => set({ loading }),
  setPrefsLoading: (prefsLoading) => set({ prefsLoading }),
}));
