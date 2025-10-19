import React, { useState, DragEvent, ChangeEvent } from 'react';
import {
  Language,
  AppStage,
  QuestionType,
  Question,
  MultipleChoiceQuestion,
  TrueFalseQuestion,
  StudyMaterial,
} from './types';
import { useLocalization } from './hooks/useLocalization';
import { generateQuestions } from './services/geminiService';
import LanguageSelector from './components/LanguageSelector';
import AnimatedContainer from './components/AnimatedContainer';

// --- Type declarations for window-injected libraries ---
declare global {
  interface Window {
    pdfjsLib: any;
    mammoth: any;
  }
}

// --- Helper Functions ---
const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = (error) => reject(error);
});


// --- Main App Component ---
const App: React.FC = () => {
  // --- State Management ---
  const { language, setLanguage, t } = useLocalization();
  const [stage, setStage] = useState<AppStage>(AppStage.WELCOME);
  const [studyMaterial, setStudyMaterial] = useState<StudyMaterial | null>(null);
  const [questionType, setQuestionType] = useState<QuestionType | null>(null);
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  
  // New states for file handling
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [startPage, setStartPage] = useState<number>(1);
  const [endPage, setEndPage] = useState<number>(1);


  // --- File Processing Logic ---
  const processFile = async (file: File) => {
    setIsParsing(true);
    setFileName(file.name);
    setError(null);
    setStudyMaterial(null);
    setFile(file);

    try {
        if (file.type.startsWith('image/')) {
            const base64Data = await fileToBase64(file);
            setStudyMaterial({
                inlineData: {
                    data: base64Data,
                    mimeType: file.type,
                },
            });
            setIsParsing(false);
            handleAnalyze();
            return;
        }

        if (file.type === 'application/pdf') {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await window.pdfjsLib.getDocument(arrayBuffer).promise;
            setTotalPages(pdf.numPages);
            setStartPage(1);
            setEndPage(pdf.numPages);
            setStage(AppStage.SELECT_PAGE_RANGE);
            setIsParsing(false);
            return;
        }

        let text = '';
        if (file.name.endsWith('.docx')) {
            const arrayBuffer = await file.arrayBuffer();
            const result = await window.mammoth.extractRawText({ arrayBuffer });
            text = result.value;
        } else if (file.type === 'text/plain') {
            text = await file.text();
        } else {
             throw new Error('Unsupported file type.');
        }

        setStudyMaterial(text);
        setIsParsing(false);
        handleAnalyze();

    } catch (err) {
        console.error("File processing error:", err);
        setError(t('error_parsing_failed'));
        setFileName('');
        setFile(null);
        setIsParsing(false);
        setStage(AppStage.UPLOAD);
    }
  };

  // --- Handlers ---
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };
  
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };
  
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleAnalyze = () => {
    if (!studyMaterial) {
      setError(t('error_no_text'));
      return;
    }
    setError(null);
    setStage(AppStage.PROCESSING);
    // Simulate processing time
    setTimeout(() => setStage(AppStage.SELECT_TYPE), 1500);
  };
  
  const handleConfirmPageRange = async () => {
    if (!file || startPage > endPage || startPage < 1 || endPage > totalPages) {
        setError(t('error_invalid_page_range'));
        return;
    }
    
    setError(null);
    setStage(AppStage.PROCESSING);

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument(arrayBuffer).promise;
        let extractedText = '';
        
        for (let i = startPage; i <= endPage; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            extractedText += pageText + '\n\n';
        }
        
        setStudyMaterial(extractedText);
        setStage(AppStage.SELECT_TYPE);

    } catch (err) {
        console.error("Error extracting text from page range:", err);
        setError(t('error_parsing_failed'));
        setStage(AppStage.UPLOAD);
    }
  };

  const handleSelectType = (type: QuestionType) => {
    setQuestionType(type);
    setStage(AppStage.SELECT_COUNT);
  };

  const handleGenerateQuestions = async () => {
    if (!questionType || !studyMaterial) return;
    setStage(AppStage.GENERATING);
    setError(null);
    try {
      const generated = await generateQuestions(studyMaterial, questionType, questionCount, language);
      if(generated.length === 0){
        throw new Error("AI returned no questions.");
      }
      setQuestions(generated);
      setCurrentQuestionIndex(0);
      setUserAnswers({});
      setFeedback({});
      setStage(AppStage.ANSWERING);
    } catch (err) {
      setError(t('error_generation_failed'));
      setStage(AppStage.SELECT_COUNT); // Go back to the previous stage
    }
  };

  const handleAnswerSelect = (answer: string) => {
    setUserAnswers((prev) => ({ ...prev, [currentQuestionIndex]: answer }));
  };

  const handleCheckAnswer = () => {
    const currentQuestion = questions[currentQuestionIndex];
    const userAnswer = userAnswers[currentQuestionIndex];
    
    let isCorrect = false;
    let correctAnswerText = '';

    if ('options' in currentQuestion) { // Multiple Choice
        const mcq = currentQuestion as MultipleChoiceQuestion;
        isCorrect = userAnswer === mcq.correctAnswer;
        correctAnswerText = mcq.correctAnswer;
    } else if ('answer' in currentQuestion) { // True/False
        const tfq = currentQuestion as TrueFalseQuestion;
        isCorrect = userAnswer === String(tfq.answer);
        correctAnswerText = tfq.answer ? t('true') : t('false');
    }

    if (isCorrect) {
      setFeedback((prev) => ({ ...prev, [currentQuestionIndex]: t('correct_feedback') }));
    } else {
      setFeedback((prev) => ({
        ...prev,
        [currentQuestionIndex]: `${t('incorrect_feedback')} ${correctAnswerText}`,
      }));
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      setStage(AppStage.COMPLETED);
    }
  };
  
  const handleGenerateMore = () => {
    // Reset only quiz-related state
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setUserAnswers({});
    setFeedback({});
    setError(null);
    setQuestionType(null); // Allow re-selection
    setQuestionCount(5); // Reset to default

    // Go back to the question type selection, preserving the study material
    setStage(AppStage.SELECT_TYPE);
  };

  const handleReturnToStart = () => {
    // Reset quiz state, but keep the loaded file
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setUserAnswers({});
    setFeedback({});
    setError(null);
    setQuestionType(null);
    setQuestionCount(5);

    // Go back to the upload screen
    setStage(AppStage.UPLOAD);
  };
  
  const handleResetUpload = () => {
    setStudyMaterial(null);
    setFileName('');
    setFile(null);
    setTotalPages(0);
    setStartPage(1);
    setEndPage(1);
    setError(null);
  };

  const handleBack = () => {
    setError(null);
    switch (stage) {
      case AppStage.SELECT_PAGE_RANGE:
        handleResetUpload();
        setStage(AppStage.UPLOAD);
        break;
      case AppStage.SELECT_TYPE:
        setStage(AppStage.UPLOAD);
        break;
      case AppStage.SELECT_COUNT:
        setStage(AppStage.SELECT_TYPE);
        break;
      case AppStage.ANSWERING:
        setQuestions([]);
        setCurrentQuestionIndex(0);
        setUserAnswers({});
        setFeedback({});
        setStage(AppStage.SELECT_TYPE);
        break;
      default:
        break;
    }
  };

  // --- Render Functions for each Stage ---

  const BackButton = () => (
    <button
        onClick={handleBack}
        className="absolute top-0 ltr:left-0 rtl:right-0 p-2 text-gray-500 hover:text-black transition-colors z-10"
        aria-label={t('back_button')}
        title={t('back_button')}
    >
        <svg className="w-6 h-6 transform rtl:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path>
        </svg>
    </button>
  );

  const renderWelcome = () => (
    <AnimatedContainer className="text-center">
      <h1 className="text-4xl md:text-5xl font-bold mb-4">{t('title')}</h1>
      <p className="text-lg text-gray-600 mb-8">{t('welcome_subtitle')}</p>
      <button 
        onClick={() => setStage(AppStage.UPLOAD)}
        className="bg-black text-white text-lg font-semibold py-4 px-8 rounded-full shadow-lg transform hover:-translate-y-1 hover:shadow-xl transition-all duration-300 ease-in-out"
      >
        {t('welcome_upload_button')}
      </button>
      <p className="text-sm text-gray-500 mt-4">{t('welcome_upload_helper_text')}</p>
    </AnimatedContainer>
  );

  const renderUpload = () => {
    if (fileName && !isParsing) {
       return (
        <AnimatedContainer className="w-full text-center">
            <h2 className="text-2xl font-bold mb-4">{t('loaded_file_label')}</h2>
            <div className="bg-gray-100 py-2 px-4 rounded-lg text-lg font-medium text-gray-800 mb-6 break-words">
                {fileName}
            </div>
            <button 
                onClick={handleAnalyze} 
                className="w-full bg-black text-white py-3 rounded-lg hover:bg-gray-800 transition-colors"
            >
                {t('upload_button')}
            </button>
            <button 
                onClick={handleResetUpload} 
                className="mt-4 w-full bg-white text-black border border-gray-300 py-3 rounded-lg hover:bg-gray-100 transition-colors"
            >
                {t('upload_another_file')}
            </button>
        </AnimatedContainer>
       )
    }
    
    return (
    <AnimatedContainer className="w-full text-center">
        <h2 className="text-2xl font-bold mb-4">{t('title')}</h2>
        
        <input
            type="file"
            id="file-upload"
            className="hidden"
            accept=".pdf,.docx,.txt,image/png,image/jpeg,image/webp"
            onChange={handleFileChange}
            disabled={isParsing}
        />
        
        <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`w-full p-6 border-2 border-dashed rounded-lg transition-colors ${
                isDragOver ? 'border-black bg-gray-50' : 'border-gray-300'
            }`}
        >
            <div className="flex flex-col items-center justify-center h-full">
                <svg className="w-12 h-12 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="mt-2 text-gray-600">
                    {t('upload_instruction')}{' '}
                    <label htmlFor="file-upload" className="font-semibold text-black cursor-pointer hover:underline">
                        {t('upload_browse')}
                    </label>
                </p>
                <p className="text-xs text-gray-500">{t('upload_file_types')}</p>
                
                {fileName && !isParsing && (
                    <div className="mt-3 bg-gray-100 py-1 px-3 rounded-full text-sm font-medium text-gray-800">
                        {t('loaded_file_label')} {fileName}
                    </div>
                )}
            </div>
        </div>
        
        <textarea
            className="mt-4 w-full h-48 p-4 border border-gray-200 rounded-lg shadow-sm focus:ring-2 focus:ring-gray-300 resize-none"
            placeholder={t('upload_prompt')}
            value={typeof studyMaterial === 'string' ? studyMaterial : ''}
            onChange={(e) => {
                setStudyMaterial(e.target.value);
                if (fileName) {
                  setFileName('');
                  setFile(null);
                }
            }}
            readOnly={isParsing || typeof studyMaterial !== 'string'}
        ></textarea>
        
        <button 
            onClick={handleAnalyze} 
            disabled={isParsing || (!studyMaterial && !file)}
            className="mt-4 w-full bg-black text-white py-3 rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400"
        >
            {isParsing ? t('parsing_file') : t('upload_button')}
        </button>
    </AnimatedContainer>
  )};

  const renderProcessing = () => (
    <AnimatedContainer>
      <div className="flex flex-col items-center">
        <div className="w-16 h-16 border-4 border-gray-200 border-t-black rounded-full animate-spin"></div>
        <p className="mt-4 text-lg">{t('processing')}</p>
      </div>
    </AnimatedContainer>
  );

  const renderSelectPageRange = () => (
    <AnimatedContainer className="relative w-full pt-10">
        <BackButton />
        <h2 className="text-2xl font-bold mb-2 text-center">{t('select_page_range_title')}</h2>
        <p className="text-gray-600 mb-6 text-center">{t('select_page_range_subtitle').replace('{count}', totalPages.toString())}</p>
        
        <div className="flex items-center justify-center gap-4 my-4">
            <div className="flex flex-col items-center">
                <label htmlFor="start-page" className="mb-1 text-sm font-medium text-gray-700">{t('from_page')}</label>
                <input
                    id="start-page"
                    type="number"
                    min="1"
                    max={totalPages}
                    value={startPage}
                    onChange={(e) => setStartPage(Math.max(1, Number(e.target.value)))}
                    className="w-24 p-2 border border-gray-300 rounded-lg text-center"
                />
            </div>
            <span className="text-2xl text-gray-400">-</span>
            <div className="flex flex-col items-center">
                <label htmlFor="end-page" className="mb-1 text-sm font-medium text-gray-700">{t('to_page')}</label>
                <input
                    id="end-page"
                    type="number"
                    min="1"
                    max={totalPages}
                    value={endPage}
                    onChange={(e) => setEndPage(Math.min(totalPages, Number(e.target.value)))}
                    className="w-24 p-2 border border-gray-300 rounded-lg text-center"
                />
            </div>
        </div>

        <button 
            onClick={handleConfirmPageRange} 
            disabled={startPage > endPage || startPage < 1 || endPage > totalPages}
            className="mt-6 w-full bg-black text-white py-3 rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400"
        >
            {t('continue_button')}
        </button>
    </AnimatedContainer>
  );

  const renderSelectType = () => (
    <AnimatedContainer className="relative w-full pt-10">
      <BackButton />
      <h2 className="text-2xl font-bold mb-6 text-center">{t('select_type_title')}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md mx-auto">
        <button onClick={() => handleSelectType(QuestionType.MultipleChoice)} className="bg-white border border-gray-200 text-black py-3 px-6 rounded-lg hover:bg-gray-100 transition-colors shadow-sm">
          {t('multiple_choice')}
        </button>
        <button onClick={() => handleSelectType(QuestionType.TrueFalse)} className="bg-white border border-gray-200 text-black py-3 px-6 rounded-lg hover:bg-gray-100 transition-colors shadow-sm">
          {t('true_false')}
        </button>
      </div>
    </AnimatedContainer>
  );

  const renderSelectCount = () => (
    <AnimatedContainer className="relative w-full pt-10">
      <BackButton />
      <h2 className="text-2xl font-bold mb-4 text-center">{t('select_count_title')}</h2>
      <div className="flex items-center justify-center gap-4 my-4">
        <input
          type="range"
          min="1"
          max="10"
          value={questionCount}
          onChange={(e) => setQuestionCount(Number(e.target.value))}
          className="w-64"
        />
        <span className="text-xl font-bold w-8 text-center">{questionCount}</span>
      </div>
      <button onClick={handleGenerateQuestions} className="mt-4 w-full bg-black text-white py-3 rounded-lg hover:bg-gray-800 transition-colors">
        {t('generate_button')}
      </button>
    </AnimatedContainer>
  );

  const renderGenerating = () => (
     <AnimatedContainer>
      <div className="flex flex-col items-center">
        <div className="w-16 h-16 border-4 border-gray-200 border-t-black rounded-full animate-spin"></div>
        <p className="mt-4 text-lg">{t('generating')}</p>
      </div>
    </AnimatedContainer>
  );

  const renderAnswering = () => {
    const currentQuestion = questions[currentQuestionIndex];
    const isMcq = 'options' in currentQuestion;
    const isTf = 'answer' in currentQuestion && typeof (currentQuestion as any).answer === 'boolean';
    const hasAnswered = feedback[currentQuestionIndex] !== undefined;

    return (
      <AnimatedContainer className="w-full relative pt-10">
        <BackButton />
        <p className="text-gray-600 mb-2">{`Question ${currentQuestionIndex + 1} / ${questions.length}`}</p>
        <h2 className="text-2xl font-bold mb-6">{currentQuestion.question}</h2>
        
        {isMcq && (
          <div className="space-y-3">
            {(currentQuestion as MultipleChoiceQuestion).options.map((option, i) => {
              const userAnswer = userAnswers[currentQuestionIndex];
              const isCorrect = option === (currentQuestion as MultipleChoiceQuestion).correctAnswer;
              let bgColor = 'bg-white';
              if(hasAnswered) {
                if(isCorrect) bgColor = 'bg-green-100';
                else if(option === userAnswer) bgColor = 'bg-red-100';
              }

              return (
              <button
                key={i}
                onClick={() => !hasAnswered && handleAnswerSelect(option)}
                disabled={hasAnswered}
                className={`w-full text-left p-4 border rounded-lg transition-colors ${!hasAnswered ? 'hover:bg-gray-100' : 'cursor-not-allowed'} ${userAnswer === option && !hasAnswered ? 'ring-2 ring-black' : 'border-gray-200'} ${bgColor}`}
              >
                {option}
              </button>
            )})}
          </div>
        )}

        {isTf && (
            <div className="flex gap-4">
                {[
                    {label: t('true'), value: 'true'}, 
                    {label: t('false'), value: 'false'}
                ].map(({label, value}) => {
                    const userAnswer = userAnswers[currentQuestionIndex];
                    const isCorrect = value === String((currentQuestion as TrueFalseQuestion).answer);
                    let bgColor = 'bg-white';
                    if(hasAnswered) {
                        if(isCorrect) bgColor = 'bg-green-100';
                        else if(value === userAnswer) bgColor = 'bg-red-100';
                    }

                    return (
                        <button
                            key={value}
                            onClick={() => !hasAnswered && handleAnswerSelect(value)}
                            disabled={hasAnswered}
                            className={`w-full text-center p-4 border rounded-lg transition-colors font-semibold ${!hasAnswered ? 'hover:bg-gray-100' : 'cursor-not-allowed'} ${userAnswer === value && !hasAnswered ? 'ring-2 ring-black' : 'border-gray-200'} ${bgColor}`}
                        >
                            {label}
                        </button>
                    )
                })}
            </div>
        )}

        {feedback[currentQuestionIndex] && (
            <p className={`mt-4 text-center font-bold ${feedback[currentQuestionIndex] === t('correct_feedback') ? 'text-green-600' : 'text-red-600'}`}>
                {feedback[currentQuestionIndex]}
            </p>
        )}

        <div className="mt-6">
          {(isMcq || isTf) && !hasAnswered && (
             <button onClick={handleCheckAnswer} disabled={!userAnswers[currentQuestionIndex]} className="w-full bg-black text-white py-3 rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-300">
               {t('check_answer')}
             </button>
          )}
           {hasAnswered && (
             <button onClick={handleNextQuestion} className="w-full bg-black text-white py-3 rounded-lg hover:bg-gray-800 transition-colors">
               {t('next_question')}
             </button>
           )}
        </div>
      </AnimatedContainer>
    );
  };
  
  const renderCompleted = () => (
      <AnimatedContainer className="text-center">
        <h2 className="text-3xl font-bold mb-2">{t('completed_title')}</h2>
        <p className="text-lg text-gray-700 mb-6">{t('completed_message')}</p>
        <div className="flex flex-col sm:flex-row gap-4">
            <button onClick={handleGenerateMore} className="flex-1 bg-black text-white py-3 px-8 rounded-lg hover:bg-gray-800 transition-colors">
                {t('more_questions')}
            </button>
             <button onClick={handleReturnToStart} className="flex-1 bg-white border border-gray-300 text-black py-3 px-8 rounded-lg hover:bg-gray-100 transition-colors">
                {t('return_to_start')}
            </button>
        </div>
      </AnimatedContainer>
  );

  const renderContent = () => {
    switch (stage) {
      case AppStage.WELCOME: return renderWelcome();
      case AppStage.UPLOAD: return renderUpload();
      case AppStage.PROCESSING: return renderProcessing();
      case AppStage.SELECT_PAGE_RANGE: return renderSelectPageRange();
      case AppStage.SELECT_TYPE: return renderSelectType();
      case AppStage.SELECT_COUNT: return renderSelectCount();
      case AppStage.GENERATING: return renderGenerating();
      case AppStage.ANSWERING: return renderAnswering();
      case AppStage.COMPLETED: return renderCompleted();
      default: return renderWelcome();
    }
  };

  // --- Main Render ---
  return (
    <div className="bg-white text-black min-h-screen flex flex-col items-center p-4 sm:p-6 md:p-8">
      <header className="w-full max-w-3xl flex justify-end mb-8">
        <LanguageSelector currentLanguage={language} onLanguageChange={setLanguage} />
      </header>
      <main className="w-full max-w-3xl flex-grow flex flex-col justify-center items-center">
         {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-6 w-full" role="alert">
            <strong className="font-bold">{t('error_title')}: </strong>
            <span className="block sm:inline">{error}</span>
            <span className="absolute top-0 bottom-0 right-0 px-4 py-3" onClick={() => setError(null)}>
              <svg className="fill-current h-6 w-6 text-red-500" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><title>Close</title><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/></svg>
            </span>
          </div>
        )}
        {renderContent()}
      </main>
      <footer className="text-gray-500 text-sm mt-8 text-center">
        <p>{t('powered_by')}</p>
        <p>{t('created_by')}</p>
      </footer>
    </div>
  );
};

export default App;