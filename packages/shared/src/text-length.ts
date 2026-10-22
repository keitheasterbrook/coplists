import { z } from 'zod';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Characters as a person sees them: an emoji or an accented letter counts as one. */
export function graphemeLength(text: string): number {
  return Array.from(segmenter.segment(text)).length;
}

/** A string of `min`–`max` user-perceived characters; use instead of zod's `.min`/`.max`. */
export function boundedText(min: number, max: number) {
  return z.string().refine(
    (text) => {
      const length = graphemeLength(text);
      return length >= min && length <= max;
    },
    { message: `Must be ${min}–${max} characters` },
  );
}
