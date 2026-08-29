// BackgroundOrb has been retired in favour of SectionAura — a glow anchored
// safely behind each section's content rather than a roaming orb that
// obscured text. This file is kept only as a compatibility re-export so any
// stray import doesn't break the build; nothing should import it directly.
export { SectionAura as BackgroundOrb } from "./SectionAura";
