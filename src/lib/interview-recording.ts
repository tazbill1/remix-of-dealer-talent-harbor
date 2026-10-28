import { z } from 'zod';
export const RETENTION_DAYS = [30,60,90,180] as const;
export const recordingConsentText = (days:number) => `Before we start, this interview will be recorded and transcribed to help us take accurate notes. Only our hiring team will hear it, and the audio is deleted after ${days} days. Is that OK with you?`;
export const suggestionSchema = z.object({ suggestions:z.array(z.object({questionId:z.string(),score:z.number().nullable(),evidence:z.string().nullable()})) });
export type Suggestion = {questionId:string;score:number;evidence:string};
export function validSuggestions(raw:unknown,transcript:string,ids:string[]):Suggestion[] {
 const parsed=suggestionSchema.safeParse(raw); if(!parsed.success)return [];
 return parsed.data.suggestions.flatMap(s=>s.score!==null&&Number.isInteger(s.score)&&s.score>=1&&s.score<=5&&s.evidence&&transcript.includes(s.evidence)&&ids.includes(s.questionId)?[{questionId:s.questionId,score:s.score,evidence:s.evidence}]:[]);
}
