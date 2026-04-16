/**
 * Centralized CSS selectors for Gupy application pages.
 * ALL selectors in one file — update here when Gupy changes their DOM.
 */

export const SELECTORS = {
  gupy: {
    // Login detection
    userAvatar: '[data-testid="user-avatar"], .navbar__user-photo, [class*="Avatar"], [class*="avatar"]',
    userMenu: '[data-testid="user-menu"], [class*="UserMenu"], [class*="user-menu"]',

    // Application flow buttons
    applyButton: 'button[data-testid="apply-button"], a[href*="/apply"], button:not([disabled])',
    nextButton: 'button[type="submit"], button[data-testid="next-button"]',
    saveAndContinue: 'button[type="submit"]',
    finishButton: 'button[data-testid="finish-button"]',

    // Screen markers
    welcomeHeading: '[class*="JobTitle"], [class*="job-title"], h1, h2',
    applicationForm: 'form, [class*="ApplicationForm"], [class*="application-form"]',
    questionContainer: '[class*="CustomQuestion"], [class*="custom-question"], [class*="Question"]',
    personalizationSection: '[class*="Personalization"], [class*="personalization"], [class*="CoverLetter"]',
    completionMessage: '[class*="Success"], [class*="success"], [class*="Completed"], [class*="completed"]',

    // Step indicator (some Gupy forms show a stepper)
    stepIndicator: '[class*="Stepper"], [class*="stepper"], [class*="Steps"], [class*="steps"]',
  },

  form: {
    fieldLabel: 'label, [class*="label"], [class*="Label"], [class*="field-label"]',
    fieldGroup: '[class*="FormGroup"], [class*="form-group"], [class*="Field"], .field',
    textInput: 'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="url"], input:not([type])',
    dateInput: 'input[type="date"]',
    textarea: 'textarea',
    select: 'select, [class*="select"], [class*="Select"], [role="combobox"], [role="listbox"]',
    selectTrigger: '[class*="select__control"], [class*="Select__control"], [class*="selectTrigger"], [role="combobox"]',
    selectOptions: '[class*="select__option"], [class*="Select__option"], [class*="option"], [role="option"], li',
    selectMenu: '[class*="select__menu"], [class*="Select__menu"], [class*="menu"], [role="listbox"]',
    radio: 'input[type="radio"]',
    radioGroup: '[class*="RadioGroup"], [class*="radio-group"], [role="radiogroup"]',
    checkbox: 'input[type="checkbox"]',
    fileInput: 'input[type="file"]',
    required: '[class*="required"], [class*="Required"]',
    errorMessage: '[class*="error"], [class*="Error"], [role="alert"], [class*="invalid"], [class*="Invalid"]',
    validationError: '[class*="ValidationError"], [class*="validation-error"]',
  },

  // Text patterns for button detection (Portuguese)
  buttonText: {
    apply: ["candidatar", "aplicar", "apply", "inscrever"],
    next: ["próximo", "proximo", "continuar", "continue", "salvar e continuar", "save and continue", "avançar", "avancar"],
    finish: ["enviar candidatura", "finalizar", "finish application", "finish", "enviar", "submit"],
    skip: ["pular", "skip"],
    answerNow: ["responder agora", "answer now"],
    personalize: ["personalizar", "personalize"],
  },
} as const;
