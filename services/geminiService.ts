import { Player, PlayerStats } from '../types';

export const analyzeRotation = async (players: Player[], stats: PlayerStats[]) => {
  const rotationData = players.map(p => {
    const s = stats.find(st => st.playerId === p.id);
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

  try {
    const response = await fetch('/api/rotation-summary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rotationData
      })
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      return errorPayload?.error || 'Could not generate analysis at this time.';
    }

    const data = await response.json();
    return data?.summary || 'Could not generate analysis at this time.';
  } catch (error) {
    console.error('AI summary error:', error);
    return 'Could not generate analysis at this time.';
  }
};
