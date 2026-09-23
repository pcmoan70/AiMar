// What changed for the user, newest first. Every larger change or new dataset gets an entry here;
// the opening screen shows the entries the user has not seen yet, and the Help panel lists them all.
// Keep each text to two or three sentences; CHANGES.md has the detail.
import type { Lang } from './lib/i18n'

export interface NewsEntry {
  /** stable id, also the marker of what the user has seen */
  id: string
  date: string
  title: Record<Lang, string>
  text: Record<Lang, string>
}

export const WHATS_NEW: NewsEntry[] = [
  {
    id: '2026-09-23-hearings',
    date: '2026-09-23',
    title: { en: 'Applications at public inspection', nb: 'Søknader til offentlig ettersyn' },
    text: {
      en: 'Notices from Norsk lysingsblad are a new overlay, "Public inspection" (Aquaculture tab): red while the deadline for remarks is open, grey after. The Cases panel starts with the open notices and this month\'s new applications from Fiskeridirektoratet\'s list; each notice opens as text, with the attached application where the municipality published one.',
      nb: 'Kunngjøringer fra Norsk lysingsblad er et nytt kartlag, «Offentlig ettersyn» (Akvakultur-fanen): røde mens merknadsfristen løper, grå etterpå. Saker-fanen starter med de åpne kunngjøringene og månedens nye søknader fra Fiskeridirektoratets liste; hver kunngjøring åpnes som tekst, med vedlagt søknad der kommunen har publisert en.',
    },
  },
  {
    id: '2026-09-22-nightly',
    date: '2026-09-22',
    title: { en: 'eInnsyn refreshed every night', nb: 'eInnsyn oppdateres hver natt' },
    text: {
      en: 'Journal entries, published files and their searchable text are now fetched nightly, and updated entries are re-read for new attachments.',
      nb: 'Journalposter, publiserte filer og den søkbare teksten deres hentes nå hver natt, og oppdaterte poster leses på nytt for nye vedlegg.',
    },
  },
  {
    id: '2026-09-17-archive-2010',
    date: '2026-09-17',
    title: { en: 'Case history back to 2010', nb: 'Saksgang tilbake til 2010' },
    text: {
      en: 'The eInnsyn archive now holds 134 000 entries from 2010 on, with 8 500 documents readable as text. A site\'s panel also lists every enabled overlay\'s value at the farm ("At this site"), traffic as the busiest lane within 1 km.',
      nb: 'eInnsyn-arkivet har nå 134 000 poster fra 2010 og fram, med 8 500 dokumenter lesbare som tekst. Detaljpanelet lister også verdien til hvert påslåtte kartlag ved anlegget («Ved anlegget»), trafikk som travleste led innen 1 km.',
    },
  },
  {
    id: '2026-09-16-climatology',
    date: '2026-09-16',
    title: { en: 'Wave and wind normals with direction', nb: 'Bølge- og vindnormaler med retning' },
    text: {
      en: 'Monthly normals for wave height and wind (Ocean tab) have a month selector on the map; waves show direction arrows with the 90th percentile as thickness, wind is drawn as weather-chart wind barbs. Measured currents from survey reports are on the map too.',
      nb: 'Månedsnormaler for bølgehøyde og vind (Hav-fanen) har månedsvelger på kartet; bølger vises med retningspiler der tykkelsen er 90-prosentilen, vind tegnes som vindfjær fra værkart. Målte strømmer fra strømrapporter ligger også i kartet.',
    },
  },
]
