import { useState, useRef, useCallback } from 'react';
import { getLiveGenerativeModel, ResponseModality, startAudioConversation } from 'firebase/ai';
import { ai } from '../../firebase/config';

const SYSTEM_INSTRUCTION = `You are NewLeaf AI, a structured options strategy assistant inside the NewLeaf System platform — a disciplined, rules-based options strategy framework.

Your role:
- Help users understand structured options strategies (iron condors, bull put spreads, covered calls, etc.)
- Explain strategy recommendations shown on the platform in plain language
- Answer questions about risk, probability, Greeks (delta, theta, vega, gamma)
- Guide users through the portfolio view and position details
- Explain key metrics like max profit, max loss, break-even, reward:risk ratio
- Provide options strategy education with an emphasis on consistency over prediction

Your personality:
- Professional, calm, and analytical — like a disciplined trading mentor
- Explain complex concepts with clear analogies
- Always emphasize risk management and position sizing
- Never give specific financial advice — frame everything as educational
- Keep responses concise (2-3 sentences for simple questions, more for complex topics)

Important disclaimers:
- You are an educational tool, not a licensed financial advisor
- Always remind users that past performance doesn't guarantee future results
- Encourage users to consult a financial professional for personalized advice`;

export function useVoiceAssistant() {
  const [status, setStatus] = useState('idle'); // idle | connecting | active | error
  const [error, setError] = useState(null);
  const controllerRef = useRef(null);
  const sessionRef = useRef(null);

  const startConversation = useCallback(async () => {
    setError(null);
    setStatus('connecting');

    try {
      const liveModel = getLiveGenerativeModel(ai, {
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        systemInstruction: SYSTEM_INSTRUCTION,
        generationConfig: {
          responseModalities: [ResponseModality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' } // Professional, clear voice
            }
          }
        },
      });

      const session = await liveModel.connect();
      sessionRef.current = session;

      const controller = await startAudioConversation(session);
      controllerRef.current = controller;

      setStatus('active');
    } catch (err) {
      console.error('[VoiceAssistant] Error starting conversation:', err);
      setError(err.message || 'Failed to start voice conversation');
      setStatus('error');
    }
  }, []);

  const stopConversation = useCallback(async () => {
    try {
      if (controllerRef.current) {
        await controllerRef.current.stop();
        controllerRef.current = null;
      }
      if (sessionRef.current) {
        sessionRef.current = null;
      }
    } catch (err) {
      console.error('[VoiceAssistant] Error stopping:', err);
    } finally {
      setStatus('idle');
      setError(null);
    }
  }, []);

  const toggleConversation = useCallback(async () => {
    if (status === 'active') {
      await stopConversation();
    } else if (status === 'idle' || status === 'error') {
      await startConversation();
    }
  }, [status, startConversation, stopConversation]);

  return {
    status,
    error,
    startConversation,
    stopConversation,
    toggleConversation,
  };
}
