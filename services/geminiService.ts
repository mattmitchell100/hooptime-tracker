
import { GoogleGenAI } from "@google/genai";
import { Player, PlayerStats } from "../types";

export const analyzeRotation = async (players: Player[], stats: PlayerStats[]) => {
  // Initialize the Google GenAI client with the API key from environment variables.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const rotationData = players.map(p => {
    const s = stats.find(st => st.playerId === p.id);
    // Fix: Access periodMinutes instead of the non-existent quarterMinutes property.
    // We convert the seconds to minutes to provide more intuitive data for the AI coach.
    const perPeriodMinutes: { [key: string]: number } = {};
    if (s && s.periodMinutes) {
      Object.entries(s.periodMinutes).forEach(([period, seconds]) => {
        perPeriodMinutes[period] = Math.floor(seconds / 60);
      });
    }

    return {
      name: p.name,
      number: p.number,
      totalMinutes: s ? Math.floor(s.totalMinutes / 60) : 0,
      perPeriod: perPeriodMinutes
    };
  });

  const prompt = `
    As a professional basketball head coach, analyze the following rotation data for a game. 
    Identify players who might be overworked, players who didn't get enough time, and suggest improvements for the next game's rotation pattern.
    Keep the tone professional and encouraging.
    
    Data: ${JSON.stringify(rotationData)}
  `;

  try {
    // Use the latest generateContent method with the specified model for basic text analysis.
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    // Extract the text directly from the response object's property.
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Could not generate analysis at this time.";
  }
};
