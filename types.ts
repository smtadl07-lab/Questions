// Supported languages for the UI
export enum Language {
  AR = 'ar',
  EN = 'en',
  ZH = 'zh',
  KO = 'ko',
}

// Different stages of the application flow
export enum AppStage {
  WELCOME,
  UPLOAD,
  PROCESSING,
  SELECT_PAGE_RANGE,
  SELECT_TYPE,
  SELECT_COUNT,
  GENERATING,
  ANSWERING,
  COMPLETED,
}

// Types of questions the user can generate
export enum QuestionType {
  MultipleChoice = 'multiple-choice',
  TrueFalse = 'true-false',
}

// Structure for a multiple-choice question
export interface MultipleChoiceQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
}

// Structure for a true/false question
export interface TrueFalseQuestion {
  question: string;
  answer: boolean; // true for 'True', false for 'False'
}

// Union type for any kind of question
export type Question = MultipleChoiceQuestion | TrueFalseQuestion;

// Represents the study material as an image part for the Gemini API
export interface ImagePart {
  inlineData: {
    data: string; // base64 encoded string
    mimeType: string;
  };
}

// The study material can be either text or an image
export type StudyMaterial = string | ImagePart;


// Translations object structure
export type Translations = {
  [key in Language]: {
    [key: string]: string;
  };
};