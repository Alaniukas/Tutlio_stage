/**
 * Customer logos shown in the landing marquee. Shared by the v1 hero
 * (still used by /schools) and the v2 logo wall.
 *
 * `invert: false` — full-colour logo, do not run through brightness/invert.
 */
export interface CustomerLogo {
  src: string;
  alt: string;
  invert?: boolean;
}

export const CUSTOMER_LOGOS: CustomerLogo[] = [
  { src: '/wyzant-logo-reversed2x.png', alt: 'Wyzant' },
  { src: '/672a303d02b19dab2f248fd9_iTutor-logo.svg', alt: 'iTutor' },
  { src: '/hey_tutor_logo_2026.webp', alt: 'HeyTutor' },
  { src: '/602428438327a78cb4e7fcb3_learnerlogo.svg', alt: 'Learner' },
  { src: '/67cab891e121bff1e23d95eb_66ad096240b243e78bd71431_Fullmind-logo-plum-on-clear (1) 1.png', alt: 'Fullmind' },
  { src: '/moku-moku-logo.png', alt: 'Moku Moku', invert: false },
  { src: '/logo.png', alt: 'Tutlio' },
  { src: '/tut_logo.svg', alt: 'Tut' },
];
