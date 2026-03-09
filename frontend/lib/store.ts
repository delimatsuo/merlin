import { create } from "zustand";
import { User } from "firebase/auth";

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
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
  setJobDescription: (text: string) => void;
  setJobAnalysis: (analysis: Record<string, unknown> | null) => void;
  setAtsScore: (score: number | null) => void;
  setSkillsMatrix: (matrix: Record<string, unknown> | null) => void;
  setTailoredResume: (resume: string | null) => void;
  setCoverLetter: (letter: string | null) => void;
  reset: () => void;
}

export const useApplicationStore = create<ApplicationState>((set) => ({
  jobDescription: "",
  jobAnalysis: null,
  atsScore: null,
  skillsMatrix: null,
  tailoredResume: null,
  coverLetter: null,
  setJobDescription: (jobDescription) => set({ jobDescription }),
  setJobAnalysis: (jobAnalysis) => set({ jobAnalysis }),
  setAtsScore: (atsScore) => set({ atsScore }),
  setSkillsMatrix: (skillsMatrix) => set({ skillsMatrix }),
  setTailoredResume: (tailoredResume) => set({ tailoredResume }),
  setCoverLetter: (coverLetter) => set({ coverLetter }),
  reset: () =>
    set({
      jobDescription: "",
      jobAnalysis: null,
      atsScore: null,
      skillsMatrix: null,
      tailoredResume: null,
      coverLetter: null,
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
