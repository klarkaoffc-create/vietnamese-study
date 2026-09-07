import { HashRouter, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './learning/store';
import { AppShell } from './components/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { LessonsPage } from './pages/LessonsPage';
import { LessonPage } from './pages/LessonPage';
import { ReviewsPage, ReviewSessionPage } from './pages/ReviewsPage';
import { ToneLabPage } from './pages/ToneLabPage';
import { DialoguesPage, DialogueTrainerPage } from './pages/DialoguesPage';
import { VocabularyPage } from './pages/VocabularyPage';
import { GrammarPage } from './pages/GrammarPage';
import { MistakesPage } from './pages/MistakesPage';
import { ExamsPage, ReviewBlockPage, ExamPage, ExamResultPage } from './pages/ExamsPage';
import { ProgressPage } from './pages/ProgressPage';
import { PracticePage } from './pages/PracticePage';

/**
 * HashRouter keeps deep links working on GitHub Pages (no server rewrites).
 */
export function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/lekcje" element={<LessonsPage />} />
            <Route path="/lekcje/:id" element={<LessonPage />} />
            <Route path="/powtorki" element={<ReviewsPage />} />
            <Route path="/powtorki/:mode" element={<ReviewSessionPage />} />
            <Route path="/tony" element={<ToneLabPage />} />
            <Route path="/dialogi" element={<DialoguesPage />} />
            <Route path="/dialogi/:id" element={<DialogueTrainerPage />} />
            <Route path="/slownictwo" element={<VocabularyPage />} />
            <Route path="/gramatyka" element={<GrammarPage />} />
            <Route path="/bledy" element={<MistakesPage />} />
            <Route path="/egzaminy" element={<ExamsPage />} />
            <Route path="/egzaminy/powtorka/:reviewId" element={<ReviewBlockPage />} />
            <Route path="/egzaminy/wynik/:attemptId" element={<ExamResultPage />} />
            <Route path="/egzaminy/:examId" element={<ExamPage />} />
            <Route path="/postep" element={<ProgressPage />} />
            <Route path="/cwicz" element={<PracticePage />} />
            <Route path="*" element={<DashboardPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </StoreProvider>
  );
}
