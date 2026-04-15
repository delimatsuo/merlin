/**
 * DOM selectors for Gupy application pages.
 * Centralizes all CSS selectors used by screen handlers.
 */

export const SELECTORS = {
  // Welcome screen
  welcome: {
    applyButton: "",
  },

  // Additional info screen
  additionalInfo: {
    phoneInput: "",
    linkedinInput: "",
    addressInput: "",
  },

  // Custom questions screen
  customQuestions: {
    questionContainer: "",
    textInput: "",
    selectInput: "",
    radioGroup: "",
  },

  // Personalization screen
  personalization: {
    coverLetterInput: "",
  },

  // Common
  common: {
    nextButton: "",
    submitButton: "",
    errorMessage: "",
    loadingSpinner: "",
  },
} as const;
