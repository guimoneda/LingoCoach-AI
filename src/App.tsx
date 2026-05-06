import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, Square, RotateCcw, Loader2, Award, MessageSquare, BookOpen, Volume2, CheckCircle2, AlertCircle, Play, Pause, History, LogIn, LogOut, User as UserIcon, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAudioRecorder, blobToBase64 } from "@/hooks/useAudioRecorder";
import { evaluateSpeech, EvaluationResult, speakWord, speakTranscript } from "@/services/gemini";
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  Timestamp,
  User,
  handleFirestoreError,
  OperationType
} from "@/lib/firebase";

interface StoredEvaluation extends EvaluationResult {
  id: string;
  createdAt: Timestamp;
}

export default function App() {
  const { isRecording, audioBlob, audioUrl, recordingTime, startRecording, stopRecording, resetRecording } = useAudioRecorder();
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playingWord, setPlayingWord] = useState<string | null>(null);
  const [isPlayingIdeal, setIsPlayingIdeal] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<StoredEvaluation[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("practice");
  const [transcriptInput, setTranscriptInput] = useState("");
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isAudioPaused, setIsAudioPaused] = useState(false);
  const [generatedAudioDuration, setGeneratedAudioDuration] = useState<number | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setHistory([]);
      }
    });
    return () => unsubscribe();
  }, []);

  // History Listener
  useEffect(() => {
    if (!user) return;

    setIsHistoryLoading(true);
    const q = query(
      collection(db, "evaluations"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const evaluations = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as StoredEvaluation[];
      setHistory(evaluations);
      setIsHistoryLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, "evaluations");
      setIsHistoryLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const playPcmAudio = async (base64Data: string) => {
    console.log("Starting PCM audio playback...");
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const context = audioContextRef.current;
      
      // Stop any existing playback
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop();
        } catch (e) {
          // Ignore errors if already stopped
        }
        currentSourceRef.current = null;
      }

      if (context.state === 'suspended') {
        console.log("Resuming suspended AudioContext...");
        await context.resume();
      }
      
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const pcmData = new Int16Array(bytes.buffer, 0, Math.floor(len / 2));
      const floatData = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        floatData[i] = pcmData[i] / 32768.0;
      }
      
      const audioBuffer = context.createBuffer(1, floatData.length, 24000);
      audioBuffer.getChannelData(0).set(floatData);
      
      // Update duration for UI
      setGeneratedAudioDuration(audioBuffer.duration);
      
      const source = context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(context.destination);
      currentSourceRef.current = source;
      
      setIsAudioPlaying(true);
      setIsAudioPaused(false);

      return new Promise<void>((resolve, reject) => {
        source.onended = () => {
          // Only reset state if this is still the current source
          if (currentSourceRef.current === source) {
            console.log("Audio playback finished.");
            setIsAudioPlaying(false);
            setIsAudioPaused(false);
            currentSourceRef.current = null;
          }
          resolve();
        };
        source.onerror = (err) => {
          if (currentSourceRef.current === source) {
            console.error("Audio source error:", err);
            setIsAudioPlaying(false);
            setIsAudioPaused(false);
            currentSourceRef.current = null;
          }
          reject(err);
        };
        
        try {
          source.start();
          console.log("Audio source started.");
        } catch (e) {
          if (currentSourceRef.current === source) {
            console.error("Failed to start audio source:", e);
            setIsAudioPlaying(false);
            setIsAudioPaused(false);
            currentSourceRef.current = null;
          }
          reject(e);
        }
      });
    } catch (err) {
      console.error("Error in playPcmAudio:", err);
      setIsAudioPlaying(false);
      setIsAudioPaused(false);
      throw err;
    }
  };

  const handlePlayWord = async (word: string) => {
    setPlayingWord(word);
    try {
      const base64 = await speakWord(word);
      await playPcmAudio(base64);
    } catch (err) {
      console.error(err);
      setError("Failed to play word pronunciation.");
    } finally {
      setPlayingWord(null);
    }
  };

  const handlePlayIdeal = async () => {
    if (!result?.transcription) return;
    console.log("Ideal Playback requested for:", result.transcription);
    setIsPlayingIdeal(true);
    try {
      console.log("Calling speakTranscript...");
      const base64 = await speakTranscript(result.transcription);
      console.log("Transcript audio received, playing...");
      await playPcmAudio(base64);
      console.log("Ideal Playback finished.");
    } catch (err) {
      console.error("Ideal Playback error:", err);
      setError(err instanceof Error ? `Ideal playback failed: ${err.message}` : "Failed to play ideal pronunciation.");
    } finally {
      setIsPlayingIdeal(false);
    }
  };

  const handleEvaluate = async () => {
    if (!audioBlob) return;
    
    setIsEvaluating(true);
    setError(null);
    
    try {
      const base64 = await blobToBase64(audioBlob);
      const evaluation = await evaluateSpeech(base64, audioBlob.type);
      setResult(evaluation);

      // Save to Firebase if logged in
      if (user) {
        try {
          await addDoc(collection(db, "evaluations"), {
            ...evaluation,
            userId: user.uid,
            createdAt: serverTimestamp()
          });
        } catch (dbErr) {
          console.error("Failed to save evaluation to history:", dbErr);
          // Don't block the UI if saving fails, but log it
        }
      }
    } catch (err) {
      console.error("Evaluation error:", err);
      setError(err instanceof Error ? `Evaluation failed: ${err.message}` : "Something went wrong during evaluation. Please try again.");
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Sign in error:", err);
      setError("Failed to sign in with Google.");
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setResult(null);
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  const handleViewHistoryItem = (item: StoredEvaluation) => {
    setResult(item);
    setActiveTab("practice");
  };

  const handleReset = () => {
    resetRecording();
    setResult(null);
    setError(null);
  };

  const handleGenerateAudio = async () => {
    if (!transcriptInput.trim()) return;
    setIsGeneratingAudio(true);
    setGeneratedAudioDuration(null);
    setError(null);
    try {
      const base64 = await speakTranscript(transcriptInput);
      // We don't await here so the button releases immediately after processing
      playPcmAudio(base64).catch(err => {
        console.error("Playback error:", err);
      });
    } catch (err) {
      console.error("Audio generation error:", err);
      setError(err instanceof Error ? err.message : "Failed to generate audio. Please try again.");
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const togglePauseResume = async () => {
    if (!audioContextRef.current) return;
    const context = audioContextRef.current;
    
    if (context.state === 'running') {
      await context.suspend();
      setIsAudioPaused(true);
    } else if (context.state === 'suspended') {
      await context.resume();
      setIsAudioPaused(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] font-sans text-slate-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900">LingoCoach AI</h1>
            <p className="text-slate-500 mt-2">Master your English pronunciation and fluency with expert AI feedback.</p>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3 bg-white p-2 pr-4 rounded-full shadow-sm border border-slate-200">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || ""} className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserIcon className="w-4 h-4 text-primary" />
                  </div>
                )}
                <span className="text-sm font-medium text-slate-700 hidden sm:inline">{user.displayName}</span>
                <Button variant="ghost" size="sm" onClick={handleSignOut} className="h-8 px-2 text-slate-500 hover:text-red-600">
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button onClick={handleSignIn} variant="outline" className="bg-white border-slate-200 gap-2">
                <LogIn className="w-4 h-4" /> Sign In to Save History
              </Button>
            )}
            <Badge variant="outline" className="hidden sm:flex px-3 py-1 border-slate-300 text-slate-600 bg-white">
              Powered by Gemini 3 Flash
            </Badge>
          </div>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3 w-full max-w-xl mx-auto mb-8 bg-slate-200/50 p-1 rounded-2xl">
            <TabsTrigger value="practice" className="rounded-xl py-3 data-[state=active]:bg-white data-[state=active]:shadow-md">
              Practice Studio
            </TabsTrigger>
            <TabsTrigger value="input-transcript" className="rounded-xl py-3 data-[state=active]:bg-white data-[state=active]:shadow-md gap-2">
              <BookOpen className="w-4 h-4" /> Input Transcript
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-xl py-3 data-[state=active]:bg-white data-[state=active]:shadow-md gap-2">
              <History className="w-4 h-4" /> History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="practice" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Recorder Section */}
              <div className="lg:col-span-5 space-y-6">
            <Card className="border-none shadow-xl bg-white overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Mic className="w-5 h-5 text-primary" />
                  Recording Studio
                </CardTitle>
                <CardDescription>Speak naturally for 10-30 seconds.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-10 space-y-8">
                {/* Visualizer Placeholder / Pulsing Circle */}
                <div className="relative flex items-center justify-center">
                  <AnimatePresence>
                    {isRecording && (
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: [1, 1.5, 1], opacity: [0.2, 0.1, 0.2] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute w-32 h-32 bg-primary rounded-full"
                      />
                    )}
                  </AnimatePresence>
                  <div className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center shadow-inner ${isRecording ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'}`}>
                    {isRecording ? <Mic className="w-10 h-10" /> : <Volume2 className="w-10 h-10" />}
                  </div>
                </div>

                <div className="text-center space-y-2">
                  <div className="text-3xl font-mono font-medium text-slate-800">
                    {formatTime(recordingTime)}
                  </div>
                  <p className="text-sm text-slate-400 uppercase tracking-widest font-medium">
                    {isRecording ? "Recording..." : audioBlob ? "Recording Ready" : "Ready to Start"}
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex gap-3 pt-0">
                {!isRecording && !audioBlob && (
                  <Button onClick={startRecording} className="w-full h-12 text-lg font-medium">
                    Start Recording
                  </Button>
                )}
                {isRecording && (
                  <Button onClick={stopRecording} variant="destructive" className="w-full h-12 text-lg font-medium">
                    <Square className="w-5 h-5 mr-2" /> Stop
                  </Button>
                )}
                {audioBlob && !isRecording && (
                  <>
                    <Button onClick={handleEvaluate} disabled={isEvaluating} className="flex-1 h-12 text-lg font-medium">
                      {isEvaluating ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Evaluating...
                        </>
                      ) : (
                        "Evaluate Speech"
                      )}
                    </Button>
                    <Button onClick={handleReset} variant="outline" size="icon" className="h-12 w-12 border-slate-200">
                      <RotateCcw className="w-5 h-5" />
                    </Button>
                  </>
                )}
              </CardFooter>
            </Card>

            {audioUrl && !isRecording && (
              <Card className="border-none shadow-md bg-white">
                <CardHeader className="py-4">
                  <CardTitle className="text-sm font-medium">Playback</CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <audio key={audioUrl} src={audioUrl} controls className="w-full" />
                </CardContent>
              </Card>
            )}

            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600">
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}
          </div>

          {/* Results Section */}
          <div className="lg:col-span-7">
            <AnimatePresence mode="wait">
              {result ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6"
                >
                  {/* Score Card */}
                  <Card className="border-none shadow-xl bg-white">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-lg font-semibold">Fluency Score</CardTitle>
                      <Award className="w-6 h-6 text-yellow-500" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-end gap-2">
                        <span className="text-6xl font-bold text-slate-900">{result.fluencyScore}</span>
                        <span className="text-slate-400 text-xl font-medium mb-2">/ 100</span>
                      </div>
                      <Progress value={result.fluencyScore} className="h-3" />
                      <p className="text-slate-600 italic">"{result.overallFeedback}"</p>
                    </CardContent>
                  </Card>

                  {/* Detailed Tabs */}
                  <Tabs defaultValue="pronunciation" className="w-full">
                    <TabsList className="grid grid-cols-3 w-full h-12 bg-slate-100 p-1 rounded-xl">
                      <TabsTrigger value="pronunciation" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        Pronunciation
                      </TabsTrigger>
                      <TabsTrigger value="grammar" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        Grammar
                      </TabsTrigger>
                      <TabsTrigger value="vocabulary" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
                        Vocabulary
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="pronunciation" className="mt-4">
                      <Card className="border-none shadow-lg bg-white">
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <Volume2 className="w-4 h-4" /> Pronunciation Tips
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-[300px] pr-4">
                            <div className="space-y-4">
                              {result.pronunciationTips.length > 0 ? (
                                result.pronunciationTips.map((tip, i) => (
                                  <div key={i} className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <span className="font-bold text-lg text-primary">{tip.word}</span>
                                        <Button 
                                          variant="ghost" 
                                          size="icon" 
                                          className="h-8 w-8 rounded-full bg-white shadow-sm hover:bg-primary hover:text-white transition-colors"
                                          onClick={() => handlePlayWord(tip.word)}
                                          disabled={playingWord === tip.word}
                                        >
                                          {playingWord === tip.word ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : (
                                            <Play className="h-4 w-4 fill-current" />
                                          )}
                                        </Button>
                                      </div>
                                      {tip.phonetic && (
                                        <code className="text-xs bg-white px-2 py-1 rounded border border-slate-200 font-mono text-slate-500">
                                          {tip.phonetic}
                                        </code>
                                      )}
                                    </div>
                                    <p className="text-sm text-slate-600 leading-relaxed">{tip.tip}</p>
                                  </div>
                                ))
                              ) : (
                                <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
                                  <CheckCircle2 className="w-12 h-12 text-green-500 opacity-20" />
                                  <p className="text-slate-400">Excellent pronunciation! No major issues found.</p>
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="grammar" className="mt-4">
                      <Card className="border-none shadow-lg bg-white">
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <MessageSquare className="w-4 h-4" /> Grammar Feedback
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="min-h-[200px]">
                          <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">
                            {result.grammarFeedback}
                          </p>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="vocabulary" className="mt-4">
                      <Card className="border-none shadow-lg bg-white">
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <BookOpen className="w-4 h-4" /> Vocabulary Feedback
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                          <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">
                            {result.vocabularyFeedback}
                          </p>

                          {result.vocabularySuggestions && result.vocabularySuggestions.length > 0 && (
                            <div className="space-y-4 pt-4 border-t border-slate-100">
                              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Vocabulary Upgrades</h4>
                              <div className="grid grid-cols-1 gap-3">
                                {result.vocabularySuggestions.map((suggestion, idx) => (
                                  <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-slate-400 line-through text-sm">{suggestion.originalWord}</span>
                                      <span className="text-slate-300">→</span>
                                      <span className="text-primary font-bold">{suggestion.suggestedWord}</span>
                                    </div>
                                    <p className="text-xs text-slate-500 italic">{suggestion.reason}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>

                  {/* Transcription */}
                  <Card className="border-none shadow-lg bg-white">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                      <div className="flex flex-col">
                        <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-wider">Literal Transcription</CardTitle>
                        <span className="text-[10px] text-slate-400 font-medium italic">Captures exactly what was heard</span>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 gap-2 border-slate-200 text-slate-600 hover:bg-primary hover:text-white transition-all"
                        onClick={handlePlayIdeal}
                        disabled={isPlayingIdeal}
                      >
                        {isPlayingIdeal ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                        Ideal Playback
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <p className="text-lg font-medium text-slate-700 leading-relaxed">
                        "{result.transcription}"
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                  <div className="w-20 h-20 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-6">
                    <Loader2 className={`w-10 h-10 text-slate-200 ${isEvaluating ? 'animate-spin text-primary' : ''}`} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800">
                    {isEvaluating ? "Analyzing your speech..." : "Awaiting Recording"}
                  </h3>
                  <p className="text-slate-500 max-w-xs mt-2">
                    {isEvaluating 
                      ? "Gemini is listening closely to your pronunciation and grammar. This will just take a moment."
                      : "Once you finish recording, click 'Evaluate Speech' to get detailed feedback and your fluency score."}
                  </p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </TabsContent>

        <TabsContent value="input-transcript" className="mt-0">
          <div className="max-w-3xl mx-auto">
            <Card className="border-none shadow-xl bg-white overflow-hidden">
              <CardHeader>
                <CardTitle className="text-2xl font-bold flex items-center gap-3">
                  <BookOpen className="w-6 h-6 text-primary" />
                  Text-to-Voice Studio
                </CardTitle>
                <CardDescription>
                  Paste any English text below and hear how it should be pronounced naturally.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="relative">
                  <textarea
                    value={transcriptInput}
                    onChange={(e) => setTranscriptInput(e.target.value)}
                    maxLength={5000}
                    placeholder="Paste your transcript here (e.g., 'Hello, how are you today? I hope you are having a wonderful time learning English.')"
                    className="w-full h-64 p-6 rounded-2xl bg-slate-50 border-2 border-slate-100 focus:border-primary/30 focus:ring-0 transition-all resize-none text-lg leading-relaxed placeholder:text-slate-300"
                  />
                  <div className="absolute bottom-4 right-4 text-xs font-medium text-slate-400 bg-white/80 backdrop-blur px-2 py-1 rounded-md border border-slate-100">
                    {transcriptInput.length} / 5000 characters
                  </div>
                </div>
                
                {error && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600">
                    <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                    <p className="text-sm">{error}</p>
                  </div>
                )}
              </CardContent>
              <CardFooter className="bg-slate-50/50 border-t border-slate-100 p-6 flex flex-col gap-4">
                <div className="flex gap-3 w-full">
                  <Button 
                    onClick={handleGenerateAudio} 
                    disabled={isGeneratingAudio || !transcriptInput.trim()} 
                    size="lg"
                    className="flex-1 h-14 text-lg font-bold gap-3 shadow-lg shadow-primary/20"
                  >
                    {isGeneratingAudio ? (
                      <>
                        <Loader2 className="w-6 h-6 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-6 h-6" />
                        Generate & Play
                      </>
                    )}
                  </Button>

                  {isAudioPlaying && (
                    <Button
                      onClick={togglePauseResume}
                      variant="outline"
                      size="lg"
                      className="h-14 w-14 border-slate-200 shadow-sm"
                    >
                      {isAudioPaused ? (
                        <Play className="w-6 h-6 fill-current" />
                      ) : (
                        <Pause className="w-6 h-6 fill-current" />
                      )}
                    </Button>
                  )}
                </div>

                {generatedAudioDuration !== null && (
                  <div className="flex items-center justify-center gap-2 text-slate-500 text-sm font-medium">
                    <Clock className="w-4 h-4" />
                    Total Audio Time: {generatedAudioDuration.toFixed(1)}s
                  </div>
                )}
              </CardFooter>
            </Card>
            
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className="text-xs font-medium text-slate-600">Natural Intonation</div>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-500">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className="text-xs font-medium text-slate-600">Clear Pronunciation</div>
              </div>
              <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-500">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className="text-xs font-medium text-slate-600">Perfect Rhythm</div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-0">
              <div className="max-w-4xl mx-auto">
                {!user ? (
                  <Card className="border-none shadow-xl bg-white p-12 text-center">
                    <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
                      <History className="w-10 h-10 text-slate-300" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800 mb-2">Sign in to see your history</h2>
                    <p className="text-slate-500 mb-8 max-w-sm mx-auto">
                      Keep track of your pronunciation progress and revisit past evaluations by signing in with your Google account.
                    </p>
                    <Button onClick={handleSignIn} size="lg" className="gap-2">
                      <LogIn className="w-5 h-5" /> Sign In with Google
                    </Button>
                  </Card>
                ) : isHistoryLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                    <p className="text-slate-500 font-medium">Loading your history...</p>
                  </div>
                ) : history.length === 0 ? (
                  <Card className="border-none shadow-xl bg-white p-12 text-center">
                    <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
                      <BookOpen className="w-10 h-10 text-slate-300" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800 mb-2">No evaluations yet</h2>
                    <p className="text-slate-500 mb-8 max-w-sm mx-auto">
                      Start your first practice session in the Practice Studio to see your history grow!
                    </p>
                    <Button onClick={() => setActiveTab("practice")} size="lg">
                      Go to Practice Studio
                    </Button>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {history.map((item) => (
                      <Card key={item.id} className="border-none shadow-md bg-white hover:shadow-lg transition-shadow cursor-pointer overflow-hidden group" onClick={() => handleViewHistoryItem(item)}>
                        <div className="flex items-center p-4 gap-6">
                          <div className="flex-shrink-0 w-16 h-16 bg-slate-50 rounded-2xl flex flex-col items-center justify-center border border-slate-100">
                            <span className="text-2xl font-bold text-primary">{item.fluencyScore}</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Score</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                {item.createdAt?.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                              <span className="text-slate-300">•</span>
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                {item.createdAt?.toDate().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-slate-700 font-medium truncate italic">"{item.transcription}"</p>
                          </div>
                          <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" className="text-primary font-bold">
                              View Details
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
      </div>
    </div>
  );
}
