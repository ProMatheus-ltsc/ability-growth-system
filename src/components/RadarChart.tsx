import { Radar, RadarChart as ReRadarChart, PolarAngleAxis, PolarGrid, ResponsiveContainer, PolarRadiusAxis } from 'recharts';
import { ResponsiveChart } from '@shared/core';
import type { AbilityRadarSlice } from '../domain/types';

interface Props {
  slices: AbilityRadarSlice[];
  height?: number;
}

export function AbilityRadar({ slices, height = 320 }: Props) {
  const data = slices.map((s) => ({
    dimension: s.label,
    当前: s.score,
    目标: s.targetScore ?? 80,
  }));
  return (
    <ResponsiveChart minHeight={`${Math.max(200, height - 64)}px`} maxHeight={`${height}px`}>
      <ResponsiveContainer width="100%" height="100%">
        <ReRadarChart data={data} outerRadius="80%">
          <PolarGrid stroke="#cbd5e1" />
          <PolarAngleAxis dataKey="dimension" tick={{ fill: '#334155', fontSize: 12 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
          <Radar name="当前" dataKey="当前" stroke="#2563eb" fill="#2563eb" fillOpacity={0.35} />
          <Radar name="目标" dataKey="目标" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} strokeDasharray="4 4" />
        </ReRadarChart>
      </ResponsiveContainer>
    </ResponsiveChart>
  );
}
