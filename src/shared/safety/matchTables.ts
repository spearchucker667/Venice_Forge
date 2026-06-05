/**
 * @fileoverview Match tables for the child exploitation safety guard.
 *
 * These are blocking-pattern definitions for content moderation. They are
 * module-private to src/shared/safety/ — never logged, displayed, or
 * re-exported outside of the safety surface.
 *
 * No raw prompt text, matched terms, or snippets are ever derived from
 * these tables for logging.
 */

// ============================================================================
// Direct CSAM markers
// ============================================================================

/** Genre labels used specifically for drawn/animated child sexual abuse material. */
export const CSAM_GENRE_LABELS: readonly string[] = [
  "loli", "lolicon", "lolita", "shota", "shotacon",
];

/** Explicit abuse/exploitation material terms. */
export const CSAM_EXPLICIT_PATTERNS: readonly RegExp[] = [
  /\bcsam\b/i,
  /\bchild\s*porn(?:ography)?\b/i,
  /\bkid\s*porn(?:ography)?\b/i,
  /\bpedo(?:phile|philia|philes)?\b/i,
  /\bephebophile\b/i,
  /\bcp\s+(?:image|video|content|collection)\b/i,
  /\bminor\s*(?:nud(?:e|ity)|sex(?:ual)?|porn)\b/i,
  /\bunderage\s*(?:nud(?:e|ity)|sex(?:ual)?|porn)\b/i,
  /\bchild\s+prostitut(?:e|es|ion)\b/i,
  /\bkid\s+prostitut(?:e|es|ion)\b/i,
  /\bminor\s+prostitut(?:e|es|ion)\b/i,
];

// ============================================================================
// Exploitation / coercion patterns
// ============================================================================

/** Grooming and exploitation behavioral patterns. */
export const GROOMING_PATTERNS: readonly RegExp[] = [
  /\b(?:groom(?:ing)?)\s+(?:a\s+)?(?:child|minor|kid|teen|boy|girl)\b/i,
  /\b(?:solicit(?:ing)?)\s+(?:a\s+)?(?:child|minor|kid|teen)\b/i,
  /\bexploit(?:ing|ation\s+of)\s+(?:child(?:ren)?|minor|kid)\b/i,
  /\blure\s+(?:a\s+)?(?:child|minor|kid|teen)\b/i,
  /\btraffick(?:ing)?\s+(?:of\s+)?(?:child(?:ren)?|minor|kid)\b/i,
  // Sexual violence targeting minors
  /\b(?:rape|raping|raped)\s+(?:a\s+)?(?:child|minor|kid|teen|boy|girl)\b/i,
  /\b(?:molest(?:ing|ed)?)\s+(?:a\s+)?(?:child|minor|kid|teen|boy|girl)\b/i,
  /\bsexual(?:ly)?\s+assault(?:ing|ed)?\s+(?:a\s+)?(?:child|minor|kid|teen|boy|girl)\b/i,
  /\b(?:kidnap|kidnapping|abduct(?:ing)?)\s+(?:a\s+)?(?:child|minor|kid|teen|boy|girl)\b/i,
];

/** Terms indicating intent to evade age verification or reclassify minors as adults. */
export const AGE_EVASION_PATTERNS: readonly RegExp[] = [
  /\b(?:looks?\s+(?:young(?:er)?|like\s+a\s+(?:kid|child|minor))\s+but\s+(?:is\s+)?(?:actually\s+)?(?:18|adult))\b/i,
  /\b(?:technically|legally|officially)\s+18\b/i,
  /\b(?:pretend|imagine|assume)\s+(?:she|he|they)\s+(?:is|are|was|were)\s+(?:18|an?\s+adult)\b/i,
  /\b(?:age\s+up|make\s+(?:her|him|them)\s+(?:18|adult))\b/i,
  /\bignore\s+(?:the\s+)?age\b/i,
];

// ============================================================================
// Adult context allowlist — checked BEFORE any sexualization blocks.
// These signals indicate the subject is clearly an adult.
// Must NEVER contain any youth/minor term.
// ============================================================================

/**
 * Exact terms that establish a clearly adult subject.
 * Word-boundary matched via matchesTerms().
 */
export const ADULT_EXACT_SIGNALS: readonly string[] = [
  "adult woman", "adult women", "adult man", "adult men",
  "adult female", "adult male",
  "mature woman", "mature man", "mature female", "mature male",
  "grown woman", "grown man",
  "consensual", "consenting adult", "consenting adults",
  "legal adult", "legal adults", "lawful adult", "lawful adults",
  "of age", "of legal age", "of consent",
  // Adult-coded / fetish terms (legal adult only)
  "milf", "gilf", "cougar", "babe", "hottie",
];

/**
 * Regex patterns that establish a clearly adult subject — numeric age ≥ 18
 * or unambiguous adult framing. Applied to the digit-preserving normAges string.
 */
export const ADULT_REGEX_SIGNALS: readonly RegExp[] = [
  // Explicit numeric age ≥ 18 immediately followed by woman/man/female/male/person
  /\b(1[89]|[2-9]\d|\d{3,})\s*(?:year|yo|y\/o|yr)\s*(?:old\s*)?(?:woman|man|female|male|person|lady|gentleman|adult|guy)\b/i,
  // "a 25-year-old woman", "30 year old man"
  /\b(1[89]|[2-9]\d|\d{3,})\s*[-\u2013]?\s*year\s*[-\u2013]?\s*old\s+(?:woman|man|female|male|person|lady|guy|adult)\b/i,
  // "sexy woman", "erotic female", "naked woman" — person noun is explicitly adult-gendered
  /\b(?:sexy|erotic|sensual|aroused|seductive|horny|naughty|slutty|thirsty)\s+(?:woman|man|female|male|lady|gentleman|guy|model)\b/i,
  // "adult pornographic", "adult explicit" — paired with 'adult' qualifier
  /\badult\s+(?:pornographic|explicit|sexual|erotic|nude|naked|content|man|woman|male|female)\b/i,
  // "of age" / "over 18" / "older than 18" / "above 18"
  /\b(?:over|above|older\s+than)\s+(?:1[89]|[2-9]\d|\d{3,})\b/i,
  // "21+ woman", "18+ content"  — age-verification flag
  /\b(1[89]|[2-9]\d|\d{3,})\+\s*(?:woman|man|adult|content|only)\b/i,
  // "a 25 yo" or "a 25 y/o"  — bare adult age as a subject anchor (followed by no youth term)
  // Note: this is a weaker signal, so it is only consulted via hasAdultContext which is
  // combined with the no-minor-age / no-hard-youth / no-k12 checks below.
  /\b(?:she|he|they|the\s+(?:model|subject|person))\s+is\s+(?:1[89]|[2-9]\d|\d{3,})\b/i,
];

// ============================================================================
// Sexualization + youth indicators
// ============================================================================

/** Explicit sexualization signals — request for nude/explicit adult content.
 *  These are conservative; clinical/educational terms are intentionally excluded. */
export const SEXUALIZATION_SIGNALS: readonly string[] = [
  "nude", "naked", "nsfw",
  // "explicit" as standalone — catches "explicit 12-year-old", "explicit fourteen year old"
  "explicit", "explicit content", "explicit image", "explicit video",
  "explicit photo", "adult content", "pornographic", "pornography", "xxx", "hentai",
  "sexual content", "sexual image", "sexual photo", "sexual video",
  // Sexual abuse — catches "sexual abuse of a child", "sexually abused minor"
  "sexual abuse", "sexually abuse", "sexually abused",
  "undress", "undressed",
  // Sexual-intent descriptors — included so terms like "sexy teen" also trigger youth-protection
  "sexy", "erotic", "sensual", "seductive", "aroused",
  // Sexual violence terms — catching these with youth signals is critical
  "rape", "raped", "raping", "rapes", "molest", "molested", "molesting", "molestation", "molests",
  "sexual assault", "sexually assault", "sexually assaulted", "sexually assaulting", "sexual assaults",
];

/** Regex-based sexualization signals for phrase detection. */
export const SEXUALIZATION_PATTERNS: readonly RegExp[] = [
  /\b(?:take\s+off|remove)\s+(?:her|his|their)\s+(?:clothes|clothing|top|shirt)\b/i,
  /\b(?:topless|braless|bottomless)\b/i,
  /\b(?:full\s+frontal|full\s+nude|full\s+naked)\b/i,
  /\b(?:genital|genitals|privates)\b/i,
];

/** Terms indicating hard minor/underage status. */
export const HARD_YOUTH_TERMS: readonly string[] = [
  "child", "children", "minor", "minors", "underage", "preteen", "preteens",
  "kid", "kids", "tween", "tweens",
  "schoolgirl", "school girl", "schoolboy", "school boy",
  "babysitter", "babysit",
  "baby", "babies", "toddler", "toddlers",
  "juvenile", "juveniles", "adolescent", "adolescents",
];

/** Terms indicating ambiguous or soft youth status. */
export const AMBIGUOUS_YOUTH_TERMS: readonly string[] = [
  "teen", "teens", "teenager", "teenagers", "teenage",
  "jailbait", "barely legal", "young-looking", "youthful",
  "school uniform", "childlike", "child-like", "nubile",
  "boy", "boys", "girl", "girls",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
];

/** Patterns indicating K-12 school context. */
export const SCHOOL_K12_PATTERNS: readonly RegExp[] = [
  /\b(?:kindergarten|kinder)\b/i,
  /\b(?:1st|2nd|3rd|[4-9]th|10th|11th|12th)\s*grade\b/i,
  /\b(?:elementary\s*school(?:er?)?)\b/i,
  /\b(?:middle\s*school|junior\s*high)\b/i,
  /\b(?:jr\.?\s*high)\b/i,
];

/** Fictional/drawn framing patterns that do not exempt content from blocking. */
export const FICTIONAL_FRAME_TERMS: readonly string[] = [
  "fictional", "animated", "cartoon", "anime", "manga", "drawn", "illustrated",
  "fantasy", "hentai",
];

/** Injection and bypass attempt patterns. */
export const INJECTION_BYPASS_PATTERNS: readonly RegExp[] = [
  /\bjailbreak\b/i,
  /\bbypass\s+(?:filter|safety|guard|check|rule|policy)\b/i,
  /\bignore\s+(?:all\s+)?(?:previous|prior|safety|content)\s*(?:instructions?|rules?|filters?|guidelines?)?\b/i,
  /\bdisable\s+(?:safety|content|filter|guard)\b/i,
  /\boverride\s+(?:safety|filter|rule|policy)\b/i,
  /\bact\s+as\s+if\s+(?:there\s+(?:are|is)\s+no\s+(?:rules?|restrictions?|filter))\b/i,
  /\bpretend\s+you\s+(?:have\s+no|don't\s+have|don't\s+need)\s+(?:safety|filter|rules?)\b/i,
  /\b(?:DAN|STAN|AIM)\b/,
  /\bdisregard\s+(?:your\s+)?(?:previous|prior|all)\s*(?:instructions?|guidelines?|rules?)?\b/i,
  /\breset\s+(?:your\s+)?(?:context|instructions?)\b/i,
];

/** Safe context markers indicating child protection/prevention/policy intent. */
export const SAFE_CONTEXT_TERMS: readonly string[] = [
  "abuse prevention", "prevent abuse", "preventing abuse",
  "child protection", "child safety", "child welfare", "child safeguarding",
  "protect children", "protecting children", "keep children safe",
  "mandatory reporter", "mandated reporter",
  "safeguarding children", "safeguarding minors",
  "report abuse", "reporting abuse", "abuse reporting", "abuse report",
  "ncmec", "icac", "interpol", "law enforcement investigation",
  "criminal investigation", "forensic evidence",
  "content moderation", "content safety", "age verification",
  "parental controls", "online safety", "internet safety",
  "anti-trafficking", "human trafficking awareness",
  "csam detection", "csam classifier", "safety filter", "safety classifier",
  "safety policy", "child safety policy",
  "physical education", "sex education", "reproductive health",
  "guardian", "caregiver", "social worker", "child protective",
  // Educational / developmental contexts
  "teach children", "teaching children", "teaching kids",
  "educate children", "educating children", "child development",
  "youth program", "youth programs", "youth ministry", "youth group",
  "after-school program", "mentorship program", "tutoring program",
  "child psychology", "developmental psychology",
  "age-appropriate", "age appropriate",
  "pediatric", "paediatrician", "child therapist",
  "teen pregnancy prevention", "teenage pregnancy prevention",
];

/** Safe context regex patterns. */
export const SAFE_CONTEXT_PATTERNS: readonly RegExp[] = [
  /\bprotect(?:ing|ion|ive)?\s+(?:children|minors|kids|youth)\b/i,
  /\b(?:prevent(?:ing)?|prevention)\s+(?:child|minor|youth)\s+(?:abuse|exploitation|trafficking)\b/i,
  /\b(?:child|minor|youth)\s+(?:abuse\s+)?(?:prevention|protection|welfare|safety)\b/i,
  /\bmandatory\s+reporter\b/i,
  /\breport(?:ing)?\s+(?:suspected\s+)?(?:child|minor|youth)\s+abuse\b/i,
  /\blaw\s+enforcement\b/i,
  /\bforensic\s+interview\b/i,
  /\bsafeguarding\b/i,
  /\bNCMEC\b/i,
  /\bparental\s+(?:control|guidance)\b/i,
  /\bonline\s+safety\s+(?:for\s+)?(?:children|minors|kids)\b/i,
  /\bcontent\s+(?:moderation|filter|safety)\b/i,
  /\bage\s+(?:verification|appropriate|rating)\b/i,
];

/** Age patterns for extracting explicit numeric ages.
 *  Applied to the digit-preserving `normAges` view. */
export const AGE_EXTRACTION_PATTERNS: readonly RegExp[] = [
  /\b(\d{1,2})\s*(?:yo|y\/o|yrs?\s*old|years?\s*old)\b/gi,
  /\baged?\s*[:=]?\s*(\d{1,2})\b/gi,
  /\b(\d{1,2})\s*[-\u2013]?\s*year\s*[-\u2013]?\s*old\b/gi,
  // Bare number preceded by "is" or "was" in explicit age declaration context
  /\b(?:is|was|am|are|were)\s+(\d{1,2})\s*(?:[,.]|$)/gim,
];

/** Pattern matching written-out minor ages followed by age-context words.
 *  Covers English word-numerals one–seventeen (e.g. "twelve year old", "ten-year-old",
 *  "aged fourteen"). Note: "thirteen"–"seventeen" overlap with AMBIGUOUS_YOUTH_TERMS but this
 *  pattern anchors them as explicit age markers.
 *  BUG-FIX (AUDIT-BUG-1): Closes the false-negative where "nude twelve year old" was not
 *  blocked because AGE_EXTRACTION_PATTERNS only matches digits.
 *  Matched against the leet-folded `norm` view (letters only, no digit destruction risk). */
export const MINOR_WRITTEN_AGE_PATTERNS: readonly RegExp[] = [
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)\s*(?:[-–]\s*)?(?:year|yr)s?\s*(?:[-–]\s*)?old\b/gi,
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)\s*(?:yo|y\/o)\b/gi,
  /\baged?\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)\b/gi,
];
