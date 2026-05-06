import { GoogleGenAI, Type, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface EvaluationResult {
  transcription: string;
  fluencyScore: number;
  pronunciationTips: {
    word: string;
    tip: string;
    phonetic?: string;
  }[];
  grammarFeedback: string;
  vocabularyFeedback: string;
  vocabularySuggestions?: {
    originalWord: string;
    suggestedWord: string;
    reason: string;
  }[];
  overallFeedback: string;
}

export async function evaluateSpeech(audioBase64: string, mimeType: string): Promise<EvaluationResult> {
  const prompt = `
    You are an expert English language coach and phonetician. 
    Analyze the provided audio of a student speaking English with extreme precision.
    
    CRITICAL INSTRUCTIONS:
    1. HONEST TRANSCRIPTION: Provide a   literal transcription of exactly what was said. Do NOT "clean up" or "correct" the user's speech. If they mispronounce a word so badly it sounds like a different word, transcribe what it sounded like or the intended word with a note. If they stumble or repeat, include it.
    2. STRICT SCORING: The fluencyScore (0-100) must be a rigorous assessment. 
       - Deduct points heavily for: mispronunciations, long pauses, unnatural rhythm, and lack of clarity.
       - If the user "spells" or pronounces most words incorrectly, the score should be below 40.
       - A score of 90+ is reserved for near-native clarity and flow.
    3. PHONETIC ANALYSIS: In pronunciationTips, identify every word that was not pronounced correctly. Provide the word, a specific tip on what went wrong (e.g., "vowel was too short", "wrong syllable stressed"), and the correct IPA phonetic representation.
    4. VOCABULARY UPGRADE: In vocabularySuggestions, identify simple or repetitive words used and suggest more sophisticated or contextually appropriate alternatives. For each, provide the original word, the suggested replacement, and a brief reason why it's better.
    5. FEEDBACK: Be constructive but honest. If the speech was difficult to understand, say so in the overallFeedback.
    
    Return the response in strict JSON format.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: audioBase64,
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          transcription: { type: Type.STRING },
          fluencyScore: { type: Type.NUMBER },
          pronunciationTips: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                tip: { type: Type.STRING },
                phonetic: { type: Type.STRING },
              },
              required: ["word", "tip"],
            },
          },
          grammarFeedback: { type: Type.STRING },
          vocabularyFeedback: { type: Type.STRING },
          vocabularySuggestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                originalWord: { type: Type.STRING },
                suggestedWord: { type: Type.STRING },
                reason: { type: Type.STRING },
              },
              required: ["originalWord", "suggestedWord", "reason"],
            },
          },
          overallFeedback: { type: Type.STRING },
        },
        required: ["transcription", "fluencyScore", "pronunciationTips", "grammarFeedback", "vocabularyFeedback", "overallFeedback"],
      },
    },
  });

  try {
    const text = response.text || "{}";
    const result = JSON.parse(text);
    return result as EvaluationResult;
  } catch (error) {
    console.error("Failed to parse Gemini response:", error);
    throw new Error("Failed to evaluate speech. Please try again.");
  }
}

export async function speakWord(word: string): Promise<string> {
  return speakText(`Pronounce clearly: ${word}`);
}

export async function speakTranscript(text: string): Promise<string> {
  return speakText(`Read this transcript naturally and clearly: ${text}`);
}

async function speakText(text: string): Promise<string> {
  try {
    console.log("Gemini TTS Request text length:", text.length);
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO], 
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    console.log("Gemini TTS Response received. Candidates:", response.candidates?.length);
    
    // Check for finish reason if it failed
    if (response.candidates?.[0]?.finishReason && response.candidates[0].finishReason !== 'STOP') {
      console.warn("Gemini TTS finishReason:", response.candidates[0].finishReason);
    }

    // Defensive check for response structure
    const part = response.candidates?.[0]?.content?.parts?.[0];
    const base64Audio = part?.inlineData?.data;
    
    if (!base64Audio) {
      console.error("Gemini TTS response missing audio data. Full response structure:", {
        candidatesCount: response.candidates?.length,
        hasContent: !!response.candidates?.[0]?.content,
        hasParts: !!response.candidates?.[0]?.content?.parts,
        finishReason: response.candidates?.[0]?.finishReason,
      });
      throw new Error("The audio service returned an empty response. This can happen if the transcription is too long or contains unusual characters.");
    }
    
    return base64Audio;
  } catch (error) {
    console.error("Error in Gemini TTS:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage.includes("404") || errorMessage.includes("not found")) {
      throw new Error("The text-to-voice service is currently unavailable in your region. We are working to restore it.");
    }
    
    if (errorMessage.includes("429") || errorMessage.includes("quota")) {
      throw new Error("You've reached the generation limit. Please wait a moment and try again.");
    }

    throw new Error(`Speech generation failed: ${errorMessage}`);
  }
}
