"use client";
import { Waveform } from "@/components/visuals";

export function MiniWave({ peaks, hue }: { peaks: number[] | null; hue: number }) {
  return <div style={{ pointerEvents: "none" }}><Waveform peaks={peaks} progress={0} duration={0} height={40} hue={hue} active={false} /></div>;
}
