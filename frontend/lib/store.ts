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

// --- Version Store ---

export interface ResumeVersion {
  id: string;
  name: string;
  type: string;
  resumeContent: string;
  coverLetterText: string;
  atsScore: number;
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
