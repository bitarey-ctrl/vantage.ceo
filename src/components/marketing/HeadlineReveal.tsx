'use client';

import { createContext, useContext, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

export const MarketingMotionContext = createContext<{
  motionEnabled: boolean;
  setMotionEnabled: Dispatch<SetStateAction<boolean>>;
} | null>(null);

export function useMarketingMotion() {
  const motion = useContext(MarketingMotionContext);
  if (!motion) throw new Error('Marketing motion requires MarketingShell');
  return motion;
}

export function useHeadlineReveal(scope: RefObject<HTMLDivElement | null>, enabled: boolean, pathname: string) {
  useGSAP(() => {
    if (!enabled) return;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const headings = scope.current?.querySelectorAll<HTMLElement>('main h1, main h2');
      headings?.forEach(heading => {
        // Product previews retain their real workspace typography and interactions.
        if (heading.matches('.vs-story-statement') || heading.closest('.vd-shell, .vd-phone') || parseFloat(getComputedStyle(heading).fontSize) < 32) return;
        const accessibleText = heading.innerText.replace(/\s+/g, ' ').trim();
        SplitText.create(heading, {
          type: 'words,chars',
          tag: 'span',
          wordsClass: 'vs-heading-word',
          charsClass: 'vs-heading-char',
          aria: 'auto',
          autoSplit: true,
          onSplit(split) {
            heading.setAttribute('aria-label', accessibleText);
            gsap.set(split.chars, { '--vs-story-enter': '0%', '--vs-story-settle': '0%' });
            const hero = heading.closest('.vs-hero-copy, .vs-page-hero');
            const timeline = gsap.timeline(hero ? { delay: .2 } : {
              scrollTrigger: { trigger: heading, start: 'top 85%', end: 'bottom 45%', scrub: .4 },
            });
            return timeline
              .to(split.chars, { '--vs-story-enter': '100%', duration: .16, stagger: .018, ease: 'none' }, 0)
              .to(split.chars, { '--vs-story-settle': '100%', duration: .2, stagger: .018, ease: 'none' }, .18);
          },
        });
      });
    });
    return () => media.revert();
  }, { scope, dependencies: [enabled, pathname], revertOnUpdate: true });
}
