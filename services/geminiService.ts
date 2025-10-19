import { GoogleGenAI, Type, Part } from "@google/genai";
import { GEMINI_MODEL } from '../constants';
import { QuestionType, Question, StudyMaterial } from '../types';

/**
 * Initializes the GoogleGenAI client using the API key from environment variables.
 * This is a hard requirement; the key must be pre-configured.
 */
const getAiClient = () => {
    if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable not set.");
    }
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};


/**
 * Generates questions using the Gemini API based on user-provided text or image.
 * @param studyMaterial The source text or image for question generation.
 * @param type The type of questions to generate (e.g., multiple-choice, essay).
 * @param count The number of questions to generate.
 * @param language The language for the generated questions.
 * @returns A promise that resolves to an array of questions.
 */
export const generateQuestions = async (
    studyMaterial: StudyMaterial,
    type: QuestionType,
    count: number,
    language: string
): Promise<Question[]> => {
    const ai = getAiClient();

    const multipleChoiceSchema = {
        type: Type.OBJECT,
        properties: {
            question: { type: Type.STRING, description: 'The question text.' },
            options: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'An array of exactly 4 possible answers.'
            },
            correctAnswer: {
                type: Type.STRING,
                description: 'The correct answer from the options.'
            },
        },
        required: ['question', 'options', 'correctAnswer'],
    };

    const trueFalseSchema = {
        type: Type.OBJECT,
        properties: {
            question: { type: Type.STRING, description: 'The true/false statement.' },
            answer: { type: Type.BOOLEAN, description: 'The correct answer, true or false.' },
        },
        required: ['question', 'answer'],
    };

    let schema;
    let questionTypeName;

    switch (type) {
        case QuestionType.MultipleChoice:
            schema = multipleChoiceSchema;
            questionTypeName = 'multiple-choice questions';
            break;
        case QuestionType.TrueFalse:
            schema = trueFalseSchema;
            questionTypeName = 'true/false questions';
            break;
        default:
            throw new Error(`Unsupported question type: ${type}`);
    }

    let difficultyInstruction = '';
    if (type === QuestionType.MultipleChoice) {
        difficultyInstruction = 'For the multiple-choice questions, ensure there are exactly four options. Slightly increase the difficulty by making the incorrect options (distractors) plausible and closely related to the correct answer.';
    }

    const promptText = `Based on the following content, generate exactly ${count} ${questionTypeName} in ${language}.
Focus on the core concepts and most important information that is likely to be on a test. Pay close attention to key features, conditions, methods, definitions, and other significant details. Ignore secondary details or filler content.
The questions must be self-contained and must not refer to the source text with phrases like "According to the text" or "As specified in the text".
${difficultyInstruction}
Ensure the response is a JSON array of objects that strictly follows the provided schema.`;

    let requestContents: string | { parts: Part[] };

    if (typeof studyMaterial === 'string') {
        requestContents = `${promptText}\n\nText:\n---\n${studyMaterial}\n---`;
    } else {
        // It's an ImagePart
        requestContents = {
            parts: [
                { text: promptText },
                studyMaterial 
            ]
        };
    }


    try {
        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: requestContents,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: schema,
                },
            },
        });
        
        const responseText = response.text.trim();
        const generatedQuestions = JSON.parse(responseText);

        if (!Array.isArray(generatedQuestions)) {
            throw new Error("AI response is not a valid array.");
        }

        return generatedQuestions as Question[];
    } catch (error) {
        console.error("Error generating questions with Gemini:", error);
        throw new Error("Failed to generate questions. Please check the console for details.");
    }
};